"""T-PY-3 (future scramble / delete), T-PY-4 (lines and oracle rows), T-PY-10 (week-1 P(plays))."""
import unittest

import numpy as np
import pandas as pd

from lp import asof, baselines
from lp.asof import Tables
from tests import synth

S0, N0 = 2018, 3          # origin (S, n)
OUTCOME = ["status", "played", "pts", "depthOrder", "spreadLine", "totalLine"] + synth.RAW


def scrambled(t, S, n, seed=99):
    """Every OUTCOME value of season S weeks > n and of seasons > S randomised (ex-ante identity columns kept)."""
    rng = np.random.RandomState(seed)
    w = t.weeks.copy()
    m = (w["S"] > S) | ((w["S"] == S) & (w["w"] > n))
    for c in OUTCOME:
        if c == "played":
            w.loc[m, c] = rng.rand(int(m.sum())) < 0.5
        elif c == "status":
            w.loc[m, c] = rng.choice(["P", "D", "X"], int(m.sum()))
        else:
            w.loc[m, c] = rng.uniform(0, 99, int(m.sum()))
    w.loc[m, "rw"] = pd.Series([[["ZZZ", "RES"]]] * int(m.sum()), index=w.index[m])
    nu = m & ~w["inUniverse"].astype(bool)            # a non-universe past-origin row exists only because the player played: its identity is an outcome too
    w.loc[nu, "team"] = rng.choice(synth.TEAMS, int(nu.sum()))
    w.loc[nu, "opp"] = rng.choice(synth.TEAMS, int(nu.sum()))
    w.loc[nu, "home"] = rng.rand(int(nu.sum())) < 0.5
    w.loc[nu, "roof"] = rng.choice(["dome", "outdoors", "retractable"], int(nu.sum()))
    tm = t.teams.copy()
    tmm = (tm["S"] > S) | ((tm["S"] == S) & (tm["w"] > n))
    for c in [c for c in tm.columns if c.startswith("sum_")]:
        tm.loc[tmm, c] = rng.uniform(0, 99, int(tmm.sum()))
    se = t.seasons.copy()
    sem = se["S"] > S
    for c in ["gamesPlayed", "fantasyPoints", "offPct", "age", "draftRound"]:
        se.loc[sem, c] = rng.uniform(0, 99, int(sem.sum()))
    cur = se["S"] == S                       # the S row may expose only age, draft fields, team, teamGames
    for c in ["gamesPlayed", "fantasyPoints", "offPct"]:
        se.loc[cur, c] = rng.uniform(0, 99, int(cur.sum()))
    se.loc[cur, "hasRow"] = False
    be = t.bench.copy()
    be.loc[be["S"] > S, "b2_ppg"] = rng.uniform(0, 99, int((be["S"] > S).sum()))
    return clone(w, tm, se, be)


def deleted(t, S, n):
    """Every past-origin row with inUniverse false removed; the outcome columns of the remaining past-origin rows nulled."""
    w = t.weeks.copy()
    past = (w["S"] > S) | ((w["S"] == S) & (w["w"] > n))
    w = w[~(past & ~w["inUniverse"].astype(bool))].copy()
    past = (w["S"] > S) | ((w["S"] == S) & (w["w"] > n))
    for c in OUTCOME:
        if c == "played":
            w.loc[past, c] = False
        elif c in ("status", "rw"):
            w[c] = w[c].astype(object)
            w.loc[past, c] = None
        else:
            w.loc[past, c] = np.nan
    tm = t.teams
    keepm = (tm["S"] < S) | ((tm["S"] == S) & (tm["w"] <= n))
    return clone(w, tm[keepm].copy(), t.seasons[t.seasons["S"] <= S].copy(), t.bench[t.bench["S"] <= S].copy())


def clone(w, tm, se, be):
    """Tables(...) derives the schedule / team-week frames from the MODIFIED frames — nothing is carried over from the original."""
    return Tables(w, tm, se, be)


def with_callups(t, S, n):
    """Some players play past the origin without being in the weekly universe: those rows (non-universe, played) must never reach a view."""
    w = t.weeks.copy()
    m = w["pid"].isin(["A5", "B5"]) & ((w["S"] > S) | ((w["S"] == S) & (w["w"] > n)))
    w.loc[m, "inUniverse"] = False
    w.loc[m, "played"] = True
    return Tables(w, t.teams, t.seasons, t.bench)


def inputs(t, S, n):
    v = asof.view(t, S, n)
    tgt = v.schedule[(v.schedule["w"] == n + 1) & v.schedule["inUniverse"].astype(bool)]
    wi = baselines.weekly_inputs(v, tgt).reset_index(drop=True)
    sf = baselines.season_features(asof.view(t, S, 0), sorted(t.seasons.loc[t.seasons["S"] == S, "pid"])).reset_index(drop=True)
    prior = pd.Series(v.prior).sort_index()
    return wi, sf, prior


class AsOf(unittest.TestCase):
    def test_py3_future_scramble_and_delete(self):
        """T-PY-3: inputs for origin (S, n) are identical as-is / future randomised / future deleted. Fails if anything reads past the
        origin by value or by row presence."""
        t = with_callups(synth.make_tables(seed=3, seasons=range(2016, 2020)), S0, N0)
        self.assertTrue(((t.weeks["S"] == S0) & (t.weeks["w"] > N0) & ~t.weeks["inUniverse"]).any(), "the panel has non-universe future rows")
        v = asof.view(t, S0, N0)
        fut = v.schedule[v.schedule["w"] > N0]
        self.assertTrue(len(fut) > 0 and fut["inUniverse"].all(), "a view's schedule holds a later-week row only where inUniverse is true")
        base = inputs(t, S0, N0)
        for name, variant in (("scramble", scrambled(t, S0, N0)), ("delete", deleted(t, S0, N0))):
            got = inputs(variant, S0, N0)
            pd.testing.assert_frame_equal(base[0], got[0], obj="weekly inputs (%s)" % name)
            pd.testing.assert_frame_equal(base[1], got[1], obj="season features (%s)" % name)
            pd.testing.assert_series_equal(base[2], got[2], obj="prior (%s)" % name)
        # the origin really matters: changing a week <= n changes the inputs
        t2 = clone(t.weeks.copy(), t.teams, t.seasons, t.bench)
        m = (t2.weeks["S"] == S0) & (t2.weeks["w"] == N0) & t2.weeks["played"]
        t2.weeks.loc[m, "pts"] = t2.weeks.loc[m, "pts"] + 50.0
        self.assertFalse(base[0].equals(inputs(t2, S0, N0)[0]), "inputs must respond to a week at or before the origin")

    def test_py4_lines_and_oracle(self):
        """T-PY-4: no closing line at origin (S, 0); only the predicted row's line in a `lines` view; a rwOracle row's `rw` is absent
        from every non-oracle view. Fails if a closing line reaches the preseason layer or a 2012–2015 status reaches a feature."""
        t = synth.make_tables(seed=4, seasons=range(2014, 2018))
        v0 = asof.view(t, 2016, 0)
        for c in ("spreadLine", "totalLine"):
            self.assertNotIn(c, v0.weeks.columns)
        with self.assertRaises(PermissionError):
            asof.lines(v0)
        with self.assertRaises(ValueError):
            asof.view(t, 2016, 0, lines_for="A0")
        v2 = asof.view(t, 2016, 2, lines_for="A0")
        ln = asof.lines(v2)
        self.assertEqual(list(ln.index), ["A0"])
        want = t.weeks[(t.weeks["S"] == 2016) & (t.weeks["w"] == 3) & (t.weeks["pid"] == "A0")].iloc[0]
        self.assertEqual(ln.loc["A0", "spreadLine"], want["spreadLine"])
        self.assertNotIn("spreadLine", v2.weeks.columns, "the line never enters the history table")
        # oracle rows: 2014-2015 are rwOracle
        v = asof.view(t, 2016, 2)
        old = v.weeks[v.weeks["S"] <= 2015]
        self.assertTrue(len(old) > 0 and all(x is None for x in old["rw"]), "2012-2015 `rw` must be masked")
        newer = v.weeks[v.weeks["S"] == 2016]
        self.assertTrue(all(x is not None for x in newer["rw"]), "post-2015 `rw` stays readable")
        vo = asof.view(t, 2016, 2, oracle=True)
        self.assertTrue(all(x is not None for x in vo.weeks[vo.weeks["S"] <= 2015]["rw"]), "an oracle arm may read it")
        self.assertIn("rw", vo.next_week.columns)
        self.assertFalse(hasattr(v, "next_week"), "week n+1 rw/depthOrder only in oracle arms")

    def test_py10_week1_p_plays(self):
        """T-PY-10: the week-1 P(plays) baseline is last season's games share (0.5 with no S-1 row) and is identical when every
        week-1 `rw` status is flipped. Fails if a same-week status or played flag feeds it."""
        t = synth.make_tables(seed=5, seasons=range(2016, 2020))
        S = 2018
        t.seasons = t.seasons[~((t.seasons["pid"] == "B1") & (t.seasons["S"] == S - 1))].copy()    # no S-1 row for B1
        v0 = asof.view(t, S, 0)
        tgt = v0.schedule[(v0.schedule["w"] == 1) & v0.schedule["inUniverse"].astype(bool)]
        a = baselines.weekly_inputs(asof.view(t, S, 0), tgt).set_index("pid")["p_plays"]
        w2 = t.weeks.copy()
        m = (w2["S"] == S) & (w2["w"] == 1)
        w2.loc[m, "rw"] = pd.Series([[["AAA", "CUT"]]] * int(m.sum()), index=w2.index[m])
        w2.loc[m, "status"] = "X"
        w2.loc[m, "played"] = ~w2.loc[m, "played"]
        t2 = clone(w2, t.teams, t.seasons, t.bench)
        b = baselines.weekly_inputs(asof.view(t2, S, 0), tgt).set_index("pid")["p_plays"]
        pd.testing.assert_series_equal(a, b)
        prev = t.seasons[t.seasons["S"] == S - 1].set_index("pid")
        for pid, p in a.items():
            if pid in prev.index:
                self.assertAlmostEqual(p, prev.loc[pid, "gamesPlayed"] / prev.loc[pid, "teamGames"])
            else:
                self.assertEqual(p, 0.5)
        self.assertIn("B1", a.index)
        self.assertEqual(a["B1"], 0.5)


if __name__ == "__main__":
    unittest.main()
