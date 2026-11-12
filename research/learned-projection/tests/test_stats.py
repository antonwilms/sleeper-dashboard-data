"""T-PY-5 (bootstrap clustering), T-PY-6 (relevant set), T-PY-7 (split hygiene), T-PY-8 (gate arithmetic)."""
import unittest
from unittest import mock

import numpy as np
import pandas as pd

from lp import baselines, bootstrap, metrics, splits
from tests import synth


class Bootstrap(unittest.TestCase):
    def test_py5_clustering(self):
        """T-PY-5: one player contributes half the rows across two folds. The clustered CI is wider than the row-level CI and the
        player's rows move together in BOTH folds. Fails if resampling is by row or per fold."""
        rng = np.random.RandomState(0)
        n_other = 60
        pids = ["BIG"] * n_other + ["BIG"] * n_other + ["p%d" % i for i in range(n_other)] + ["q%d" % i for i in range(n_other)]
        folds = [0] * n_other + [1] * n_other + [0] * n_other + [1] * n_other
        vals = np.concatenate([8 + rng.normal(0, 0.05, 2 * n_other), rng.normal(0, 1, 2 * n_other)])
        rs = bootstrap.Resampler(pids, B=1000)
        w = rs.row_weights()
        big = [i for i, p in enumerate(pids) if p == "BIG"]
        f0, f1 = [i for i in big if folds[i] == 0], [i for i in big if folds[i] == 1]
        self.assertTrue((w[:, f0] == w[:, f0[0]][:, None]).all(), "one player = one multiplicity")
        self.assertTrue((w[:, f0[0]] == w[:, f1[0]]).all(), "the player's rows move together in both folds")
        point, boot, _ = rs.pooled_mean(vals, np.array(folds), 2)
        lo, hi = bootstrap.ci95(boot)
        ilo, ihi = bootstrap.iid_ci(vals, B=1000)
        self.assertGreater(hi - lo, 3 * (ihi - ilo), "clustered CI must be much wider than the row-level CI")
        self.assertTrue(lo <= point <= hi)


class Hygiene(unittest.TestCase):
    def test_py7_split_hygiene(self):
        """T-PY-7: no training row has S >= T; the inner selection window and `c` use only training seasons. Fails on leakage across
        the fold boundary."""
        T = 2019
        tr, val = splits.inner_split(T)
        self.assertTrue(max(tr) < min(val) and max(val) == T - 1 and all(s < T for s in tr + val))
        with self.assertRaises(AssertionError):
            splits.assert_train_only(pd.DataFrame({"S": [2017, 2019]}), T)
        # season layer: scrambling every outcome of seasons >= T must not move c or the ridge forecasts' training side
        t = synth.make_tables(seed=7, seasons=range(2014, 2022), weeks=2)
        a = baselines.season_forecasts(t, T)
        t2 = synth.make_tables(seed=7, seasons=range(2014, 2022), weeks=2)
        m = t2.seasons["S"] >= T
        t2.seasons.loc[m, "gamesPlayed"] = t2.seasons.loc[m, "gamesPlayed"] + 3
        t2.bench.loc[t2.bench["S"] > T, "b1_total"] = 1e6
        # season-T OUTCOMES change too (they are the test labels, never training): c and the ridge predictions must not move
        t2.seasons.loc[t2.seasons["S"] == T, "fantasyPoints"] = 5000.0
        b = baselines.season_forecasts(t2, T)
        np.testing.assert_allclose(a["c"].to_numpy(), b["c"].to_numpy())
        np.testing.assert_allclose(a["ridge"].to_numpy(), b["ridge"].to_numpy())
        self.assertTrue((a["actual"] != b["actual"]).all(), "the test labels did change")


def synthetic_weekly(seed=11):
    rng = np.random.RandomState(seed)
    rows = []
    for S in range(2014, 2020):
        for w in range(1, 6):
            for pos in baselines.POSITIONS:
                for k in range(14):
                    n = max(0, w - 1)
                    played = bool(rng.rand() < 0.85)
                    rows.append(dict(pid="%s%d" % (pos, k), S=S, w=w, position=pos, team="AAA", home=1.0, n=float(n), sum_pts=float(rng.uniform(0, 12 * max(n, 1))),
                                     prior_b2=float(rng.uniform(4, 16)) if k % 3 else np.nan, last3_pts=float(rng.uniform(0, 20)) if n else np.nan,
                                     last3_opp=float(rng.uniform(0, 0.4)) if n else np.nan, p_plays=1.0, played=played,
                                     pts=float(rng.uniform(0, 25)) if played else np.nan, cohort=[], inUniverse=True))
    wf = pd.DataFrame(rows)
    wf["actual0"] = np.where(wf["played"], wf["pts"], 0.0)
    return wf


class Relevant(unittest.TestCase):
    def test_py6_relevant_set_independent_of_model(self):
        """T-PY-6: the weekly relevant set is the top-K by the STD baseline's projection and is identical for two different models.
        Fails if a model's own projection picks its grading rows."""
        wf = synthetic_weekly()
        T = 2019
        K = {"QB": 3, "RB": 3, "WR": 3, "TE": 3}
        sets = []
        for shift in (0.0, 1.0):
            def fake(Xtr, ytr, str_, Xte, T_, alphas=None, shift=shift):
                rng = np.random.RandomState(int(shift * 10))
                return rng.uniform(0, 30, len(Xte)), 10.0      # two very different "models"
            with mock.patch.dict(baselines.RELEVANT_K, K), mock.patch.object(baselines, "ridge_fit_predict", fake):
                out = baselines.weekly_forecasts(wf, T)
            sets.append(out[out["relevant"]][["pid", "w"]].sort_values(["pid", "w"]).reset_index(drop=True))
            if shift == 0.0:
                first = out
        pd.testing.assert_frame_equal(sets[0], sets[1])
        self.assertFalse(first["ridge"].equals(out["ridge"]), "the two models really differ")
        # and it is the STD top-K: per (w, position) the K highest std (ties by pid)
        for (w, pos), g in first.groupby(["w", "position"]):
            top = g.sort_values(["std", "pid"], ascending=[False, True]).head(K[pos])
            self.assertEqual(sorted(top["pid"]), sorted(g[g["relevant"]]["pid"]))


class Gate(unittest.TestCase):
    def test_py8_gate_arithmetic(self):
        """T-PY-8: the §8 labels at each boundary (CI touching 0; 2.9% vs 3.0%; rank guard; 2025 sign; stratum-V restriction vs B2)."""
        bench = 100.0
        self.assertEqual(metrics.label(-3.0, (-4.0, -0.5), bench), "beats")
        self.assertEqual(metrics.label(-2.9, (-4.0, -0.5), bench), "no-difference", "2.9% improvement is below the 3% margin")
        self.assertEqual(metrics.label(-3.0, (-4.0, 0.0), bench), "no-difference", "a CI touching 0 is not 'entirely below'")
        self.assertEqual(metrics.label(-3.0, (-4.0, -1e-9), bench), "beats")
        self.assertEqual(metrics.label(1.0, (0.0, 2.0), bench), "no-difference", "a CI touching 0 from above is not 'entirely above'")
        self.assertEqual(metrics.label(1.0, (1e-9, 2.0), bench), "loses")
        # rank guard: a beats becomes no-difference only when the Spearman-difference CI lies entirely below 0
        self.assertEqual(metrics.label(-5.0, (-6.0, -1.0), bench, rank_ci=(-0.2, -0.01)), "no-difference")
        self.assertEqual(metrics.label(-5.0, (-6.0, -1.0), bench, rank_ci=(-0.2, 0.0)), "beats")
        self.assertEqual(metrics.label(-5.0, (-6.0, -1.0), bench, rank_ci=(-0.1, 0.1)), "beats")
        # confirmation: a beats stands only if d on 2025 is below 0
        self.assertEqual(metrics.confirm("beats", -0.01), "beats")
        self.assertEqual(metrics.confirm("beats", 0.0), "no-difference")
        self.assertEqual(metrics.confirm("beats", 0.4), "no-difference")
        self.assertEqual(metrics.confirm("loses", -1.0), "loses")
        # rows: B2 → stratum V only; B1c → B1-covered; STD → all
        df = pd.DataFrame({"stratum": ["V", "N", "V", "N"], "b1_covered": [True, True, False, False]})
        self.assertEqual(list(metrics.rows_for_benchmark(df, "B2").index), [0, 2])
        self.assertEqual(list(metrics.rows_for_benchmark(df, "B1c").index), [0, 1])
        self.assertEqual(len(metrics.rows_for_benchmark(df, "STD")), 4)
        # gate: 3 of 4 positions beat every required benchmark and none loses
        beats = {"B2": "beats", "B1c": "beats"}
        self.assertTrue(metrics.gate({"QB": beats, "RB": beats, "WR": beats, "TE": {"B2": "no-difference", "B1c": "beats"}}))
        self.assertFalse(metrics.gate({"QB": beats, "RB": beats, "WR": {"B2": "no-difference", "B1c": "beats"}, "TE": {"B2": "no-difference", "B1c": "beats"}}))
        self.assertFalse(metrics.gate({"QB": beats, "RB": beats, "WR": beats, "TE": {"B2": "loses", "B1c": "beats"}}), "any loses vetoes")


if __name__ == "__main__":
    unittest.main()
