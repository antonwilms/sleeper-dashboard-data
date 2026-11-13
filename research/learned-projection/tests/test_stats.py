"""T-PY-5 (bootstrap clustering), T-PY-6 (relevant set), T-PY-7 (split hygiene), T-PY-8 (gate arithmetic)."""
import unittest
from unittest import mock

import numpy as np
import pandas as pd

from scipy.stats import spearmanr

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
        # (ii) every player present in both folds has the same multiplicity in both, within EVERY resample
        both = sorted(set(pids[i] for i in range(len(pids)) if folds[i] == 0) & set(pids[i] for i in range(len(pids)) if folds[i] == 1))
        self.assertEqual(both, ["BIG"])
        for p in both:
            r0 = [i for i, (q, f) in enumerate(zip(pids, folds)) if q == p and f == 0]
            r1 = [i for i, (q, f) in enumerate(zip(pids, folds)) if q == p and f == 1]
            np.testing.assert_array_equal(w[:, r0[0]], w[:, r1[0]])

    def test_py5_pooled_mean_by_hand(self):
        """T-PY-5 (i): `pooled_mean` on a two-fold synthetic panel equals a hand-computed value for fixed resamples — each fold's mean is
        recomputed INSIDE the resample (multiplicities applied), then the folds are averaged with equal weight. Fails under per-fold
        resampling (the player's multiplicity would differ between folds) or pooled-row weighting."""
        pids = ["p0", "p0", "p1", "p2", "p0", "p1", "p1"]
        folds = np.array([0, 0, 0, 0, 1, 1, 1])
        vals = np.array([1.0, 3.0, 5.0, 9.0, 10.0, 20.0, 40.0])
        rs = bootstrap.Resampler(pids, B=3)
        self.assertEqual(list(rs.players), ["p0", "p1", "p2"])
        rs.C[0] = [2, 0, 1]          # p0 twice, p1 absent, p2 once
        rs.C[1] = [0, 1, 1]
        rs.C[2] = [1, 1, 1]
        point, boot, fold_means = rs.pooled_mean(vals, folds, 2)
        # resample 0: fold 0 = {1,3,1,3,9} → 17/5 = 3.4; fold 1 = {10,10} → 10 (p1 absent); equal-weight mean 6.7
        np.testing.assert_allclose(fold_means[0], [3.4, 10.0])
        self.assertAlmostEqual(boot[0], 6.7, places=12)
        # resample 1: fold 0 = {5, 9} → 7; fold 1 = {20, 40} (p1 has two rows in fold 1) → 30; mean 18.5
        self.assertAlmostEqual(boot[1], 18.5, places=12)
        # resample 2 is the sample itself: fold means 18/4 = 4.5 and 70/3; equal weight
        self.assertAlmostEqual(boot[2], (4.5 + 70.0 / 3) / 2, places=12)
        self.assertAlmostEqual(point, (4.5 + 70.0 / 3) / 2, places=12)
        # pooled-row weighting would give 7.4286 for resample 2's population — distinguishable from the equal-fold value
        self.assertGreater(abs((88.0 / 7) - boot[2]), 0.1)


class Rerank(unittest.TestCase):
    def test_py11_spearman_reranked_per_resample(self):
        """T-PY-11: for 20 resamples of a synthetic group with ties, the resample's Spearman equals scipy.stats.spearmanr on the
        explicitly expanded arrays (1e-12). Fails if the original ranks are reused under the multiplicities."""
        rng = np.random.RandomState(5)
        n = 40
        pids = ["p%d" % (i % 25) for i in range(n)]                       # players with several rows each (clustered)
        a = rng.randint(0, 6, n).astype(float)                            # heavy ties on both sides
        b = (a + rng.randint(-2, 3, n)).astype(float)
        rs = bootstrap.Resampler(pids, B=20, seed=7)
        pidx = rs.idx(pids)
        point, boot = rs.group_spearman(a, b, np.zeros(n, int), 1, min_rows=8, pidx=pidx)
        self.assertAlmostEqual(point[0], spearmanr(a, b)[0], places=12)
        checked = 0
        for r in range(20):
            reps = rs.C[r, pidx].astype(int)
            ea, eb = np.repeat(a, reps), np.repeat(b, reps)
            if len(ea) < 8 or np.std(ea) == 0 or np.std(eb) == 0:
                self.assertTrue(np.isnan(boot[r, 0]))
                continue
            self.assertAlmostEqual(boot[r, 0], spearmanr(ea, eb)[0], places=12, msg="resample %d" % r)
            checked += 1
        self.assertGreaterEqual(checked, 15)
        # a resample with fewer than min_rows rows (with multiplicity) is NaN for that resample: a group of 6 rows out of 30 players
        big = bootstrap.Resampler(["q%d" % i for i in range(30)], B=200, seed=1)
        gp = ["q%d" % i for i in range(6)]
        _, bs_ = big.group_spearman(np.array([1.0, 2, 3, 4, 5, 6]), np.array([2.0, 1, 4, 3, 6, 5]), np.zeros(6, int), 1, min_rows=6, pidx=big.idx(gp))
        cnt = big.C[:, big.idx(gp)].sum(axis=1)
        self.assertTrue((cnt < 6).any() and (cnt >= 6).any(), "the fixture exercises both sides of the row floor")
        for r in range(200):
            if cnt[r] < 6:
                self.assertTrue(np.isnan(bs_[r, 0]), "resample %d has %d rows" % (r, cnt[r]))


class Cohorts(unittest.TestCase):
    def test_catch_up_lag_skips_a_missing_week(self):
        """F4: catch_up_lag counts calendar weeks and SKIPS a week with no projection. A riser whose w0+1 is a bye and who closes the gap
        at w0+2 has lag 2, not censored. Fails if a missing week ends the search."""
        w0, L = 5, 20.0
        self.assertEqual(metrics.catch_up_lag({5: 10.0, 6: 16.0}, w0, L), (1, False))
        self.assertEqual(metrics.catch_up_lag({5: 10.0, 7: 16.0}, w0, L), (2, False), "w0+1 missing (bye), closed at w0+2")
        self.assertEqual(metrics.catch_up_lag({5: 10.0, 6: 11.0, 8: 18.0}, w0, L), (3, False))
        self.assertEqual(metrics.catch_up_lag({5: 10.0, 6: 11.0, 7: 12.0}, w0, L), (6, True), "never closes: censored at the cap")
        self.assertEqual(metrics.catch_up_lag({5: 10.0}, w0, L), (6, True), "no later projection at all: censored")
        self.assertEqual(metrics.catch_up_lag({6: 16.0}, w0, L), (None, None), "no projection for w0: not evaluable")


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


class WeeklyFold(unittest.TestCase):
    def test_py12_weekly_fold_hygiene(self):
        """T-PY-12: `weekly_forecasts` for test season T is unchanged when every outcome column of seasons >= T is randomised in the
        frame it fits on (ridge rows, stratum-N position mean, inner selection). Fails if a row with S >= T reaches a weekly fit."""
        T = 2018
        wf = synthetic_weekly()
        a = baselines.weekly_forecasts(wf, T)
        wf2 = wf.copy()
        rng = np.random.RandomState(3)
        m = wf2["S"] >= T
        k = int(m.sum())
        wf2.loc[m, "played"] = rng.rand(k) < 0.5
        wf2.loc[m, "pts"] = rng.uniform(0, 80, k)
        wf2["actual0"] = np.where(wf2["played"], wf2["pts"], 0.0)
        wf2.loc[m, "cohort"] = pd.Series([["a"]] * k, index=wf2.index[m])
        b = baselines.weekly_forecasts(wf2, T)
        self.assertEqual(len(a), len(b))
        self.assertTrue(a["ridge"].notna().any(), "the ridge baselines really fit")
        for c in ("std", "prior", "b2w", "ridge", "p_plays", "relevant"):
            np.testing.assert_allclose(a[c].to_numpy(float), b[c].to_numpy(float), err_msg=c)
        self.assertFalse(a["pts"].equals(b["pts"]), "the test-season outcomes really changed")


    def test_py12_weekly_fold_hygiene_with_benchw(self):
        """T-PY-12 (extended): with a synthetic benchw, `b1w`, `c_weekly` and `b1cw` for test season T are unchanged when every outcome column of
        seasons >= T is randomised in the frame `weekly_forecasts` fits on. Fails if a row with S >= T reaches weekly c."""
        T = 2018
        wf = synthetic_weekly()
        rng = np.random.RandomState(4)
        bw = wf[["pid", "S", "w"]].copy()
        bw["cond"] = rng.uniform(3, 18, len(bw))
        bw["uncond"] = bw["cond"] * 0.6
        a = baselines.weekly_forecasts(wf, T, benchw=bw)
        wf2 = wf.copy()
        m = wf2["S"] >= T
        k = int(m.sum())
        wf2.loc[m, "played"] = rng.rand(k) < 0.5
        wf2.loc[m, "pts"] = rng.uniform(0, 80, k)
        wf2["actual0"] = np.where(wf2["played"], wf2["pts"], 0.0)
        b = baselines.weekly_forecasts(wf2, T, benchw=bw)
        self.assertTrue(a["c_weekly"].notna().all(), "c is computed for every position")
        for c in ("b1w", "b1w_uncond", "c_weekly", "b1cw", "b1cw_uncond"):
            np.testing.assert_allclose(a[c].to_numpy(float), b[c].to_numpy(float), err_msg=c)


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
