"""LP-1b Python tests: T-PY-12 (extended, in test_stats.py), T-PY-13 prereg pin, T-PY-14 weekly c, T-PY-15 B1 rows / unconditional / summary."""
import os
import re
import tempfile
import unittest
from unittest import mock

import numpy as np
import pandas as pd

import run_benchmarks
from lp import baselines, io, report, splits
from tests.test_stats import synthetic_weekly

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TASK_1A = os.path.join(REPO, ".claude", "tasks", "learned-projection-1a-harness.md")


class PreregPin(unittest.TestCase):
    def test_py13_prereg_pin(self):
        """T-PY-13: the committed LP-1a §8 hashes to the pinned value; main() returns 2 BEFORE reading the cache when §8 differs.
        Fails if §8 is edited, the stop is removed, or the check runs after the cache load."""
        with open(TASK_1A, encoding="utf-8") as f:
            text = f.read()
        self.assertEqual(report.prereg_hash(text)[0], report.PREREG_HASH)
        a = re.search(r"^## 8\.", text, re.M).start()
        i = text.index("the", a)                         # one character of §8 changed
        edited = text[:i] + "T" + text[i + 1:]
        self.assertNotEqual(report.prereg_hash(edited)[0], report.PREREG_HASH)
        with tempfile.TemporaryDirectory() as d:
            tf = os.path.join(d, "task.md")
            with open(tf, "w", encoding="utf-8") as f:
                f.write(edited)
            for argv in ([], ["--weekly-bench"]):
                with mock.patch.object(io, "load_cache", side_effect=AssertionError("the cache was read before the pre-registration check")) as lc:
                    self.assertEqual(run_benchmarks.main(argv, task_file=tf), 2, argv)
                    lc.assert_not_called()


def weekly_frame(seasons=range(2014, 2026), n_weeks=4, per_pos=14, seed=5):
    rng = np.random.RandomState(seed)
    rows = []
    for S in seasons:
        for w in range(1, n_weeks + 1):
            for pos in baselines.POSITIONS:
                for k in range(per_pos):
                    n = max(0, w - 1)
                    played = bool(rng.rand() < 0.85)
                    rows.append(dict(pid="%s%d" % (pos, k), S=S, w=w, position=pos, team="AAA", home=1.0, n=float(n), sum_pts=float(rng.uniform(0, 12 * max(n, 1))),
                                     prior_b2=float(rng.uniform(4, 16)), last3_pts=float(rng.uniform(0, 20)) if n else np.nan,
                                     last3_opp=float(rng.uniform(0, 0.4)) if n else np.nan, p_plays=float(rng.uniform(0.5, 1)), played=played,
                                     pts=float(rng.uniform(1, 25)) if played else np.nan, cohort=[], inUniverse=True))
    wf = pd.DataFrame(rows)
    wf["actual0"] = np.where(wf["played"], wf["pts"], 0.0)
    return wf


def benchw_for(wf, seed=9, drop=0.1):
    rng = np.random.RandomState(seed)
    bw = wf[["pid", "S", "w"]].copy()
    bw["cond"] = rng.uniform(3, 18, len(bw))
    bw["uncond"] = np.where(rng.rand(len(bw)) < 0.3, bw["cond"] * rng.uniform(0.2, 0.9, len(bw)), np.nan)
    return bw[rng.rand(len(bw)) >= drop].reset_index(drop=True)


class WeeklyC(unittest.TestCase):
    def test_py14_weekly_c(self):
        """T-PY-14: c is the median of pts / b1w over training rows that are relevant, played, covered and both > 0. A non-relevant row, a pts = 0 row,
        an uncovered row, a not-played row and a test-season row each leave it unchanged. Fails if c is taken over all rows or the test season."""
        T = 2017
        rows, bw = [], []
        for S in (2014, 2015, 2016, 2017):
            for w in (1, 2):
                # std = prior (n = 0, sum_pts = 0): p1 > p2 > p3 > p4; K = 2 → p1, p2 relevant
                for k, (prior, ratio) in enumerate([(10.0, 2.0), (9.0, 4.0), (8.0, 50.0), (7.0, 50.0)]):
                    pid = "q%d" % k
                    cond = 5.0
                    rows.append(dict(pid=pid, S=S, w=w, position="QB", team="AAA", home=1.0, n=0.0, sum_pts=0.0, prior_b2=prior, last3_pts=np.nan, last3_opp=np.nan,
                                     p_plays=1.0, played=True, pts=cond * (ratio if S < T else 1000.0), cohort=[], inUniverse=True))
                    bw.append(dict(pid=pid, S=S, w=w, cond=cond, uncond=np.nan))
        base = pd.DataFrame(rows)
        base["actual0"] = base["pts"]
        bwf = pd.DataFrame(bw)

        def c_of(wf, bwf_):
            with mock.patch.dict(baselines.RELEVANT_K, {"QB": 2, "RB": 2, "WR": 2, "TE": 2}):
                out = baselines.weekly_forecasts(wf, T, benchw=bwf_)
            return out
        out = c_of(base, bwf)
        qb = out[out["position"] == "QB"]
        self.assertEqual(float(qb["c_weekly"].iloc[0]), 3.0, "median of six 2s and six 4s")
        np.testing.assert_allclose(qb["b1cw"].to_numpy(float), 3.0 * qb["b1w"].to_numpy(float))
        # add the excluded kinds: each would move the median if it leaked in
        extra = []
        extra_bw = []
        for S in (2014, 2015):
            extra.append(dict(base.iloc[0].to_dict(), pid="q0", S=S, w=3, pts=0.0, actual0=0.0))                 # relevant, played, pts = 0
            extra_bw.append(dict(pid="q0", S=S, w=3, cond=5.0, uncond=np.nan))
            extra.append(dict(base.iloc[0].to_dict(), pid="q1", S=S, w=4, pts=5000.0, actual0=5000.0))           # relevant, played, UNCOVERED (no benchw row)
            extra.append(dict(base.iloc[0].to_dict(), pid="q0", S=S, w=5, played=False, pts=np.nan, actual0=0.0))  # relevant, not played
            extra_bw.append(dict(pid="q0", S=S, w=5, cond=5.0, uncond=np.nan))
        wf2 = pd.concat([base, pd.DataFrame(extra)], ignore_index=True)
        bw2 = pd.concat([bwf, pd.DataFrame(extra_bw)], ignore_index=True)
        out2 = c_of(wf2, bw2)
        self.assertEqual(float(out2[out2["position"] == "QB"]["c_weekly"].iloc[0]), 3.0, "pts = 0, uncovered and not-played rows are excluded")
        # a test-season outcome change does not move c
        wf3 = base.copy()
        m = wf3["S"] == T
        wf3.loc[m, "pts"] = 7.0
        wf3["actual0"] = np.where(wf3["played"], wf3["pts"], 0.0)
        self.assertEqual(float(c_of(wf3, bwf).query("position == 'QB'")["c_weekly"].iloc[0]), 3.0)
        # a non-relevant training row with a huge ratio is not in c (p3 / p4 are 50× in the base frame; the median stays 3)
        self.assertTrue((base[(base["pid"] == "q2") & (base["S"] < T)]["pts"] / 5.0 == 50.0).all())


class B1Rows(unittest.TestCase):
    def _wk(self, with_benchw):
        wf = weekly_frame()
        bw = benchw_for(wf) if with_benchw else None
        out = pd.concat([baselines.weekly_forecasts(wf, T, benchw=bw) for T in splits.TEST_SEASONS], ignore_index=True)
        return out

    def test_py15_b1_rows_unconditional_summary(self):
        """T-PY-15: B1 / B1c use only rows with b1w non-null; expected points are `<col>_uncond` where present, else p_plays × cond; `common` and the
        hardest-benchmark summary are identical with and without benchw; a stale benchw.meta or a false checks.*.pass returns 2.
        Fails if uncovered rows score 0, B1 alters the common-row summary, or a bad cache pair is accepted."""
        wk_b, wk_n = self._wk(True), self._wk(False)
        self.assertNotIn("b1w", wk_n.columns, "without benchw the frame is the LP-1a one")
        w_b, w_n = report.weekly_eval(wk_b, B=20), report.weekly_eval(wk_n, B=20)
        for pos in baselines.POSITIONS:
            rel = wk_b[(wk_b["position"] == pos) & wk_b["relevant"] & wk_b["played"]]
            self.assertEqual(w_b[pos]["cond"]["B1"]["n"], int((rel["b1w"].notna() & rel["ridge"].notna()).sum()), "B1 is scored on its own non-null rows")
            self.assertEqual(w_b[pos]["cond"]["B1c"]["n"], int((rel["b1cw"].notna() & rel["ridge"].notna()).sum()))
            self.assertLess(w_b[pos]["cond"]["B1"]["n"], int(rel["ridge"].notna().sum()), "the uncovered rows were really dropped")
            self.assertEqual(w_b[pos]["common"], w_n[pos]["common"], "common is unchanged")
            self.assertNotIn("B1", w_n[pos]["cond"])
            self.assertNotIn("pending1b", w_b[pos])
            self.assertIn("pending1b", w_n[pos])
            # the hardest-benchmark sentence is the same with and without B1 (it reads only `common`)
            s_b = report.plain_summary({p: {} for p in baselines.POSITIONS}, w_b)[baselines.POSITIONS.index(pos)]
            s_n = report.plain_summary({p: {} for p in baselines.POSITIONS}, w_n)[baselines.POSITIONS.index(pos)]
            self.assertTrue(s_b.startswith(s_n.replace(" B1 weekly: pending-1b.", "")), (s_b, s_n))
            self.assertIn("Weekly B1 (the app's in-season model)", s_b)
        # unconditional expected points: the replay's own value where present, else p_plays × cond
        rows = pd.DataFrame({"p_plays": [0.5, 0.5, 0.5], "b1w": [10.0, 10.0, 10.0], "b1w_uncond": [3.0, np.nan, 0.0]})
        np.testing.assert_allclose(report.expected_points(rows, "b1w"), [3.0, 5.0, 0.0])
        rows2 = pd.DataFrame({"p_plays": [0.5], "std": [10.0]})
        np.testing.assert_allclose(report.expected_points(rows2, "std"), [5.0])
        # a stale benchw.meta, a false check, or an absent file returns 2 (before anything is scored)
        meta = {"generatedAt": "G1"}
        stub = mock.Mock(meta=meta)
        good = {"panelGeneratedAt": "G1", "checks": {k: {"pass": True} for k in ("c2", "c3", "c6")}}
        with mock.patch.object(io, "load_cache", return_value=stub):
            for bad in ({**good, "panelGeneratedAt": "G0"}, {**good, "checks": {**good["checks"], "c3": {"pass": False}}}, {**good, "checks": {"c2": {"pass": True}, "c6": {"pass": True}}}):
                with mock.patch.object(io, "load_benchw", return_value=(pd.DataFrame(), bad)):
                    self.assertEqual(run_benchmarks.main(["--weekly-bench"]), 2)
            with mock.patch.object(io, "load_benchw", side_effect=FileNotFoundError("absent")):
                self.assertEqual(run_benchmarks.main(["--weekly-bench"]), 2)


if __name__ == "__main__":
    unittest.main()
