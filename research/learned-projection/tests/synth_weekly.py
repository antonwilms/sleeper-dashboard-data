"""LP-2b-1a synthetic weekly panels (small, deterministic, no cache): real paired opponents, byes as missing team rows, out-of-universe players,
historic rosters, every `def_*` team-context field, and `scrambled_full` / `deleted_full` (the test_asof future semantics extended to X,
teamctx, extras and the later seasons' `seasons` / `bench` rows). `tests/synth.py`, `synth_season.py` and `test_asof.py` are only imported."""
import numpy as np

from lp import asof, io, spec as spec_mod
from tests import synth_season as ss
from tests import test_asof as ta

TEAMS = ss.TEAMS


def small_spec(name):
    """The three overrides of 2a's helper (`tests/test_season_models.py`): small top-N cuts, calibMinRows 1, the grid cut to its first entry."""
    s = spec_mod.small_spec(name, ss.SMALL_TOPN)
    s["calibMinRows"] = 1
    s["grid"] = s["grid"][:1]
    return s


OPTIONS = [((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))]
ROOFS = ("dome", "outdoors", "closed", "retractable")
LATE_FROM = 2019                        # the season the `late` players enter the season universe
DEF_FIELDS = ["def_plays", "def_passPlays", "def_rushPlays", "def_epaSum", "def_epaPlays", "def_passEpaSum", "def_passEpaPlays", "def_rushEpaSum", "def_rushEpaPlays",
              "def_successes", "def_successPlays", "def_rzTripsAllowed", "def_rzTdTripsAllowed", "def_pointsAllowed"]


def _schedule(rng, seasons, W):
    """sched[(S, w)] = {team: (opp, home, roof)} — only the teams that play; byes[S] = {team: bye week}."""
    sched, byes = {}, {}
    for S in seasons:
        b1, b2 = (int(x) for x in sorted(rng.choice(np.arange(2, W), 2, replace=False)))
        perm = [int(x) for x in rng.permutation(4)]
        bye = {TEAMS[perm[0]]: b1, TEAMS[perm[1]]: b1, TEAMS[perm[2]]: b2, TEAMS[perm[3]]: b2}
        byes[S] = bye
        for w in range(1, W + 1):
            if w == b1:
                pairs = [(perm[2], perm[3])]
            elif w == b2:
                pairs = [(perm[0], perm[1])]
            else:
                pairs = OPTIONS[int(rng.randint(len(OPTIONS)))]
            d = {}
            for x, y in pairs:
                roof = ROOFS[int(rng.randint(len(ROOFS)))]
                hx = bool(rng.rand() < 0.5)
                d[TEAMS[x]] = (TEAMS[y], hx, roof)
                d[TEAMS[y]] = (TEAMS[x], not hx, roof)
            sched[(S, w)] = d
    return sched, byes


def _ctx(rng):
    pp, rp, dpp, drp = (int(rng.randint(25, 41)), int(rng.randint(18, 31)), int(rng.randint(25, 41)), int(rng.randint(18, 31)))
    trips = int(rng.randint(1, 6))
    return dict(off_plays=float(pp + rp + 4), off_passPlays=float(pp), off_rushPlays=float(rp), off_epaSum=float(rng.normal(0, 8)), off_epaPlays=float(pp + rp + 1),
                off_passEpaSum=float(rng.normal(0, 6)), off_passEpaPlays=float(pp + 1), off_proePlays=float(pp + rp - 2), off_proePassPlays=float(pp + 2),
                off_proeXpassSum=float(rng.uniform(0.4, 0.6) * (pp + 2)), off_pointsScored=float(rng.randint(10, 35)),
                def_plays=float(dpp + drp + 4), def_passPlays=float(dpp), def_rushPlays=float(drp), def_epaSum=float(rng.normal(0, 8)), def_epaPlays=float(dpp + drp + 1),
                def_passEpaSum=float(rng.normal(0, 6)), def_passEpaPlays=float(dpp + 1), def_rushEpaSum=float(rng.normal(0, 4)), def_rushEpaPlays=float(drp + 2),
                def_successes=float(int(0.4 * (dpp + drp))), def_successPlays=float(dpp + drp), def_rzTripsAllowed=float(trips), def_rzTdTripsAllowed=float(int(rng.randint(0, trips + 1))),
                def_pointsAllowed=float(rng.randint(7, 35)))


def make_weekly_panel(seed=3, seasons=range(2012, 2022), W=8, per_pos=None):
    """(Rows, tables, panel) with `Rows.info` = {byes, sched, late, never, callups}. Every requirement of the LP-2b-1a plan §16 is asserted here."""
    seasons = list(seasons)
    rng = np.random.RandomState(seed)
    per_pos = per_pos or {"QB": 5, "RB": 7, "WR": 9, "TE": 5}
    R = ss.Rows()
    sched, byes = _schedule(rng, seasons, W)
    players = []
    k = 0
    for pos, n in per_pos.items():
        for _ in range(n):
            players.append(dict(pid="%s%02d" % (pos[0], k), pos=pos, team=TEAMS[k % 4], start=int(rng.choice([2012, 2012, 2013, 2014, 2015, 2016, 2017, 2018])),
                                end=int(rng.choice([2019, 2021, 2021, 2021])), skill=float(rng.uniform(0.5, 1.5)), p=float(rng.uniform(0.6, 1.0)), age0=int(rng.randint(21, 28)), kind="main"))
            k += 1
    late, never = {}, {}
    for pos in per_pos:
        for kind, store_ in (("late", late), ("never", never)):
            pid = "%s%s%02d" % ("L" if kind == "late" else "N", pos[0], k)
            players.append(dict(pid=pid, pos=pos, team=TEAMS[k % 4], start=2012, end=max(seasons), skill=float(rng.uniform(0.7, 1.3)), p=0.85, age0=24, kind=kind))
            store_[pos] = pid
            k += 1
    callups = {"WR": "CW00", "QB": "CQ00"}
    for S in seasons:
        sums = {(t, w): dict(rec_tgt=0, rush_att=0, pass_att=0, rec_rz_tgt=0, rush_rz_att=0) for t in TEAMS for w in range(1, W + 1) if t in sched[(S, w)]}
        for pl in players:
            if not (pl["start"] <= S <= pl["end"]):
                continue
            if rng.rand() < 0.15:
                pl["team"] = TEAMS[int(rng.randint(4))]
            in_season_uni = not (pl["kind"] == "never" or (pl["kind"] == "late" and S < LATE_FROM))
            gp, fp = 0, 0.0
            for w in range(1, W + 1):
                if pl["team"] not in sched[(S, w)]:
                    continue                                                  # the team's bye: no row at all
                played = rng.rand() < pl["p"]
                if not played:
                    R.week(pl["pid"], S, w, pl["pos"], pl["team"], played=False, status=str(rng.choice(["D", "D", "X"])), depth=(float(rng.randint(1, 4)) if rng.rand() < 0.5 else None))
                    continue
                s = pl["skill"]
                x, raw = _stat_line(rng, pl["pos"], s)
                R.week(pl["pid"], S, w, pl["pos"], pl["team"], played=True, x=x, raw=raw, depth=float(1 + (s < 0.8)))
                _add_sums(sums[(pl["team"], w)], raw)
                gp += 1
                fp += ss.pts_of(x)
                R.extras.append(_gl_row(pl["pid"], S, w, x, raw))
            R.season(pl["pid"], S, pl["pos"], pl["team"], gp, round(fp, 2), tg=W - 1, has=gp > 0, age=float(pl["age0"] + S - pl["start"]), draft_year=pl["start"] - 1,
                     draft_round=float(1 + (int(pl["pid"][-2:]) % 7)), draft_ovr=float(30 + 20 * (int(pl["pid"][-2:]) % 7)), off=float(rng.uniform(0.4, 0.95)), universe=in_season_uni)
        if S >= 2013:                                                         # call-ups: played, never in the weekly universe, no `seasons` row
            for pos, cpid in callups.items():
                team = TEAMS[0]
                for w in (3, 4, 5):
                    if team not in sched[(S, w)]:
                        continue
                    x, raw = _stat_line(rng, pos, 0.5)
                    R.week(cpid, S, w, pos, team, played=True, x=x, raw=raw, in_universe=False)
                    _add_sums(sums[(team, w)], raw)
                    R.extras.append(_gl_row(cpid, S, w, x, raw))
        for (t, w), sm in sums.items():
            R.team_week(t, S, w, sm, ctx=_ctx(rng))
    # real, paired opponents / home / roof; historic rosters; roster statuses of players who did not play
    for r in R.weeks:
        opp, home, roof = sched[(r["S"], r["w"])][r["team"]]
        r.update(opp=opp, home=home, roof=roof, rwOracle=bool(r["S"] <= 2015))
        r["rw"] = [[r["team"], "ACT" if r["played"] else str(rng.choice(["ACT", "INA", "RES", "PUP", "CUT"]))]]
    for r in R.teams:
        r["opp"] = sched[(r["S"], r["w"])][r["team"]][0]
    by = {(r["pid"], r["S"]): r for r in R.seasons}
    for r in R.seasons:
        p1, p2 = by.get((r["pid"], r["S"] - 1)), by.get((r["pid"], r["S"] - 2))
        ppg = np.nan
        if p1 and p2 and p1["gamesPlayed"] + p2["gamesPlayed"] > 0:
            ppg = (p1["fantasyPoints"] + p2["fantasyPoints"]) / (p1["gamesPlayed"] + p2["gamesPlayed"])
        R.bench.append(dict(pid=r["pid"], S=r["S"], position=r["position"], b1_covered=bool(rng.rand() < 0.7), b1_total=float(rng.uniform(40, 200)), b2_ppg=ppg,
                            b2_total=ppg * (W - 1) if np.isfinite(ppg) else np.nan))
    weeks, X, teams_df, teamctx, extras, seasons_df, bench = R.build()
    tables = asof.Tables(weeks, teams_df, seasons_df, bench, X=X, teamctx=teamctx, extras=extras)
    meta = {"keys": ss.KEYS, "weights": ss.WEIGHTS, "generatedAt": ss.ANCHOR, "dataRev": "synthetic", "from": 2014, "to": max(seasons), "scoringFixture": "synthetic", "counts": {}}
    panel = io.Panel(meta, weeks, X, teams_df, seasons_df, bench)
    R.info = {"byes": byes, "sched": sched, "late": late, "never": never, "callups": callups, "W": W}
    _assert_fixture(R, tables, seasons, W, per_pos)
    return R, tables, panel


def _stat_line(rng, pos, s):
    pa = ra = rt = 0
    if pos == "QB":
        pa, ra = int(rng.poisson(30 * s)) + 1, int(rng.poisson(3)) + 1
        kw = dict(pass_yd=7 * pa * rng.uniform(0.8, 1.2), pass_td=float(rng.poisson(0.05 * pa)), pass_int=float(rng.poisson(0.025 * pa)), rush_yd=4.0 * ra,
                  rush_td=float(rng.poisson(0.03 * ra)), fum_lost=float(rng.rand() < 0.25))
    else:
        ra = int(rng.poisson(12 * s)) + 1 if pos == "RB" else int(rng.poisson(0.3))
        rt = int(rng.poisson({"RB": 3, "WR": 7, "TE": 5}[pos] * s)) + 1
        rec = int(rng.binomial(rt, 0.65))
        kw = dict(rush_yd=4.2 * ra, rush_td=float(rng.poisson(0.03 * ra)), rec=float(rec), rec_yd=float(rec * rng.uniform(6, 13)), rec_td=float(rng.poisson(0.05 * rt)),
                  fum_lost=float(rng.rand() < 0.2), kr_yd=float(rng.rand() < 0.2) * 20)
        if pos == "RB":
            kw["bonus_fd_rb"] = float(rng.poisson(0.2 * (ra + rt)))
            kw["bonus_rush_yd_100"] = float(rng.rand() < 0.3)
        elif pos == "WR":
            kw["bonus_fd_wr"] = float(rng.poisson(0.2 * rt))
            kw["bonus_rec_yd_100"] = float(rng.rand() < 0.3)
            kw["pr_yd"] = float(rng.rand() < 0.3) * 8
        else:
            kw["bonus_fd_te"] = float(rng.poisson(0.2 * rt))
            kw["bonus_rec_te"] = float(rec)
    raw = dict(pass_att=pa, rush_att=ra, rec_tgt=rt, rec_air_yd=rt * 9, rec_rz_tgt=int(rt > 5), rush_rz_att=int(ra > 14), pass_rz_att=int(pa > 25), pass_cmp=int(pa * 0.6), pass_sack=int(pa > 20))
    return ss.xvec(**kw), raw


def _add_sums(t, raw):
    t["rec_tgt"] += raw["rec_tgt"]
    t["rush_att"] += raw["rush_att"]
    t["pass_att"] += raw["pass_att"]
    t["rec_rz_tgt"] += raw["rec_rz_tgt"]
    t["rush_rz_att"] += raw["rush_rz_att"]


def _gl_row(pid, S, w, x, raw):
    pa, ra, rt = float(raw["pass_att"]), float(raw["rush_att"]), float(raw["rec_tgt"])
    return dict(pid=pid, S=S, w=w, gl_att=pa, gl_passEpa=pa * 0.05, gl_cpoeAtt=pa * 0.8 * 0.5, gl_cpoeDen=pa * 0.8, gl_passAy=pa * 8, gl_sacks=float(pa > 20),
                gl_rec=float(x[ss.KEYS.index("rec")]), gl_yac=rt * 2, gl_carries=ra, gl_tgt=rt, gl_rushFd=float(int(ra) // 4), gl_recFd=float(int(rt) // 3),
                gl_rushEpa=0.01 * ra, gl_recEpa=0.02 * rt)


def _assert_fixture(R, tables, seasons, W, per_pos):
    wk, tm, tc, se, ex = tables.weeks, tables.teams, tables.teamctx, tables.seasons, tables.extras
    assert set(TEAMS) == set(wk["team"]) == set(tm["team"]) == set(tc["team"]), "the four teams"
    for c in ("inSeasonUniverse", "hasRow"):
        assert se[c].dtype == bool, c
    for c in ("inUniverse", "played"):
        assert wk[c].dtype == bool, c
    # real, paired opponents on tables.schedule (built after the frame was patched)
    sc = tables.schedule[["S", "w", "team", "opp", "home", "roof"]].drop_duplicates()
    assert len(sc) == len(sc[["S", "w", "team"]].drop_duplicates()), "one (opp, home, roof) per team-week"
    key = {(a, b, c, d): (h, r) for a, b, c, d, h, r in zip(sc["S"], sc["w"], sc["team"], sc["opp"], sc["home"], sc["roof"])}
    for (S, w, t, o), (h, r) in key.items():
        if (S, w, o, t) in key:                                              # a team with no row that week (call-up only) has no mirror
            h2, r2 = key[(S, w, o, t)]
            assert h != h2 and r == r2, "A plays B <=> B plays A; exactly one home; one roof"
    for r in R.weeks:
        assert r["rwOracle"] == (r["S"] <= 2015)
    # byes: a missing (teams, teamctx, weeks) row; two teams per bye week; every team plays week W
    tw = tables.team_weeks
    gap = False
    for S in seasons:
        by = R.info["byes"][S]
        assert sorted(by.values()) == sorted(list(set(by.values())) * 2) and len(set(by.values())) == 2 and all(2 <= b <= W - 1 for b in by.values())
        for t in TEAMS:
            played = set(tw[(tw["S"] == S) & (tw["team"] == t)]["w"])
            assert played == set(range(1, W + 1)) - {by[t]} and W in played, (S, t)
            assert by[t] not in set(tc[(tc["S"] == S) & (tc["team"] == t)]["w"]) and by[t] not in set(wk[(wk["S"] == S) & (wk["team"] == t)]["w"])
            gap = gap or (by[t] - 1 in played and by[t] + 1 in played)
        assert (se[se["S"] == S]["teamGames"] == W - 1).all()
    assert gap, "some team has a gap in its team weeks"
    # out-of-universe players: played weekly-universe rows with inSeasonUniverse False in every season 2014..2018 present; late ones enter in LATE_FROM
    for pos in per_pos:
        for s in [s for s in range(2014, 2019) if s in seasons]:
            nu = se[(se["S"] == s) & (se["position"] == pos) & ~se["inSeasonUniverse"]]["pid"]
            r = wk[(wk["S"] == s) & wk["pid"].isin(set(nu)) & wk["inUniverse"] & wk["played"]]
            assert len(r), ("out-of-universe played rows", pos, s)
        if 2018 in seasons and LATE_FROM in seasons:
            pid = R.info["late"][pos]
            a = se[(se["pid"] == pid) & (se["S"] == 2018)]["inSeasonUniverse"]
            b = se[(se["pid"] == pid) & (se["S"] == LATE_FROM)]["inSeasonUniverse"]
            assert len(a) and len(b) and not a.iloc[0] and b.iloc[0]
    # every def_* field and pairwise-distinct copied denominators
    for c in DEF_FIELDS:
        assert c in tc.columns, c
    for grp in (["off_plays", "off_epaPlays", "off_proePlays", "off_passPlays"], ["def_epaPlays", "def_plays"]):
        for i, a in enumerate(grp):
            for b in grp[i + 1:]:
                assert (tc[a] != tc[b]).all(), (a, b)
    tots = [float(ex[c].sum()) for c in ("gl_att", "gl_carries", "gl_tgt", "gl_rec", "gl_cpoeDen")]
    assert len(set(tots)) == len(tots), tots


# ── the future semantics of test_asof, extended ─────────────────────────────────────────────────────────────
def _past_mask(df, S, n):
    return ((df["S"] > S) | ((df["S"] == S) & (df["w"] > n))).to_numpy()


def scrambled_full(t, S, n, seed=99):
    """`test_asof.scrambled` plus: X of past-origin rows randomised, past-origin teamctx / extras values randomised, later seasons' `seasons` rows
    (inSeasonUniverse re-drawn as booleans, outcomes randomised) and `bench` rows randomised."""
    base = ta.scrambled(t, S, n, seed)
    rng = np.random.RandomState(seed + 1)
    X = t.X.copy()
    m = _past_mask(t.weeks, S, n)
    X[t.weeks["rid"].to_numpy()[m]] = rng.uniform(0, 99, (int(m.sum()), X.shape[1]))
    tc = t.teamctx.copy()
    mt = _past_mask(tc, S, n)
    for c in [c for c in tc.columns if c not in ("team", "S", "w")]:
        tc.loc[mt, c] = rng.uniform(0, 99, int(mt.sum()))
    ex = t.extras.copy()
    me = _past_mask(ex, S, n)
    for c in [c for c in ex.columns if c.startswith("gl_")]:
        ex.loc[me, c] = rng.uniform(0, 99, int(me.sum()))
    se = base.seasons.copy()
    later = se["S"] > S
    se.loc[later, "inSeasonUniverse"] = rng.rand(int(later.sum())) < 0.5
    se["inSeasonUniverse"] = se["inSeasonUniverse"].astype(bool)
    se.loc[later, "hasRow"] = rng.rand(int(later.sum())) < 0.5
    se["hasRow"] = se["hasRow"].astype(bool)
    return asof.Tables(base.weeks, base.teams, se, base.bench, X=X, teamctx=tc, extras=ex)


def deleted_full(t, S, n):
    """`test_asof.deleted` plus: X of past-origin rows NaN, past-origin teamctx / extras rows removed, later seasons' `seasons` and `bench` rows removed."""
    base = ta.deleted(t, S, n)
    X = t.X.copy()
    m = _past_mask(t.weeks, S, n)
    X[t.weeks["rid"].to_numpy()[m]] = np.nan
    tc = t.teamctx[~_past_mask(t.teamctx, S, n)].copy()
    ex = t.extras[~_past_mask(t.extras, S, n)].copy()
    return asof.Tables(base.weeks, base.teams, base.seasons, base.bench, X=X, teamctx=tc, extras=ex)


# ── hand-built teams (T-W-6, T-W-7, T-W-17) ─────────────────────────────────────────────────────────────────
class Mini:
    """Two teams (AAA, BBB), weeks 1..W of season S, every row written explicitly. `play` / `miss` add a week row; team sums are the sum of the
    played rows' raw columns unless overridden with `sums[(team, w)]`; every team-week carries the full team context (`ctx[(team, w)]` overrides)."""

    def __init__(self, S=2018, W=4):
        self.R, self.S, self.W = ss.Rows(), S, W
        self.sums, self.ctx, self.extra_ctx, self.pos = {}, {}, [], {}

    def _row(self, pid, pos, w, team, played, raw, status, rwst, x, depth, universe, opp):
        self.pos[pid] = pos
        self.R.week(pid, self.S, w, pos, team, played=played, x=x, raw=raw or {}, status=status, depth=depth, in_universe=universe, opp=opp or ("BBB" if team == "AAA" else "AAA"))
        r = self.R.weeks[-1]
        r["rw"] = [[team, rwst]] if rwst else []
        r["rwOracle"] = bool(self.S <= 2015)

    def play(self, pid, pos, w, team="AAA", raw=None, rwst="ACT", status=None, x=None, depth=None, universe=True, opp=None):
        self._row(pid, pos, w, team, True, raw, status, rwst, x, depth, universe, opp)

    def miss(self, pid, pos, w, team="AAA", status="D", rwst="ACT", depth=None, universe=True, opp=None):
        self._row(pid, pos, w, team, False, None, status, rwst, None, depth, universe, opp)

    def tables(self):
        R, S = self.R, self.S
        rng = np.random.RandomState(0)
        for team in ("AAA", "BBB"):
            for w in range(1, self.W + 1):
                sm = dict(rec_tgt=0, rush_att=0, pass_att=0, rec_rz_tgt=0, rush_rz_att=0)
                for r in R.weeks:
                    if r["S"] == S and r["w"] == w and r["team"] == team and r["played"]:
                        _add_sums(sm, r)
                sm.update(self.sums.get((team, w), {}))
                R.team_week(team, S, w, sm, ctx={**_ctx(rng), **self.ctx.get((team, w), {})})
        for team, Sx, w, ctx in self.extra_ctx:
            R.team_week(team, Sx, w, {}, ctx={**_ctx(rng), **ctx})
        for pid, pos in self.pos.items():
            for s in (S - 1, S):
                R.season(pid, s, pos, "AAA", 10, 100.0, tg=16)
        return R.tables()
