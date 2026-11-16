"""LP-2a (§5.3-§5.6): season universe, kickoff roster, player-season aggregates and the season features at origin (S, 0).

Everything is read through a view `v = asof.view(tables, S, 0)`; the two membership-only exceptions that read `tables` directly are
`universe` (ex-ante, equal to `baselines.season_targets(tables, S)["pid"]`) and the fold driver's `season_targets(tables, s)`.
Features are E0 values; `apply_units` divides the `pg`/`po` ones by the league mean of the lag season (E1).
"""
import numpy as np
import pandas as pd

from . import era
from .io import RAW_COLS

POSITIONS = era.POSITIONS
LAGS = (1, 2, 3)


def universe(tables, S):
    """pids of the season-S `seasons` rows with `inSeasonUniverse`, in table order."""
    s = tables.seasons
    return list(s.loc[(s["S"] == S) & s["inSeasonUniverse"].astype(bool), "pid"].astype(str))


def position_map(tables):
    """Static pid -> position (the 2026 capture, accepted hindsight): `seasons` rows first, then `weeks`."""
    m = {}
    for df in (tables.seasons, tables.weeks):
        d = df[["pid", "position"]].drop_duplicates("pid")
        for p, q in zip(d["pid"], d["position"]):
            m.setdefault(str(p), q)
    return m


# ── kickoff ────────────────────────────────────────────────────────────────────────────────────────────────
def kickoff(v, pids):
    """team_k = `team` of the pid's lowest-`w` row in `v.schedule`, else `v.season_row.team`, else NaN; teamGames_k = the number of
    `v.team_weeks` rows of team_k (games played — 16 for BUF/CIN 2022, as B2's total counts)."""
    pids = [str(p) for p in pids]
    sc = v.schedule.sort_values(["pid", "w"], kind="mergesort").drop_duplicates("pid").set_index("pid")["team"]
    fb = v.season_row.drop_duplicates("pid").set_index("pid")["team"]
    team = []
    for p in pids:
        t = sc.get(p)
        if t is None or (isinstance(t, float) and np.isnan(t)):
            t = fb.get(p)
        team.append(t if isinstance(t, str) else np.nan)
    tg = v.team_weeks.groupby("team").size()
    return pd.DataFrame({"pid": pids, "team_k": team, "teamGames_k": [float(tg[t]) if isinstance(t, str) and t in tg.index else np.nan for t in team]})


# ── player-season aggregates ───────────────────────────────────────────────────────────────────────────────
def player_seasons(v, keys, weights=None):
    """One row per (pid, s) with a played row in `v.weeks`: `g`, sums of the raw columns and of every key column of `v.X`, `pts`, `oppo`,
    `lastTeam`, `trailOut`, `dWeeks`, `depthEnd`, `late`, the four team shares and (with `weights`) `tdPts`. `oppo` = pass_att + rush_att
    (QB), rush_att + rec_tgt (others). A share = sum of the player's value / sum of the team's value over the weeks he played, on that
    week's `team` (CR-10: components first, then the quotient)."""
    w = v.weeks
    pl = w["played"].to_numpy(bool)
    if not pl.any():
        return pd.DataFrame(columns=["pid", "s", "position", "g", "pts", "oppo", "lastTeam"] + RAW_COLS + list(keys) + ["late", "trailOut", "dWeeks", "depthEnd", "tgtShare", "rushShare", "rzShare", "airShare"]
                            + (["tdPts"] if weights is not None else []))
    df = w.loc[pl, ["pid", "S", "w", "position", "team", "pts"] + RAW_COLS].copy()
    Xp = v.X[pl]
    for j, k in enumerate(keys):
        df[k] = Xp[:, j]
    df["oppo"] = np.where(df["position"] == "QB", df["pass_att"] + df["rush_att"], df["rush_att"] + df["rec_tgt"])
    tm = v.teams[["team", "S", "w", "sum_rec_tgt", "sum_rush_att", "sum_rec_rz_tgt", "sum_rush_rz_att"]].drop_duplicates(["team", "S", "w"])
    ay = w.groupby(["team", "S", "w"], as_index=False)["rec_air_yd"].sum().rename(columns={"rec_air_yd": "tm_air"})
    df = df.merge(tm, on=["team", "S", "w"], how="left").merge(ay, on=["team", "S", "w"], how="left")
    df["rz"] = df["rec_rz_tgt"] + df["rush_rz_att"]
    df["tm_rz"] = df["sum_rec_rz_tgt"] + df["sum_rush_rz_att"]
    for share, a, b in (("tgt", "rec_tgt", "sum_rec_tgt"), ("rush", "rush_att", "sum_rush_att"), ("rz", "rz", "tm_rz"), ("air", "rec_air_yd", "tm_air")):
        ok = df[b].notna()
        df["n_" + share] = np.where(ok, df[a], 0.0)
        df["d_" + share] = np.where(ok, df[b], 0.0)
    df = df.sort_values(["pid", "S", "w"], kind="mergesort")
    grp = df.groupby(["pid", "S"], sort=True)
    sums = [c for c in ["pts", "oppo"] + RAW_COLS + list(keys) + ["n_tgt", "d_tgt", "n_rush", "d_rush", "n_rz", "d_rz", "n_air", "d_air"]]
    ps = grp[sums].sum()
    ps["g"] = grp.size().astype(float)
    ps["position"] = grp["position"].first()
    ps["lastTeam"] = grp["team"].last()
    cum = grp.cumcount(ascending=False)
    last6 = df["oppo"].where(cum < 6, 0.0).groupby([df["pid"], df["S"]]).sum()
    ps["late"] = np.where(ps["g"] >= 8, (last6 / np.minimum(ps["g"], 6)) / (ps["oppo"] / ps["g"]).where(ps["oppo"] > 0), np.nan)
    for share in ("tgt", "rush", "rz", "air"):
        ps[share + "Share"] = (ps["n_" + share] / ps["d_" + share]).where(ps["d_" + share] > 0)
    if weights is not None:
        td = sum(ps[k] * weights[k] for k in ("pass_td", "rush_td", "rec_td") if k in ps.columns)
        ps["tdPts"] = (td / ps["pts"]).where(ps["pts"] > 0)
    ps = ps.drop(columns=[c for c in ps.columns if c.startswith(("n_", "d_"))]).reset_index().rename(columns={"S": "s"})
    # trailing / status / depth facts come from every row of the season, played or not
    a = w[["pid", "S", "w", "played", "status", "depthOrder"]].sort_values(["pid", "S", "w"], kind="mergesort").copy()
    a["np"] = (~a["played"].astype(bool)).astype(int)
    ag = a.groupby(["pid", "S"], sort=True)
    rev = a.iloc[::-1]
    trail = rev.groupby(["pid", "S"], sort=True)["np"].apply(lambda s: int(s.cumprod().sum()))
    extra = pd.DataFrame({"trailOut": trail, "dWeeks": ag["status"].apply(lambda s: int((s == "D").sum())), "depthEnd": ag["depthOrder"].last()}).reset_index().rename(columns={"S": "s"})
    return ps.merge(extra, on=["pid", "s"], how="left")


# ── features ───────────────────────────────────────────────────────────────────────────────────────────────
def _ratio(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    with np.errstate(all="ignore"):
        return np.where(b > 0, a / b, np.nan)


def _eval_src(L, src):
    """The tiny DSL of the `hist` group in the spec. L = the lag-season player-season rows indexed by pid, already reindexed to the rows."""
    op = src[0]
    if op == "col":
        return L[src[1]].to_numpy(float)
    if op == "pg":
        return _ratio(L[src[1]], L["g"])
    if op == "po":
        return _ratio(L[src[1]], sum(L[d].to_numpy(float) for d in src[2]))
    if op == "ratio":
        return _ratio(L[src[1]], L[src[2]])
    if op == "ppg":
        return _ratio(L["pts"], L["g"])
    raise KeyError(src)


def fmeta(spec, pos, drop=()):
    """Ordered {name: (group, meta)} of the features of a position, groups in the spec's order, `drop` groups removed (an ablation).
    A name shared by two groups (`gs`) belongs to the first group that lists it; dropping a later group keeps it, dropping the first keeps
    it too when another kept group lists it."""
    out = {}
    for g, d in spec["features"].items():
        if g in drop:
            continue
        for key in ("*", pos):
            for n, m in d.get(key, {}).items():
                out.setdefault(n, (g, m))
    return out


def desc_names(spec, pos, drop=()):
    """H's cohort inputs DESC = bio + role + team + gl + the named extras (dropping a group removes its members, extras included)."""
    fm = fmeta(spec, pos)
    names = []
    for g in spec["desc"]["groups"]:
        if g in drop:
            continue
        names += [n for n, (gg, _m) in fm.items() if gg == g]
    members_dropped = {n for g in drop for dd in spec["features"].get(g, {}).values() for n in dd}
    for n in spec["desc"]["extra"]:
        if n not in members_dropped and n not in names:
            names.append(n)
    return names


def season_features(v, pids, roster, spec, positions, keys, ps=None, weights=None):
    """E0 features at origin v = (S, 0) for `pids` (any pids): one row per pid, every position's columns (NaN where not applicable).
    `roster` = features.universe(tables, S) — the kickoff roster of a team is always this season's universe, whoever the features are for."""
    S = v.S
    pids = [str(p) for p in pids]
    if ps is None:
        ps = player_seasons(v, keys, weights)
    pos = [positions.get(p) for p in pids]
    posa = np.array(pos, dtype=object)
    kk = kickoff(v, pids)
    out = {"pid": np.array(pids, dtype=object), "position": posa, "team_k": kk["team_k"].to_numpy(object), "teamGames_k": kk["teamGames_k"].to_numpy(float)}
    cols = {}
    n = len(pids)
    names_by_pos = {p: fmeta(spec, p) for p in POSITIONS}
    allnames = []
    for p in POSITIONS:
        for nme in names_by_pos[p]:
            if nme not in allnames:
                allnames.append(nme)
    for nme in allnames:
        cols[nme] = np.full(n, np.nan)
    psl = {l: ps[ps["s"] == S - l].drop_duplicates("pid").set_index("pid") for l in LAGS}
    Ll = {l: psl[l].reindex(pids) for l in LAGS}
    seas = v.seasons.drop_duplicates(["pid", "S"])
    seasl = {l: seas[seas["S"] == S - l].set_index("pid").reindex(pids) for l in LAGS}
    isp = {p: np.array([x == p for x in pos]) for p in POSITIONS}

    # hist: the spec's DSL, per position
    for p in POSITIONS:
        for nme, (g, m) in names_by_pos[p].items():
            if g != "hist" or "src" not in m:
                continue
            l = m["lag"]
            val = _eval_src(Ll[l], m["src"])
            cols[nme][isp[p]] = val[isp[p]]
    for l in LAGS:
        sl = seasl[l]
        tg = sl["teamGames"].to_numpy(float)
        has = sl["gamesPlayed"].notna().to_numpy()
        gsv = np.where(has, _ratio(sl["gamesPlayed"].to_numpy(float), tg), np.nan)
        cols["gs%d" % l][:] = gsv
        if "offPct%d" % l in cols:
            cols["offPct%d" % l][:] = np.where(has, sl["offPct"].to_numpy(float), np.nan)
    # dur
    cols["trailOut1"][:] = Ll[1]["trailOut"].to_numpy(float)
    cols["dWeeks1"][:] = Ll[1]["dWeeks"].to_numpy(float)
    cols["late1"][:] = Ll[1]["late"].to_numpy(float)
    cols["tdPts1"][:] = Ll[1]["tdPts"].to_numpy(float) if "tdPts" in Ll[1] else np.nan
    # bio
    cur = v.season_row.drop_duplicates("pid").set_index("pid").reindex(pids)
    age = cur["age"].to_numpy(float)
    dy = cur["draftYear"].to_numpy(float)
    ovr = cur["draftOvr"].to_numpy(float)
    und = np.array([np.nan if (x is None or (isinstance(x, float) and np.isnan(x))) else float(bool(x)) for x in cur["undrafted"]])
    earlier = seas[seas["hasRow"].astype(bool)].groupby("pid").size().reindex(pids).fillna(0).to_numpy(float)
    exp = np.where((dy > 0) & (dy <= S), S - dy, earlier)
    exp = np.minimum(exp, 10.0)
    logovr = np.where((und == 1) | np.isnan(ovr) | (ovr <= 0), np.nan, np.log(np.where(ovr > 0, ovr, 1.0)))
    isrk = np.where(np.isnan(dy), np.nan, (dy == S).astype(float))
    cols["age"][:], cols["age2"][:] = age, age ** 2
    cols["exp"][:] = exp
    cols["isRookie"][:] = isrk
    cols["draftRound"][:] = cur["draftRound"].to_numpy(float)
    cols["logOvr"][:] = logovr
    cols["undrafted"][:] = und
    cols["isRookieLogOvr"][:] = isrk * logovr
    cols["expLe1LogOvr"][:] = (exp <= 1).astype(float) * logovr
    # role + team need the kickoff roster
    rk = kickoff(v, roster).set_index("pid")
    rpos = {p: positions.get(p) for p in roster}
    roster_team = {p: rk.loc[p, "team_k"] for p in roster}
    l1 = psl[1]
    oppo_pg = {p: (float(l1.loc[p, "oppo"] / l1.loc[p, "g"]) if p in l1.index and l1.loc[p, "g"] > 0 else np.nan) for p in roster}
    by_team_pos = {}
    for p in roster:
        t = roster_team[p]
        if isinstance(t, str):
            by_team_pos.setdefault((t, rpos[p]), []).append(p)
    pos_rank = np.full(n, np.nan)
    comp_opp = np.full(n, np.nan)
    comp_top = np.full(n, np.nan)
    depth_end = Ll[1]["depthEnd"].to_numpy(float)
    for i, (p, tk, ps_) in enumerate(zip(pids, out["team_k"], pos)):
        if not isinstance(tk, str):
            continue
        mates = [q for q in by_team_pos.get((tk, ps_), []) if q != p]
        mine = oppo_pg.get(p)
        if mine is None:                                  # a non-roster pid: his own lag-1 oppoPg from the lag table
            r = psl[1].loc[p] if p in psl[1].index else None
            mine = float(r["oppo"] / r["g"]) if r is not None and r["g"] > 0 else np.nan
        vals = [oppo_pg[q] for q in mates]
        comp_opp[i] = float(sum(0.0 if np.isnan(x) else x for x in vals))
        comp_top[i] = float(max([0.0 if np.isnan(x) else x for x in vals] or [0.0]))
        if not np.isnan(mine):
            pos_rank[i] = 1 + sum(1 for x in vals if not np.isnan(x) and x > mine)
    cols["depthEnd1"][:] = depth_end
    cols["posRank1"][:] = pos_rank
    cols["compOpp"][:] = comp_opp
    cols["compTop"][:] = comp_top
    # team (season S-1 context of t1 = era_team(team_k, S-1))
    tc = v.teamctx
    tcs = None
    if tc is not None and len(tc):
        tcs = tc[tc["S"] == S - 1].groupby("team").sum(numeric_only=True)
        tcs["n"] = tc[tc["S"] == S - 1].groupby("team").size()
    tms = v.teams[v.teams["S"] == S - 1].groupby("team")[["sum_rec_tgt", "sum_rush_att"]].sum()
    pt = {}
    pw = v.weeks[(v.weeks["S"] == S - 1) & v.weeks["played"].astype(bool)].groupby(["pid", "team"])[["rec_tgt", "rush_att"]].sum()
    for (p, t), r in pw.iterrows():
        pt[(p, t)] = (float(r["rec_tgt"]), float(r["rush_att"]))
    t1 = np.array([era.era_team(tk, S - 1) if isinstance(tk, str) else None for tk in out["team_k"]], dtype=object)
    lastTeam1 = Ll[1]["lastTeam"].to_numpy(object)
    played1 = Ll[1]["g"].notna().to_numpy()
    cols["teamChange"][:] = np.where(played1 & (t1 != None), (lastTeam1 != t1).astype(float), np.nan)  # noqa: E711
    def tm_col(name, fn):
        arr = np.full(n, np.nan)
        for i, t in enumerate(t1):
            if t is None or tcs is None or t not in tcs.index:
                continue
            arr[i] = fn(tcs.loc[t])
        cols[name][:] = arr
    tm_col("tmPassPg", lambda r: r["off_passPlays"] / r["n"])
    tm_col("tmRushPg", lambda r: r["off_rushPlays"] / r["n"])
    tm_col("tmPtsPg", lambda r: r["off_pointsScored"] / r["n"])
    tm_col("tmEpaPlay", lambda r: r["off_epaSum"] / r["off_epaPlays"] if r["off_epaPlays"] > 0 else np.nan)
    tm_col("tmPassEpaPlay", lambda r: r["off_passEpaSum"] / r["off_passEpaPlays"] if r["off_passEpaPlays"] > 0 else np.nan)
    tm_col("tmProe", lambda r: (r["off_proePassPlays"] - r["off_proeXpassSum"]) / r["off_proePlays"] if r["off_proePlays"] > 0 else np.nan)
    vac_t, vac_r, qb_new, qb_ypa, qb_td, qb_att = (np.full(n, np.nan) for _ in range(6))
    cache = {}
    for i, (tk, tt) in enumerate(zip(out["team_k"], t1)):
        if tt is None:
            continue
        if tk not in cache:
            ros = [q for q in roster if roster_team[q] == tk]
            den_t = float(tms.loc[tt, "sum_rec_tgt"]) if tt in tms.index else 0.0
            den_r = float(tms.loc[tt, "sum_rush_att"]) if tt in tms.index else 0.0
            vt = 1.0 - sum(pt.get((q, tt), (0.0, 0.0))[0] for q in ros) / den_t if den_t > 0 else np.nan
            vr = 1.0 - sum(pt.get((q, tt), (0.0, 0.0))[1] for q in ros) / den_r if den_r > 0 else np.nan
            qbs = sorted([(-float(l1.loc[q, "pass_att"]), q) for q in ros if rpos[q] == "QB" and q in l1.index and l1.loc[q, "pass_att"] > 0])
            if qbs:
                q = qbs[0][1]
                r = l1.loc[q]
                cache[tk] = (vt, vr, float(r["lastTeam"] != tt), r["pass_yd"] / r["pass_att"], r["pass_td"] / r["pass_att"], r["pass_att"] / r["g"])
            else:
                cache[tk] = (vt, vr, np.nan, np.nan, np.nan, np.nan)
        vac_t[i], vac_r[i], qb_new[i], qb_ypa[i], qb_td[i], qb_att[i] = cache[tk]
    notqb = np.array([x != "QB" for x in pos])
    cols["vacTgt"][:], cols["vacRush"][:] = vac_t, vac_r
    for nme, arr in (("qbNew", qb_new), ("qbYpa1", qb_ypa), ("qbTdRate1", qb_td), ("qbAttPg1", qb_att)):
        cols[nme][:] = np.where(notqb, arr, np.nan)
    # gl (gamelogs, lags 1-2)
    ex = v.extras
    if ex is not None and len(ex):
        gsum = ex.groupby(["pid", "S"], sort=False).sum(numeric_only=True)
        for l in (1, 2):
            sl = gsum.xs(S - l, level="S") if (S - l) in gsum.index.get_level_values("S") else None
            def col(c):
                return sl[c].reindex(pids).to_numpy(float) if sl is not None else np.full(n, np.nan)
            cols["passEpaAtt%d" % l][:] = _ratio(col("gl_passEpa"), col("gl_att"))
            cols["cpoe%d" % l][:] = _ratio(col("gl_cpoeAtt"), col("gl_cpoeDen"))
            cols["sackRate%d" % l][:] = _ratio(col("gl_sacks"), col("gl_att") + col("gl_sacks"))
            cols["passAyAtt%d" % l][:] = _ratio(col("gl_passAy"), col("gl_att"))
            cols["yacRec%d" % l][:] = _ratio(col("gl_yac"), col("gl_rec"))
            cols["rushFdAtt%d" % l][:] = _ratio(col("gl_rushFd"), col("gl_carries"))
            cols["recFdTgt%d" % l][:] = _ratio(col("gl_recFd"), col("gl_tgt"))
            cols["rushEpaAtt%d" % l][:] = _ratio(col("gl_rushEpa"), col("gl_carries"))
            cols["recEpaTgt%d" % l][:] = _ratio(col("gl_recEpa"), col("gl_tgt"))
    df = pd.DataFrame({**out, **cols})
    return df


def apply_units(F, S, spec, units):
    """E1 treatment of an E0 feature frame whose origin is season S: each `pg`/`po` column of a position's feature set is divided by
    `units.div(P, q, S - lag)` with P = the position unless the spec states one. `raw` columns are never touched. Returns a copy."""
    F = F.copy()
    if units.era != "E1":
        return F
    for pos in POSITIONS:
        m = (F["position"] == pos).to_numpy()
        if not m.any():
            continue
        for nme, (_g, meta) in fmeta(spec, pos).items():
            if meta["kind"] not in ("pg", "po"):
                continue
            P = meta.get("P") or pos
            d = units.div(P, meta["q"], S - meta["lag"])
            if d != 1.0:
                F.loc[m, nme] = F.loc[m, nme].to_numpy(float) / d
    return F
