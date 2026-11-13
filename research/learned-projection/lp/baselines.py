"""Baselines (task §5.3): B2, STD, RIDGE (and the incumbent B1/B1c season columns), plus the P(plays) baseline.
Every feature is read through `asof.view` — never the raw tables.
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from . import asof, splits

STD_K = 3
RELEVANT_K = {"QB": 24, "RB": 48, "WR": 60, "TE": 24}
POSITIONS = ("QB", "RB", "WR", "TE")


# ── populations ─────────────────────────────────────────────────────────────────────────────────────────────
def season_targets(tables, T):
    """The ex-ante season universe of season T joined to its benchmarks; `actual` = the outcome (0 with no row)."""
    s = tables.seasons
    s = s[(s["S"] == T) & s["inSeasonUniverse"]]
    b = tables.bench[tables.bench["S"] == T].drop(columns=["position"])
    df = s.merge(b, on=["pid", "S"], how="left")
    df["actual"] = df["fantasyPoints"].astype(float)
    df["stratum"] = np.where(df["b2_ppg"].notna(), "V", "N")
    r13 = (df["draftYear"] == T) & df["draftRound"].between(1, 3)
    df["headline"] = (df["stratum"] == "V") | r13
    df["b1_covered"] = df["b1_covered"].fillna(False).astype(bool) & df["b1_total"].notna()
    return df.reset_index(drop=True)


# ── ridge machinery ─────────────────────────────────────────────────────────────────────────────────────────
def _prep(X, med, miss_cols):
    nanm = np.isnan(X)
    Xi = np.where(nanm, med, X)
    return np.hstack([Xi, nanm[:, miss_cols].astype(float)])


def ridge_fit_predict(Xtr, ytr, seasons_tr, Xte, T, alphas=splits.INNER_ALPHAS):
    """Median-impute (with a missing-indicator column) from TRAINING rows; α by inner selection on the last two training seasons
    (fit on seasons <= T-3, validate on T-2, T-1); refit on all training rows. Returns (predictions, chosen alpha)."""
    Xtr, Xte = np.asarray(Xtr, float), np.asarray(Xte, float)
    ytr, seasons_tr = np.asarray(ytr, float), np.asarray(seasons_tr)
    with np.errstate(all="ignore"):
        med = np.nanmedian(Xtr, axis=0)
    med = np.where(np.isnan(med), 0.0, med)
    miss_cols = [j for j in range(Xtr.shape[1]) if np.isnan(Xtr[:, j]).any()]
    Ptr, Pte = _prep(Xtr, med, miss_cols), _prep(Xte, med, miss_cols)
    sc = StandardScaler().fit(Ptr)
    Ztr, Zte = sc.transform(Ptr), sc.transform(Pte)
    inner_tr, inner_val = splits.inner_split(T)
    mtr, mva = np.isin(seasons_tr, inner_tr), np.isin(seasons_tr, inner_val)
    alpha = 10.0
    if mtr.sum() >= 10 and mva.sum() >= 10:
        best = None
        for a in alphas:
            m = Ridge(alpha=a).fit(Ztr[mtr], ytr[mtr])
            mae = np.abs(m.predict(Ztr[mva]) - ytr[mva]).mean()
            if best is None or mae < best[0] - 1e-12:
                best = (mae, a)
        alpha = best[1]
    model = Ridge(alpha=alpha).fit(Ztr, ytr)
    return model.predict(Zte), alpha


# ── season layer ────────────────────────────────────────────────────────────────────────────────────────────
def season_features(v, pids):
    """Ridge inputs for season S = v.S at origin (S, 0): S-1 and S-2 league PPG and games share, age, age², draft round,
    S-1 offPct. Reads only seasons < S plus the S row's age/draft/team/teamGames."""
    S = v.S
    prev = v.seasons
    out = pd.DataFrame({"pid": list(pids)})
    for lag in (1, 2):
        p = prev[prev["S"] == S - lag].set_index("pid")
        has = p["hasRow"].reindex(out["pid"]).fillna(False).to_numpy(bool)
        gp = p["gamesPlayed"].reindex(out["pid"]).to_numpy(float)
        fp = p["fantasyPoints"].reindex(out["pid"]).to_numpy(float)
        tg = p["teamGames"].reindex(out["pid"]).to_numpy(float)
        with np.errstate(all="ignore"):
            out["ppg%d" % lag] = np.where(has & (gp > 0), fp / gp, np.nan)
            out["gs%d" % lag] = np.where(has, gp / tg, np.nan)
        if lag == 1:
            out["offPct1"] = np.where(has, p["offPct"].reindex(out["pid"]).to_numpy(float), np.nan)
    cur = v.season_row.set_index("pid")
    age = cur["age"].reindex(out["pid"]).to_numpy(float)
    out["age"], out["age2"] = age, age ** 2
    out["draftRound"] = cur["draftRound"].reindex(out["pid"]).to_numpy(float)
    return out


SEASON_FEATS = ["ppg1", "gs1", "ppg2", "gs2", "age", "age2", "draftRound", "offPct1"]


def season_forecasts(tables, T):
    """Forecast frame for test season T: columns pid, position, headline, stratum, b1_covered, actual, b1, b1c, b2, ridge."""
    tgt = season_targets(tables, T)
    train = []
    for S in splits.train_seasons(T):
        d = season_targets(tables, S)
        f = season_features(asof.view(tables, S, 0), d["pid"])
        d = d.drop(columns=["age", "draftRound"]).merge(f, on="pid")
        train.append(d[d["headline"]])
    tr = pd.concat(train, ignore_index=True)
    splits.assert_train_only(tr, T)
    ft = season_features(asof.view(tables, T, 0), tgt["pid"])
    tgt = tgt.drop(columns=["age", "draftRound"]).merge(ft, on="pid")
    tgt["b1"] = tgt["b1_total"]
    tgt["b2"] = tgt["b2_total"]
    tgt["b1c"] = np.nan
    tgt["ridge"] = np.nan
    tgt["c"] = np.nan
    for pos in POSITIONS:
        m = tgt["position"] == pos
        t = tr[(tr["position"] == pos)]
        # B1c: c = median(actual / b1.total) over B1-covered headline rows of the TRAINING seasons, both > 0
        cov = t[t["b1_covered"] & (t["actual"] > 0) & (t["b1_total"] > 0)]
        c = float(np.median(cov["actual"] / cov["b1_total"])) if len(cov) else np.nan
        tgt.loc[m, "c"] = c
        tgt.loc[m, "b1c"] = c * tgt.loc[m, "b1_total"]
        if len(t) >= 20 and m.any():
            pred, _ = ridge_fit_predict(t[SEASON_FEATS].to_numpy(), t["actual"].to_numpy(), t["S"].to_numpy(), tgt.loc[m, SEASON_FEATS].to_numpy(), T)
            tgt.loc[m, "ridge"] = pred
    tgt["T"] = T
    return tgt


# ── weekly layer ────────────────────────────────────────────────────────────────────────────────────────────
def weekly_inputs(v, targets):
    """Per-target inputs at origin v = (S, n) for the week n+1 rows in `targets` (pid, team, home, position). Reads only the view:
    played weeks of S through n (pts, opportunity), the season prior, the team schedule and `played` flags of earlier weeks."""
    S, n = v.S, v.n
    wk = v.weeks
    cur = wk[(wk["S"] == S) & wk["played"]].copy()
    tm = v.teams.set_index(["team", "S", "w"])
    tot = (tm["sum_rec_tgt"] + tm["sum_rush_att"]).to_dict()
    opp = []
    for pos, team, w, rt, ra, pa in zip(cur["position"], cur["team"], cur["w"], cur["rec_tgt"], cur["rush_att"], cur["pass_att"]):
        if pos == "QB":
            opp.append(pa + ra)
        else:
            den = tot.get((team, S, w), 0)
            opp.append((rt + ra) / den if den > 0 else np.nan)
    cur["opp"] = opp
    cur = cur.sort_values(["pid", "w"])
    g = cur.groupby("pid")
    agg = pd.DataFrame({
        "n": g["pts"].size(), "sum_pts": g["pts"].sum(),
        "last3_pts": g["pts"].agg(lambda s: s.tail(3).mean()),
        "last3_opp": g["opp"].agg(lambda s: s.dropna().tail(3).mean() if s.notna().any() else np.nan),
    })
    out = targets[["pid"]].merge(agg, left_on="pid", right_index=True, how="left")
    out["n"] = out["n"].fillna(0)
    out["sum_pts"] = out["sum_pts"].fillna(0.0)
    out["prior_b2"] = out["pid"].map(v.prior)
    # P(plays): played in the player's previous team-game week; week 1 (or a team's first game): last season's games share, 0.5 if none
    tw = v.team_weeks
    team_weeks = {t: sorted(x["w"]) for t, x in tw.groupby("team")}
    played_row = {(r.pid, r.w) for r in wk[(wk["S"] == S) & wk["played"]].itertuples()}
    prev = v.seasons[v.seasons["S"] == S - 1].set_index("pid")
    pp = []
    for pid, team, w in zip(targets["pid"], targets["team"], targets["w"]):
        weeks = [x for x in team_weeks.get(team, []) if x < w]
        if weeks and n >= 1:
            pp.append(1.0 if (pid, weeks[-1]) in played_row else 0.0)
        elif pid in prev.index and prev.loc[pid, "hasRow"] and prev.loc[pid, "teamGames"] > 0:
            pp.append(float(prev.loc[pid, "gamesPlayed"] / prev.loc[pid, "teamGames"]))
        else:
            pp.append(0.5)
    out["p_plays"] = pp
    out["home"] = targets["home"].astype(float).to_numpy()
    return out


def build_weekly_frame(tables, seasons=range(2014, 2026), log=lambda m: None):
    """One row per (S, w, pid) of the weekly universe with the as-of inputs of its origin (S, w-1)."""
    frames = []
    for S in seasons:
        v0 = asof.view(tables, S, 0).schedule
        for w in sorted(v0.loc[v0["inUniverse"].astype(bool), "w"].unique()):
            v = asof.view(tables, S, w - 1)
            sc = v.schedule
            tgt = sc[(sc["w"] == w) & sc["inUniverse"].astype(bool)]      # week-(n+1) targets come from the view, never the raw table
            inp = weekly_inputs(v, tgt)
            frames.append(tgt.merge(inp.drop(columns=["home"]), on="pid"))
        log("weekly inputs S=%d" % S)
    wf = pd.concat(frames, ignore_index=True)
    w = tables.weeks[["pid", "S", "w", "played", "pts", "cohort"]]
    wf = wf.merge(w, on=["pid", "S", "w"], how="left")
    wf["actual0"] = np.where(wf["played"], wf["pts"], 0.0)
    wf["home"] = wf["home"].astype(float)
    return wf


WEEKLY_FEATS = ["std", "prior", "n", "last3_pts", "last3_opp", "home"]


def add_std(df, pos_mean):
    """STD: mean pts over played weeks < w of S shrunk to the prior (b2.ppg; stratum N: the position's training mean) with k = 3;
    n = 0 → the prior."""
    prior = df["prior_b2"].to_numpy(float)
    prior = np.where(np.isnan(prior), df["position"].map(pos_mean).to_numpy(float), prior)
    df["prior"] = prior
    df["std"] = (STD_K * prior + df["sum_pts"].to_numpy(float)) / (STD_K + df["n"].to_numpy(float))
    return df


def mark_relevant(df):
    """`relevant` = per (S, w, position) the top RELEVANT_K[pos] rows by the STD baseline's projection, ties by pid — never by a
    model's own projection. Applied to the test frame and (LP-1b, R3) to a fold's training frame, which is ranked on that fold's own
    training STD. Returns `df` with the boolean column set."""
    df["relevant"] = False
    for (S, w, pos), g in df.groupby(["S", "w", "position"]):
        top = g.sort_values(["std", "pid"], ascending=[False, True]).head(RELEVANT_K[pos])
        df.loc[top.index, "relevant"] = True
    return df


def _attach_benchw(df, benchw):
    """b1w / b1w_uncond from the replay's cond / uncond on (pid, S, w); NaN where the replay has no row."""
    bw = benchw.set_index(["pid", "S", "w"])
    key = pd.MultiIndex.from_frame(df[["pid", "S", "w"]])
    df["b1w"] = bw["cond"].reindex(key).to_numpy(float)
    df["b1w_uncond"] = bw["uncond"].reindex(key).to_numpy(float)
    return df


def weekly_forecasts(wf, T, b4=None, benchw=None):
    """Forecasts for test season T over its weekly-universe rows: std, b2w, ridge, p_plays, relevant, b4. With `benchw` (LP-1b: the
    replay of the app's in-season model, columns pid, S, w, cond, uncond) also b1w, b1w_uncond, c_weekly, b1cw, b1cw_uncond, where the
    per-position `c` is the median of pts / b1w over the fold's TRAINING rows that are relevant (ranked on that fold's own training STD),
    played and covered, both > 0. Without `benchw` the frame is exactly the LP-1a one."""
    train = wf[(wf["S"] < T) & (wf["S"] >= splits.FIRST_TRAIN_SEASON)].copy()
    splits.assert_train_only(train, T)
    pos_mean = train[train["played"] == True].groupby("position")["pts"].mean().to_dict()  # noqa: E712
    train = add_std(train, pos_mean)
    test = add_std(wf[wf["S"] == T].copy(), pos_mean)
    test["b2w"] = test["prior_b2"]
    test["ridge"] = np.nan
    for pos in POSITIONS:
        tr = train[(train["position"] == pos) & (train["played"] == True)]  # noqa: E712
        m = test["position"] == pos
        if len(tr) >= 50 and m.any():
            pred, _ = ridge_fit_predict(tr[WEEKLY_FEATS].to_numpy(), tr["pts"].to_numpy(), tr["S"].to_numpy(), test.loc[m, WEEKLY_FEATS].to_numpy(), T)
            test.loc[m, "ridge"] = pred
    # relevant set: top-K by the STD baseline's projection per (S, w, position) — never by a model's own projection
    test = mark_relevant(test)
    test["b4"] = np.nan
    if b4 is not None and len(b4):
        k = test[["pid", "S", "w"]].merge(b4, on=["pid", "S", "w"], how="left")
        test["b4"] = k["b4"].to_numpy()
    if benchw is not None:
        train = mark_relevant(train)
        train = _attach_benchw(train, benchw)
        test = _attach_benchw(test, benchw)
        test["c_weekly"] = np.nan
        for pos in POSITIONS:
            t = train[(train["position"] == pos) & train["relevant"] & (train["played"] == True) & train["b1w"].notna() & (train["b1w"] > 0) & (train["pts"] > 0)]  # noqa: E712
            test.loc[test["position"] == pos, "c_weekly"] = float(np.median(t["pts"] / t["b1w"])) if len(t) else np.nan
        test["b1cw"] = test["c_weekly"] * test["b1w"]
        test["b1cw_uncond"] = test["c_weekly"] * test["b1w_uncond"]
    test["T"] = T
    return test
