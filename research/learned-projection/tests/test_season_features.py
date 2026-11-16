"""LP-2a: T-M-1 (as-of), T-M-2 (feature units), T-M-3 (universe / kickoff roster / relocation), T-M-4 (era_team copy), T-M-9 (league mean), T-M-13 (gamelogs)."""
import json
import os
import subprocess
import unittest

import numpy as np
import pandas as pd

from lp import asof, era, extra, features, spec as spec_mod
from tests import synth_season as ss

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SPEC = spec_mod.small_spec("H", ss.SMALL_TOPN)


def snapshot(tables, S, n=0):
    v = asof.view(tables, S, n)
    u = features.universe(tables, S)
    pos = features.position_map(tables)
    ps = features.player_seasons(v, ss.KEYS, ss.WEIGHTS)
    F = features.season_features(v, u, u, SPEC, pos, ss.KEYS, ps=ps, weights=ss.WEIGHTS)
    kk = features.kickoff(v, u)
    mu = era.league_means(ps, SPEC)
    return {"ps": ps, "F": F, "kk": kk, "mu": mu}


def _clone(t, weeks=None, X=None, teams=None, teamctx=None, extras=None, seasons=None):
    w = (t.weeks if weeks is None else weeks).copy()
    w["rid"] = np.arange(len(w))
    return asof.Tables(w, t.teams if teams is None else teams, t.seasons if seasons is None else seasons, t.bench, X=t.X if X is None else X,
                       teamctx=t.teamctx if teamctx is None else teamctx, extras=t.extras if extras is None else extras)


def _lowest_rows(t, S):
    w = t.weeks
    u = set(features.universe(t, S))
    cur = w[(w["S"] == S) & w["pid"].isin(u)]
    return set(cur.sort_values(["pid", "w"]).drop_duplicates("pid")["rid"])


def scrambled(t, S, seed=7):
    """Every outcome of season >= S randomised, plus team/opp/home/roof of every season-S week row except each universe pid's lowest-w row."""
    rng = np.random.RandomState(seed)
    w = t.weeks.copy()
    X = t.X.copy()
    m = (w["S"] >= S).to_numpy()
    n = int(m.sum())
    for c in ["pts", "depthOrder"] + ss.RAW:
        w.loc[m, c] = rng.uniform(0, 99, n)
    w.loc[m, "played"] = rng.rand(n) < 0.5
    w.loc[m, "status"] = rng.choice(["P", "D", "X"], n)
    X[m] = rng.uniform(0, 99, (n, X.shape[1]))
    keep = _lowest_rows(t, S)
    other = (w["S"] == S).to_numpy() & ~w["rid"].isin(keep).to_numpy()
    k = int(other.sum())
    w.loc[other, "team"] = rng.choice(ss.TEAMS, k)
    w.loc[other, "opp"] = rng.choice(ss.TEAMS, k)
    w.loc[other, "home"] = rng.rand(k) < 0.5
    w.loc[other, "roof"] = rng.choice(["dome", "outdoors"], k)
    teams = t.teams.copy()
    for c in [c for c in teams.columns if c.startswith("sum_")]:
        teams.loc[teams["S"] >= S, c] = rng.uniform(0, 99, int((teams["S"] >= S).sum()))
    tc = t.teamctx.copy()
    mm = (tc["S"] >= S).to_numpy()
    for c in [c for c in tc.columns if c not in ("team", "S", "w")]:
        tc.loc[mm, c] = rng.uniform(0, 99, int(mm.sum()))
    ex = t.extras.copy()
    mm = (ex["S"] >= S).to_numpy()
    for c in [c for c in ex.columns if c.startswith("gl_")]:
        ex.loc[mm, c] = rng.uniform(0, 99, int(mm.sum()))
    se = t.seasons.copy()
    mm = (se["S"] >= S).to_numpy()
    for c in ["gamesPlayed", "fantasyPoints", "offPct"]:
        se.loc[mm, c] = rng.uniform(0, 99, int(mm.sum()))
    se.loc[mm, "hasRow"] = rng.rand(int(mm.sum())) < 0.5
    return _clone(t, w, X, teams, tc, ex, se)


def deleted(t, S):
    """Season-S rows other than each universe pid's lowest-w row, every later season's rows, and the teamctx/extras rows of season >= S removed;
    outcome columns and X of the kept rows nulled; the (team, S, w) rows of season >= S kept with sum_* nulled."""
    keep = _lowest_rows(t, S)
    w = t.weeks
    kept = w[(w["S"] < S) | w["rid"].isin(keep)].copy()
    X = t.X[kept["rid"].to_numpy()].copy()
    m = (kept["S"] >= S).to_numpy()
    for c in ["pts", "depthOrder"] + ss.RAW:
        kept.loc[m, c] = np.nan
    kept.loc[m, "played"] = False
    kept.loc[m, "status"] = None
    X[m] = np.nan
    teams = t.teams.copy()
    for c in [c for c in teams.columns if c.startswith("sum_")]:
        teams.loc[teams["S"] >= S, c] = np.nan
    return _clone(t, kept, X, teams, t.teamctx[t.teamctx["S"] < S], t.extras[t.extras["S"] < S])


class TestAsOf(unittest.TestCase):
    """T-M-1. Fails if a feature reads a season-S outcome, a later-week roster row, or a week past the origin."""

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = ss.make_panel()

    def test_scramble_and_delete_leave_origin_features_identical(self):
        S = 2018
        ref = snapshot(self.t, S)
        self.assertGreater(len(ref["F"]), 10)
        for name, var in (("scramble", scrambled(self.t, S)), ("delete", deleted(self.t, S))):
            got = snapshot(var, S)
            for k in ("ps", "F", "kk"):
                pd.testing.assert_frame_equal(ref[k].reset_index(drop=True), got[k].reset_index(drop=True), obj="%s/%s" % (name, k))
            self.assertEqual(ref["mu"], got["mu"], name)

    def test_origin_three_and_optional_tables(self):
        t = self.t
        v = asof.view(t, 2018, 3)
        self.assertFalse(((v.teamctx["S"] == 2018) & (v.teamctx["w"] > 3)).any())
        self.assertFalse((v.teamctx["S"] > 2018).any())
        self.assertFalse(((v.extras["S"] == 2018) & (v.extras["w"] > 3)).any())
        self.assertFalse((v.extras["S"] > 2018).any())
        self.assertEqual(len(v.X), len(v.weeks))
        plain = asof.Tables(t.weeks, t.teams, t.seasons, t.bench)
        v0 = asof.view(plain, 2018, 3)
        for a in ("weeks", "teams", "schedule", "team_weeks", "seasons", "season_row"):
            pd.testing.assert_frame_equal(getattr(v, a), getattr(v0, a), obj=a)
        pd.testing.assert_series_equal(pd.Series(v.prior).sort_index(), pd.Series(v0.prior).sort_index())
        self.assertIsNone(v0.X)


class TestUnits(unittest.TestCase):
    """T-M-2 (feature side): E1 divides pg/po features by the mean of the same (P, q) in the lag season; raw features are never divided."""

    def test_apply_units(self):
        mu = {key: {s: 1.0 + 0.1 * (s - 2010) + i * 0.01 for s in range(2012, 2020)} for i, key in enumerate(era.quantities(SPEC))}
        u = era.Units(mu, "E1", 2019)
        names = list(features.fmeta(SPEC, "WR"))
        F = pd.DataFrame({"pid": ["a"], "position": ["WR"], **{n: [10.0] for n in names}})
        G = features.apply_units(F, 2020, SPEC, u)
        self.assertAlmostEqual(G.loc[0, "qbYpa1"], 10.0 / mu[("QB", "pass_yd")][2019])
        self.assertAlmostEqual(G.loc[0, "compOpp"], 10.0 / mu[("WR", "oppoPg")][2019])
        self.assertAlmostEqual(G.loc[0, "ppg2"], 10.0 / mu[("WR", "ppg")][2018])
        self.assertAlmostEqual(G.loc[0, "rec_yd3"], 10.0 / mu[("WR", "rec_yd")][2017])
        for raw in ("tmEpaPlay", "cpoe1", "tgtShare1", "age", "gs1", "g1", "pass_att1"):
            self.assertEqual(G.loc[0, raw], 10.0, raw)
        self.assertEqual(features.apply_units(F, 2020, SPEC, era.Units(mu, "E0", 2019)).loc[0, "qbYpa1"], 10.0)


class TestUniverseKickoff(unittest.TestCase):
    """T-M-3. Fails if the roster includes non-universe players or a relocated team reads as a move."""

    @classmethod
    def setUpClass(cls):
        R = ss.Rows()
        # 2019 team AAA: one game, targets 50 / 30 / 20 (team sum 100); p1 stays, p2 moves to BBB, p3 is outside the 2020 universe
        for pid, tg in (("p1", 50), ("p2", 30), ("p3", 20)):
            R.week(pid, 2019, 1, "WR", "AAA", x=ss.xvec(rec=tg / 2, rec_yd=tg * 8), raw={"rec_tgt": tg})
            R.season(pid, 2019, "WR", "AAA", 1, 5.0, tg=1)
        R.week("p5", 2019, 1, "WR", "AAA", x=ss.xvec(rec=40), raw={"rec_tgt": 80})          # p5: huge oppoPg, outside the 2020 universe
        R.season("p5", 2019, "WR", "AAA", 1, 5.0, tg=1)
        R.team_week("AAA", 2019, 1, dict(rec_tgt=180))
        # (p1,p2,p3 sum 100 + p5 80; the AAA team sum is set to the three-player 100 for the vacancy arithmetic)
        R.teams[-1]["sum_rec_tgt"] = 100.0
        R.team_week("BBB", 2019, 1, dict(rec_tgt=0))
        # LV / OAK: p6's 2019 rows are OAK (era code), his 2020 row LV
        R.week("p6", 2019, 1, "WR", "OAK", x=ss.xvec(rec=3), raw={"rec_tgt": 5})
        R.season("p6", 2019, "WR", "OAK", 1, 5.0, tg=1)
        R.team_week("OAK", 2019, 1, dict(rec_tgt=5, rush_att=5))
        # 2020 schedule rows (week 1) and the 2020 team schedule: AAA 3 games, BBB 2, LV 1
        for pid, team in (("p1", "AAA"), ("p2", "BBB"), ("p4", "AAA"), ("p6", "LV")):
            R.week(pid, 2020, 1, "WR", team, played=False, in_universe=True)
            R.season(pid, 2020, "WR", team, 0, 0.0, tg=3 if team == "AAA" else 2, has=False, universe=True, draft_year=2020 if pid == "p4" else 2010)
        R.season("p5", 2020, "WR", "AAA", 0, 0.0, tg=3, has=False, universe=False)
        R.season("p5", 2021, "WR", "AAA", 0, 0.0, tg=3, has=False, universe=True)
        R.season("p3", 2020, "WR", "AAA", 0, 0.0, tg=3, has=False, universe=False)
        R.week("p5", 2021, 1, "WR", "AAA", played=False)
        for w in (1, 2, 3):
            R.team_week("AAA", 2020, w)
        for w in (1, 2):
            R.team_week("BBB", 2020, w)
        R.team_week("LV", 2020, 1)
        cls.t = R.tables()
        cls.spec = SPEC

    def _feats(self, S=2020):
        from lp import season_models
        st = season_models.Store(self.t, ss.KEYS, ss.WEIGHTS, SPEC)
        return st, st.feats(S)

    def test_universe_equals_season_targets(self):
        from lp import baselines
        R, t, _p = ss.make_panel()
        for S in (2016, 2018):
            self.assertEqual(features.universe(t, S), list(baselines.season_targets(t, S)["pid"]))

    def test_vacancy_roster_and_relocation(self):
        st, F = self._feats(2020)
        self.assertEqual(st.universe(2020), ["p1", "p2", "p4", "p6"])
        self.assertAlmostEqual(F.loc["p1", "vacTgt"], 0.5)          # p1 (50) stays; p2 moved, p3 is outside the universe
        self.assertAlmostEqual(F.loc["p4", "vacTgt"], 0.5)
        self.assertEqual(F.loc["p1", "teamChange"], 0.0)
        # the non-universe p5 gets a team_k (season-row fallback) but never enters the roster
        self.assertEqual(F.loc["p5", "team_k"], "AAA")
        self.assertEqual(F.loc["p1", "posRank1"], 1.0)
        self.assertEqual(F.loc["p1", "compOpp"], 0.0)
        self.assertEqual(F.loc["p1", "compTop"], 0.0)
        # LV <- OAK: not a move, tm* and vac* finite
        self.assertEqual(F.loc["p6", "team_k"], "LV")
        self.assertEqual(F.loc["p6", "teamChange"], 0.0)
        self.assertTrue(np.isfinite(F.loc["p6", ["tmPassPg", "tmEpaPlay", "vacTgt", "vacRush"]].to_numpy(float)).all())
        self.assertEqual(F.loc["p2", "teamChange"], 1.0)

    def test_team_games_count(self):
        v = asof.view(self.t, 2020, 0)
        kk = features.kickoff(v, ["p1", "p2", "p6", "p5", "nobody"]).set_index("pid")
        self.assertEqual(kk.loc["p1", "teamGames_k"], 3.0)
        self.assertEqual(kk.loc["p2", "teamGames_k"], 2.0)           # a shorter schedule is counted as played, never 17
        self.assertEqual(kk.loc["p6", "teamGames_k"], 1.0)
        self.assertEqual(kk.loc["p5", "team_k"], "AAA")
        self.assertTrue(np.isnan(kk.loc["nobody", "teamGames_k"]))


class TestEraTeam(unittest.TestCase):
    """T-M-4. Fails if the copy drifts from lib/nflverse.mjs eraTeam (fails, never skips, without node)."""

    def test_equals_node_original(self):
        codes = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI",
                 "PIT", "SEA", "SF", "TB", "TEN", "WAS", "STL", "SD", "OAK"]
        self.assertEqual(len(codes), 35)
        url = "file://" + os.path.join(REPO, "lib", "nflverse.mjs")
        js = "import { eraTeam } from '%s'; const out = {}; for (const c of %s) for (let s = 2012; s <= 2025; s++) out[c + ':' + s] = eraTeam(c, s); console.log(JSON.stringify(out));" % (url, json.dumps(codes))
        r = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        want = json.loads(r.stdout)
        got = {"%s:%d" % (c, s): era.era_team(c, s) for c in codes for s in range(2012, 2026)}
        self.assertEqual(got, want)


class TestLeagueMean(unittest.TestCase):
    """T-M-9. Fails on a mean of rates, a wrong N or a per-view fallback."""

    @staticmethod
    def _ps(rows):
        base = dict(pid="", s=2018, position="QB", g=10.0, pts=0.0, oppo=0.0, **{c: 0.0 for c in ss.KEYS + ss.RAW})
        return pd.DataFrame([{**base, **r} for r in rows])

    def test_top_n_ratio_of_sums(self):
        spec = {"targets": SPEC["targets"], "topN": {"QB": 2, "RB": 2, "WR": 2, "TE": 2}}
        ps = self._ps([dict(pid="a", oppo=500, pass_att=500, pass_yd=4000), dict(pid="b", oppo=400, pass_att=100, pass_yd=1000),
                       dict(pid="c", oppo=400, pass_att=300, pass_yd=1200), dict(pid="d", oppo=10, pass_att=10, pass_yd=1000)])
        mu = era.league_means(ps, spec)
        self.assertAlmostEqual(mu[("QB", "pass_yd")][2018], (4000 + 1000) / (500 + 100))        # tie at the cut b/c -> ascending pid -> b
        self.assertNotAlmostEqual(mu[("QB", "pass_yd")][2018], (4000 / 500 + 1000 / 100) / 2)    # not the mean of player rates
        ps.loc[ps["pid"] == "c", ["pass_att", "pass_yd"]] = [1, 9999]                             # rank N + 1 moves nothing
        ps.loc[ps["pid"] == "d", ["pass_att", "pass_yd"]] = [1, 9999]
        self.assertAlmostEqual(era.league_means(ps, spec)[("QB", "pass_yd")][2018], 5000 / 600)
        self.assertAlmostEqual(mu[("QB", "ppg")][2018], 0.0)

    def test_raw_fallback_is_per_fit(self):
        mu = {("WR", "rec"): {2012: 0.5, 2013: 0.5, 2014: -1.0, 2015: 0.5}}
        u = era.Units(mu, "E1", 2015)
        self.assertIn(("WR", "rec"), u.fallback)
        for s in (2012, 2013, 2015):
            self.assertEqual(u.div("WR", "rec", s), 1.0)
        self.assertNotIn(("WR", "rec"), era.Units(mu, "E1", 2013).fallback)          # a bad season past the fit's last season does not count
        self.assertEqual(era.Units(mu, "E0", 2015).div("WR", "rec", 2013), 1.0)


class TestGamelogs(unittest.TestCase):
    """T-M-13. Fails on a look-ahead read, a post-season sum or an averaged rate."""

    FIX = os.path.join(HERE, "tests", "fixtures", "gamelogs-repo")

    def test_look_ahead_raises(self):
        with self.assertRaises(extra.LookAheadError):
            extra.load_gamelogs_season(2026, repo=self.FIX)

    def test_reg_only_and_weighted_cpoe(self):
        d = extra.load_gamelogs_season(2019, repo=self.FIX)
        a = d[d["pid"] == "101"].set_index("w")
        self.assertEqual(sorted(a.index), [1, 2, 3])                 # the POST week 4 is not summed
        self.assertEqual(a["gl_att"].sum(), 70.0)
        self.assertEqual(a["gl_carries"].sum(), 9.0)                  # 3 REG games x 3 carries, not the POST game's 77
        self.assertAlmostEqual(a["gl_cpoeAtt"].sum() / a["gl_cpoeDen"].sum(), (5.0 * 10 + -1.0 * 30) / 40)   # attempt-weighted, the game with no cpoe skipped
        self.assertEqual(a.loc[2, "gl_cpoeDen"], 0.0)
        self.assertEqual(d[d["pid"] == "102"]["gl_carries"].iloc[0], 0.0)    # absent -> 0

    def test_view_extras_never_hold_season_s(self):
        ex = extra.build_extras(2018, 2019, repo=self.FIX)
        R = ss.Rows()
        for S in (2018, 2019):
            R.week("101", S, 1, "QB", "AAA", x=ss.xvec(pass_yd=10))
            R.season("101", S, "QB", "AAA", 1, 1.0)
            R.team_week("AAA", S, 1)
        t = R.tables()
        t.extras = ex
        v = asof.view(t, 2019, 0)
        self.assertEqual(set(v.extras["S"]), {2018})
        self.assertEqual(len(asof.view(t, 2018, 0).extras), 0)
        self.assertEqual(set(extra.file_hashes(2018, 2019, repo=self.FIX)), {"2018", "2019"})


if __name__ == "__main__":
    unittest.main()
