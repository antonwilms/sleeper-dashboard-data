"""LP-2b-1a (§6, §10, §11): the held-season trim and guard, the weekly row set, the outcome targets and the as-of weekly inputs.

`LAST_SEASON` is the single source of the held boundary and is read AT CALL TIME. Every input builder takes `tables` and builds its own
`asof.view`; the outcome builder `targets_at` is called by nothing that builds a feature. Nothing here fits a model or scores a forecast."""
import copy

import numpy as np
import pandas as pd

from . import asof, era, era_w, features, registry, spec_w
from .io import RAW_COLS

POSITIONS = spec_w.POSITIONS
LAST_SEASON = 2024                      # == splits.CONFIRM_FOLD - 1 (asserted by T-W-2); the 2025 season is held for LP-2b-2
ROW_COLS = ["pid", "S", "w", "position", "team", "opp", "home", "roof"]
TABLE_NAMES = ("weeks", "teams", "seasons", "bench", "teamctx", "extras")
GL_NEEDED = ["gl_att", "gl_passEpa", "gl_cpoeAtt", "gl_cpoeDen", "gl_rushEpa", "gl_carries", "gl_recEpa", "gl_tgt", "gl_rushFd", "gl_recFd", "gl_yac", "gl_rec"]
RW_STATUSES = ("ACT", "INA", "RES", "PUP")


# ── §6 trim and the held season ─────────────────────────────────────────────────────────────────────────────
def seasons():
    """The prior and input seasons: trainFrom .. LAST_SEASON (read at call time)."""
    return range(spec_w.inputs_spec()["trainFrom"], LAST_SEASON + 1)


def _last(last):
    return LAST_SEASON if last is None else last


def guard(S, confirm=False):
    """Raise ConfirmationHeld when S is beyond the held boundary unless `confirm` is passed (nothing in this slice passes it)."""
    if S > LAST_SEASON and not confirm:
        raise registry.ConfirmationHeld("season %s is beyond LAST_SEASON %s — the 2025 confirmation is held (LP-2b-2)" % (S, LAST_SEASON))


def _cut(df, last):
    return None if df is None else df.loc[df["S"] <= last].copy()


def trim(tables, last=None):
    """A new `asof.Tables` without any row of a season > last. In memory only; `X` is copied, every row whose rid left `weeks` is NaN."""
    last = _last(last)
    weeks = _cut(tables.weeks, last)
    X = None
    if tables.X is not None:
        X = np.array(tables.X, dtype=float, copy=True)
        drop = np.ones(len(X), bool)
        drop[weeks["rid"].to_numpy()] = False
        X[drop] = np.nan
    return asof.Tables(weeks, _cut(tables.teams, last), _cut(tables.seasons, last), _cut(tables.bench, last), X=X,
                       teamctx=_cut(tables.teamctx, last), extras=_cut(tables.extras, last))


def _scol(df):
    return "S" if "S" in df.columns else "T"


def trim_frame(df, last=None):
    """The rows of a frame (benchw, B4; a season-layer frame keys its season as `T`) with season <= last."""
    return df.loc[df[_scol(df)] <= _last(last)].copy()


def assert_trimmed(tables, last=None, frames=()):
    last = _last(last)
    for name in TABLE_NAMES:
        t = getattr(tables, name)
        if t is not None and len(t) and t["S"].max() > last:
            raise AssertionError("table %s holds season %s > %s" % (name, t["S"].max(), last))
    for i, f in enumerate(frames):
        if len(f) and f[_scol(f)].max() > last:
            raise AssertionError("frame %d holds season %s > %s" % (i, f[_scol(f)].max(), last))
    if tables.X is not None:
        drop = np.ones(len(tables.X), bool)
        drop[tables.weeks["rid"].to_numpy()] = False
        if not np.isnan(tables.X[drop]).all():
            raise AssertionError("X holds finite values for rows that are not in weeks")


# ── §10 rows and targets ────────────────────────────────────────────────────────────────────────────────────
def rows_at(v):
    """The weekly-universe rows of week n + 1 at origin v: the schedule rows with w == n + 1 and inUniverse."""
    sc = v.schedule
    m = (sc["w"] == v.n + 1) & sc["inUniverse"].astype(bool)
    return sc.loc[m, ROW_COLS].sort_values("pid", kind="mergesort").reset_index(drop=True)


def _tdefs(store):
    return {p: [t for t in store.struct["targets"][p] if t["name"] != "gamesShare"] for p in POSITIONS}


def _check_targets(store, spec_w_):
    got = {p: [t["name"] for t in ts] for p, ts in _tdefs(store).items()}
    if got != spec_w_["targetsByPos"]:
        raise AssertionError("the store's weekly targets differ from inputs_spec()")


def _num_exp(raw, X, keys, t):
    """(numerator, exposure) per played row for one target definition. An opportunity (`pg` of pass_att/rush_att/rec_tgt) and every `po`
    denominator are RAW columns; every other numerator is an `X` key."""
    name = t["name"]
    if t["kind"] == "pg":
        num = raw[name].to_numpy(float) if name in RAW_COLS else X[:, keys.index(name)]
        return np.asarray(num, float), np.ones(len(num))
    num = X[:, keys.index(name)]
    exp = np.zeros(len(num))
    for d in t["den"]:
        exp = exp + raw[d].to_numpy(float)
    return np.asarray(num, float), exp


def targets_at(tables, rows, store):
    """Outcome columns for the week rows `rows` (pid, S, w, position): `r_<t>`, `e_<t>` per weekly target of the row's position (NaN where the
    position has no such target), `played`, `pts`. A not-played row, a zero denominator or a missing value has e = 0 and r NaN."""
    for S in rows["S"].unique():
        guard(int(S))
    spec = spec_w.inputs_spec()
    ts = spec["targets"]
    tdefs = _tdefs(store)
    w = tables.weeks
    m = rows[["pid", "S", "w"]].merge(w[["pid", "S", "w", "rid", "played", "pts"] + RAW_COLS], on=["pid", "S", "w"], how="left")
    N = len(rows)
    r = {t: np.full(N, np.nan) for t in ts}
    e = {t: np.full(N, np.nan) for t in ts}
    played = m["played"].fillna(False).astype(bool).to_numpy()
    pos = rows["position"].to_numpy(object)
    rid = m["rid"].to_numpy()
    for P in POSITIONS:
        sel = np.flatnonzero((pos == P) & played)
        allp = np.flatnonzero(pos == P)
        for t in tdefs[P]:
            r[t["name"]][allp], e[t["name"]][allp] = np.nan, 0.0
        if not len(sel):
            continue
        raw = m.iloc[sel]
        X = tables.X[rid[sel].astype(int)]
        for t in tdefs[P]:
            num, exp = _num_exp(raw, X, store.keys, t)
            ok = np.isfinite(num) & np.isfinite(exp) & (exp > 0)
            r[t["name"]][sel] = np.where(ok, num / np.where(exp > 0, exp, 1.0), np.nan)
            e[t["name"]][sel] = np.where(ok, exp, 0.0)
    out = rows[["pid", "S", "w"]].copy()
    for t in ts:
        out["r_" + t] = r[t]
    for t in ts:
        out["e_" + t] = e[t]
    out["played"] = played
    out["pts"] = m["pts"].to_numpy(float)
    return out


# ── §11 features ────────────────────────────────────────────────────────────────────────────────────────────
def team_block(v, teams):
    """Per team, its to-date `v.teamctx` rows (season v.S) divided by their count: COPIES of features.py `tm_col` lambdas (tmPassPg … tmProe)."""
    cols = ["tPassPg", "tRushPg", "tPtsPg", "tEpa", "tProe"]
    out = pd.DataFrame(np.nan, index=pd.Index(list(teams)), columns=cols)
    tc = v.teamctx
    if tc is None or not len(tc):
        return out
    cur = tc[tc["S"] == v.S]
    if not len(cur):
        return out
    tcs = cur.groupby("team").sum(numeric_only=True)
    tcs["n"] = cur.groupby("team").size()
    with np.errstate(all="ignore"):
        res = pd.DataFrame({
            "tPassPg": tcs["off_passPlays"] / tcs["n"],
            "tRushPg": tcs["off_rushPlays"] / tcs["n"],
            "tPtsPg": tcs["off_pointsScored"] / tcs["n"],
            "tEpa": np.where(tcs["off_epaPlays"] > 0, tcs["off_epaSum"] / tcs["off_epaPlays"], np.nan),
            "tProe": np.where(tcs["off_proePlays"] > 0, (tcs["off_proePassPlays"] - tcs["off_proeXpassSum"]) / tcs["off_proePlays"], np.nan),
        }, index=tcs.index)
    return res.reindex(out.index)[cols]


def gl_block(v, pids):
    """Per pid, his to-date `v.extras` rows (season v.S) summed, then the ratios of features.py (`passEpaAtt1` … `yacRec1` without the lag)."""
    cols = ["passEpaAtt", "cpoe", "rushEpaAtt", "recEpaTgt", "rushFdAtt", "recFdTgt", "yacRec"]
    pids = [str(p) for p in pids]
    ex = v.extras
    if ex is None or not len(ex):
        return pd.DataFrame(np.nan, index=pd.Index(pids), columns=cols)
    cur = ex[ex["S"] == v.S]
    g = cur.groupby("pid")[GL_NEEDED].sum().reindex(pids)

    def col(c):
        return g[c].to_numpy(float)
    out = pd.DataFrame(index=pd.Index(pids))
    out["passEpaAtt"] = features._ratio(col("gl_passEpa"), col("gl_att"))
    out["cpoe"] = features._ratio(col("gl_cpoeAtt"), col("gl_cpoeDen"))
    out["rushEpaAtt"] = features._ratio(col("gl_rushEpa"), col("gl_carries"))
    out["recEpaTgt"] = features._ratio(col("gl_recEpa"), col("gl_tgt"))
    out["rushFdAtt"] = features._ratio(col("gl_rushFd"), col("gl_carries"))
    out["recFdTgt"] = features._ratio(col("gl_recFd"), col("gl_tgt"))
    out["yacRec"] = features._ratio(col("gl_yac"), col("gl_rec"))
    return out[cols]


def bio_block(tables, store, S, pids):
    """age, exp, isRookie for `pids` (every row pid of season S) from the preseason view of S — never `store.feats(S)`, whose subjects are the
    universes of S … S + 3 (a pid joining a later universe is in it only through future information)."""
    guard(S)
    F = features.season_features(asof.view(tables, S, 0), [str(p) for p in pids], features.universe(tables, S), {**store.struct}, store.pos, store.keys, ps=store.ps(S))
    return F[["pid", "age", "exp", "isRookie"]]


def _status_flags(rw):
    """(ACT, INA, RES, PUP, other) indicators of a row's `rw` pairs; None when the view masks `rw`."""
    if rw is None or (isinstance(rw, float) and np.isnan(rw)):
        return None
    sts = [p[1] for p in rw if isinstance(p, (list, tuple)) and len(p) > 1]
    return [float(s in sts) for s in RW_STATUSES] + [float(any(s not in RW_STATUSES for s in sts))]


def _rw_has(rw, team, status):
    if rw is None or (isinstance(rw, float) and np.isnan(rw)):
        return False
    return any(isinstance(p, (list, tuple)) and len(p) > 1 and p[0] == team and p[1] == status for p in rw)


def _blank(N):
    return np.full(N, np.nan)


def inputs_at(tables, store, S, n, spec_w_, bio):
    """The non-prior inputs of the week n + 1 rows of season S at origin (S, n): row identity plus exactly the names of every non-prior
    group of `inputs_spec()`. Reads only `v = asof.view(tables, S, n)`, `store.keys` / `store.struct` and the `bio` frame passed in."""
    guard(S)
    _check_targets(store, spec_w_)
    v = asof.view(tables, S, n)
    rows = rows_at(v)
    N = len(rows)
    keys = store.keys
    tdefs = _tdefs(store)
    ts = spec_w_["targets"]
    pid = rows["pid"].to_numpy(object)
    team = rows["team"].to_numpy(object)
    pos = rows["position"].to_numpy(object)
    w_now = n + 1
    cols = {}

    # to-date rows of season S
    wk = v.weeks
    mS = (wk["S"] == S).to_numpy()
    cur = wk.loc[mS].reset_index(drop=True)
    Xc = v.X[mS]
    pm = cur["played"].astype(bool).to_numpy()
    pl = cur.loc[pm].reset_index(drop=True)
    Xp = Xc[pm]

    # ── form ───────────────────────────────────────────────────────────────────────────────────────────
    decay = spec_w_["gRecDecay"]
    form = {}
    for t in ts:
        for pre in ("ex_", "std_", "rec_"):
            form[pre + t] = _blank(N)
    for P in POSITIONS:
        mrow = pos == P
        if not mrow.any():
            continue
        sel = np.flatnonzero(pl["pid"].isin(set(pid[mrow])).to_numpy())
        sub = pl.iloc[sel][["pid", "w"] + RAW_COLS].copy()
        sub["_i"] = np.arange(len(sub))
        sub = sub.sort_values(["pid", "w"], kind="mergesort")
        Xs = Xp[sel][sub["_i"].to_numpy()]
        a = sub.groupby("pid").cumcount(ascending=False).to_numpy()
        wt = decay ** a
        for t in tdefs[P]:
            num, exp = _num_exp(sub, Xs, keys, t)
            ok = np.isfinite(num) & np.isfinite(exp)
            num, exp = np.where(ok, num, 0.0), np.where(ok, exp, 0.0)
            g = pd.DataFrame({"pid": sub["pid"].to_numpy(), "num": num, "exp": exp, "wnum": wt * num, "wexp": wt * exp}).groupby("pid").sum().reindex(list(pid[mrow]))
            form["ex_" + t["name"]][mrow] = g["exp"].fillna(0.0).to_numpy()
            form["std_" + t["name"]][mrow] = features._ratio(g["num"].to_numpy(), g["exp"].to_numpy())
            form["rec_" + t["name"]][mrow] = features._ratio(g["wnum"].to_numpy(), g["wexp"].to_numpy())
    nP_by = pl.groupby("pid").size()
    form["nP"] = nP_by.reindex(list(pid)).fillna(0).to_numpy(float)
    form["wk"] = np.full(N, float(w_now))
    cols.update(form)

    # ── usage ──────────────────────────────────────────────────────────────────────────────────────────
    so = era_w.season_only(v)
    ps = features.player_seasons(so, keys)
    ps = ps[ps["s"] == S].drop_duplicates("pid").set_index("pid")
    ix = list(pid)
    u = {}
    if len(ps):
        for out_name, src in (("tgtSh", "tgtShare"), ("rushSh", "rushShare"), ("rzSh", "rzShare"), ("airSh", "airShare")):
            u[out_name] = ps[src].reindex(ix).to_numpy(float)
        u["oppoPg"] = features._ratio(ps["oppo"].reindex(ix).to_numpy(float), ps["g"].reindex(ix).to_numpy(float))
    else:
        for k in ("tgtSh", "rushSh", "rzSh", "airSh", "oppoPg"):
            u[k] = _blank(N)
    sw = so.weeks
    pmask = sw["played"].astype(bool).to_numpy()
    rank = sw.assign(_p=pmask).loc[pmask].groupby("pid")["w"].rank(ascending=False, method="first")
    keep = np.zeros(len(sw), bool)
    keep[np.flatnonzero(pmask)[(rank.to_numpy() <= 3)]] = True
    v3 = copy.copy(so)
    v3.weeks, v3.X = sw.loc[keep], so.X[keep]
    ps3 = features.player_seasons(v3, keys)
    ps3 = ps3[ps3["s"] == S].drop_duplicates("pid").set_index("pid")
    if len(ps3):
        for out_name, src in (("tgtSh3", "tgtShare"), ("rushSh3", "rushShare"), ("rzSh3", "rzShare")):
            u[out_name] = ps3[src].reindex(ix).to_numpy(float)
        u["oppoPg3"] = features._ratio(ps3["oppo"].reindex(ix).to_numpy(float), ps3["g"].reindex(ix).to_numpy(float))
    else:
        for k in ("tgtSh3", "rushSh3", "rzSh3", "oppoPg3"):
            u[k] = _blank(N)
    cols.update(u)

    # ── avail + absence ────────────────────────────────────────────────────────────────────────────────
    tw = v.team_weeks
    tw = tw[(tw["S"] == S) & (tw["w"] <= n)]
    tgw_by = {t: sorted(int(x) for x in g["w"]) for t, g in tw.groupby("team")}
    info = {}
    for p, wv, tm, pla, st, rw, dp in zip(cur["pid"], cur["w"], cur["team"], cur["played"], cur["status"], cur["rw"], cur["depthOrder"]):
        info[(p, int(wv))] = (tm, bool(pla), st, rw, dp)
    pw_by = {p: set(int(x) for x in g["w"]) for p, g in pl.groupby("pid")}
    seas1 = v.seasons[v.seasons["S"] == S - 1].drop_duplicates("pid").set_index("pid")
    gs_prev = features._ratio(seas1["gamesPlayed"].reindex(ix).to_numpy(float), seas1["teamGames"].reindex(ix).to_numpy(float)) if len(seas1) else _blank(N)
    A = {k: _blank(N) for k in spec_w.AVAIL}
    A["gsPrev"] = gs_prev
    A["first"] = np.zeros(N)
    masked_season = bool(cur["rwOracle"].astype(bool).any()) if len(cur) else False
    # absence caches
    tsum = v.teams[(v.teams["S"] == S)][["team", "w", "sum_rec_tgt", "sum_rush_att", "sum_pass_att"]].drop_duplicates(["team", "w"])
    plm = pl[["pid", "team", "w", "position", "rec_tgt", "rush_att", "pass_att"]].merge(tsum, on=["team", "w"], how="left")
    okn = (plm["sum_rec_tgt"].notna() & plm["sum_rush_att"].notna()).to_numpy()
    okq = plm["sum_pass_att"].notna().to_numpy()
    plm["n_n"] = np.where(okn, plm["rec_tgt"] + plm["rush_att"], 0.0)
    plm["d_n"] = np.where(okn, plm["sum_rec_tgt"] + plm["sum_rush_att"], 0.0)
    plm["n_q"] = np.where(okq, plm["pass_att"], 0.0)
    plm["d_q"] = np.where(okq, plm["sum_pass_att"], 0.0)
    mates_by = {}
    if len(plm):
        agg = plm.groupby(["team", "pid"]).agg(position=("position", "first"), n_n=("n_n", "sum"), d_n=("d_n", "sum"), n_q=("n_q", "sum"), d_q=("d_q", "sum"), pa=("pass_att", "sum")).reset_index()
        for tm, p, ps_, nn, dn, nq, dq, pa in zip(agg["team"], agg["pid"], agg["position"], agg["n_n"], agg["d_n"], agg["n_q"], agg["d_q"], agg["pa"]):
            mates_by.setdefault((tm, ps_), []).append((p, (nn / dn if dn > 0 else 0.0), (nq / dq if dq > 0 else 0.0), float(pa)))
    at_week = {(tm, int(wv)): set(g["pid"]) for (tm, wv), g in plm.groupby(["team", "w"])} if len(plm) else {}
    vac, ret, qbo = np.zeros(N), np.zeros(N), _blank(N)
    for i in range(N):
        p, tau, P = pid[i], team[i], pos[i]
        tgw = tgw_by.get(tau, []) if isinstance(tau, str) else []
        pw = pw_by.get(p, set())
        A["gsStd"][i] = len(pw) / len(tgw) if tgw else np.nan
        if not tgw:
            A["first"][i] = 1.0
            continue
        wp = tgw[-1]
        r_wp = info.get((p, wp))
        A["playedPrev"][i] = float(bool(r_wp and r_wp[1]))
        runp = runn = 0
        for x in reversed(tgw):
            if x in pw:
                if runn:
                    break
                runp += 1
            else:
                if runp:
                    break
                runn += 1
        A["runP"][i], A["runN"][i] = float(runp), float(runn)
        lastp = max(pw) if pw else None
        A["wkSince"][i] = float(sum(1 for x in tgw if x > lastp)) if lastp is not None else np.nan
        st = r_wp[2] if r_wp else None
        none = r_wp is None or st is None or (isinstance(st, float) and np.isnan(st))
        A["prevD"][i], A["prevX"][i], A["prevNone"][i] = float(st == "D"), float(st == "X"), float(none)
        fl = _status_flags(r_wp[3]) if r_wp else None
        if fl is not None:
            for k, x in zip(("rwPrev_ACT", "rwPrev_INA", "rwPrev_RES", "rwPrev_PUP", "rwPrev_other"), fl):
                A[k][i] = x
        dprev = float(r_wp[4]) if r_wp and r_wp[4] is not None else np.nan
        A["depthPrev"][i] = dprev
        if len(tgw) >= 2:
            r_w2 = info.get((p, tgw[-2]))
            d2 = float(r_w2[4]) if r_w2 and r_w2[4] is not None else np.nan
            A["depthChg"][i] = dprev - d2
        # absence
        played_wp = at_week.get((tau, wp), set())
        mates = [m for m in mates_by.get((tau, P), []) if m[0] != p]
        out_sh, ret_sh = 0.0, 0.0
        for (mp, sn, sq, pa) in mates:
            if mp in played_wp:
                continue
            sh = sq if P == "QB" else sn
            out_sh += sh
            if not masked_season:
                mr = info.get((mp, wp))
                if mr is not None and _rw_has(mr[3], tau, "ACT"):
                    ret_sh += sh
        vac[i] = out_sh
        ret[i] = np.nan if masked_season else ret_sh
        if P != "QB":
            qbs = mates_by.get((tau, "QB"), [])
            if qbs:
                top = min(qbs, key=lambda m: (-m[3], m[0]))
                qbo[i] = float(top[0] not in played_wp)
    first = A["first"] == 1.0
    vac[first], ret[first], qbo[first] = 0.0, 0.0, np.nan
    A["vacShare"], A["retShare"], A["qbOut"] = vac, ret, qbo
    # at first = 1 every lagged status, rw and depth field is NaN (never S - 1's last week); the counts are 0 (no team-game week to count)
    A["runP"][first], A["runN"][first] = 0.0, 0.0
    cols.update(A)

    # ── opp ────────────────────────────────────────────────────────────────────────────────────────────
    tc = v.teamctx

    def opp_table(df):
        if df is None or not len(df):
            return pd.DataFrame(columns=["oEpa", "oPassEpa", "oRushEpa", "oSucc", "oRzTd", "oPtsPg", "oG"])
        g = df.groupby("team").sum(numeric_only=True)
        g["n"] = df.groupby("team").size()
        with np.errstate(all="ignore"):
            return pd.DataFrame({
                "oEpa": features._ratio(g["def_epaSum"], g["def_epaPlays"]), "oPassEpa": features._ratio(g["def_passEpaSum"], g["def_passEpaPlays"]),
                "oRushEpa": features._ratio(g["def_rushEpaSum"], g["def_rushEpaPlays"]), "oSucc": features._ratio(g["def_successes"], g["def_successPlays"]),
                "oRzTd": features._ratio(g["def_rzTdTripsAllowed"], g["def_rzTripsAllowed"]), "oPtsPg": g["def_pointsAllowed"] / g["n"], "oG": g["n"].astype(float)}, index=g.index)
    cur_o = opp_table(tc[tc["S"] == S] if tc is not None else None)
    prv_o = opp_table(tc[tc["S"] == S - 1] if tc is not None else None)
    opps = rows["opp"].to_numpy(object)
    O = {}
    for c in ("oEpa", "oPassEpa", "oRushEpa", "oSucc", "oRzTd", "oPtsPg"):
        O[c] = cur_o[c].reindex(list(opps)).to_numpy(float) if len(cur_o) else _blank(N)
        prev_keys = [era.era_team(o, S - 1) if isinstance(o, str) else None for o in opps]
        O[c + "1"] = prv_o[c].reindex(prev_keys).to_numpy(float) if len(prv_o) else _blank(N)
    O["oG"] = cur_o["oG"].reindex(list(opps)).fillna(0.0).to_numpy(float) if len(cur_o) else np.zeros(N)
    cols.update(O)

    # ── team, game, gl, bio ────────────────────────────────────────────────────────────────────────────
    tb = team_block(v, set(t for t in team if isinstance(t, str)))
    for c in tb.columns:
        cols[c] = tb[c].reindex(list(team)).to_numpy(float)
    cols["home"] = np.array([np.nan if h is None or (isinstance(h, float) and np.isnan(h)) else float(bool(h)) for h in rows["home"]])
    cols["dome"] = np.array([np.nan if not isinstance(r, str) else float(r in ("dome", "closed")) for r in rows["roof"]])
    gb = gl_block(v, list(pid))
    for c in gb.columns:
        cols[c] = gb[c].to_numpy(float)
    b = bio.drop_duplicates("pid").set_index("pid").reindex(ix)
    for c in ("age", "exp", "isRookie"):
        cols[c] = b[c].to_numpy(float)

    names = spec_w.feature_names(spec_w_)
    out = pd.concat([rows[spec_w_["identity"]].reset_index(drop=True), pd.DataFrame({nme: cols[nme] for nme in names})], axis=1)
    if list(out.columns) != spec_w_["identity"] + names:
        raise AssertionError("inputs_at columns differ from inputs_spec()")
    return out


def attach_prior(frame, prior, fallback, mu, store, spec_w_):
    """Adds the `prior` group: `pr_<t>` (the candidate's season prior for (pid, T = S), else the fallback with noPrior = 1; blended with the
    in-season era ratio), `pr_gamesShare` (unblended), `noPrior`, `dstd_<t>`, `drec_<t>`. `frame` holds one (S, n)."""
    out = frame.copy()
    N = len(out)
    if not N:
        return pd.concat([out, pd.DataFrame({c: np.array([], float) for c in spec_w_["priorCols"]})], axis=1)
    Ss, Ws = out["S"].unique(), out["w"].unique()
    if len(Ss) != 1 or len(Ws) != 1:
        raise AssertionError("attach_prior takes one (S, n)")
    S, n = int(Ss[0]), int(Ws[0]) - 1
    n0 = spec_w_["eraN0"]
    pr = prior[prior["T"] == S].drop_duplicates("pid").set_index("pid")
    pid = out["pid"].to_numpy(object)
    pos = out["position"].to_numpy(object)
    has = np.array([p in pr.index for p in pid])
    cols = {t: _blank(N) for t in spec_w_["targets"]}
    gs = _blank(N)
    for P in POSITIONS:
        m = pos == P
        if not m.any():
            continue
        for t in spec_w_["targetsByPos"][P]:
            base = np.where(has[m], pr["pr_" + t].reindex(list(pid[m])).to_numpy(float), fallback.val.loc[P, t] if P in fallback.val.index else np.nan)
            cols[t][m] = era_w.blend(base, era_w.ratio(mu, store, S, P, t), n, n0)
        gs[m] = np.where(has[m], pr["pr_gamesShare"].reindex(list(pid[m])).to_numpy(float), fallback.val.loc[P, "gamesShare"] if P in fallback.val.index else np.nan)
    new = {"pr_" + t: cols[t] for t in spec_w_["targets"]}
    new["pr_gamesShare"] = gs
    new["noPrior"] = (~has).astype(float)
    for t in spec_w_["targets"]:
        new["dstd_" + t] = out["std_" + t].to_numpy(float) - cols[t]
    for t in spec_w_["targets"]:
        new["drec_" + t] = out["rec_" + t].to_numpy(float) - cols[t]
    out = pd.concat([out.reset_index(drop=True), pd.DataFrame(new)], axis=1)
    want = spec_w_["identity"] + spec_w.feature_names(spec_w_) + spec_w_["priorCols"]
    if list(out.columns) != want:
        raise AssertionError("attach_prior columns differ from inputs_spec()")
    return out
