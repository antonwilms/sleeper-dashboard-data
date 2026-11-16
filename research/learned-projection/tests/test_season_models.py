"""LP-2a: T-M-2 (fit units), T-M-5 (composition), T-M-6 (H), T-M-7 (fold isolation), T-M-8 (weights and determinism)."""
import unittest
from unittest import mock

import numpy as np
import pandas as pd

from lp import asof, chain, era, features, model_g, model_h, season_models as sm, spec as spec_mod
from tests import synth_season as ss

TOPN = ss.SMALL_TOPN


def small_spec(name):
    s = spec_mod.small_spec(name, TOPN)
    s["calibMinRows"] = 1
    s["grid"] = s["grid"][:1]
    return s


def two_entry_spec(name):
    s = small_spec(name)
    full = spec_mod.default_spec(name)["grid"]
    s["grid"] = [full[0], next(e for e in full if e["era"] == "E0" and e["lam"] > 0)]
    return s


class TestUnitsInFit(unittest.TestCase):
    """T-M-2 (fit side). Fails on the target season's own mean or a wrong (P, q)."""

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = ss.make_panel()
        cls.spec = small_spec("G")
        cls.store = sm.Store(cls.t, ss.KEYS, ss.WEIGHTS, cls.spec)

    def test_target_divided_by_previous_season_mean(self):
        st, T = self.store, 2018
        mu = st.mu(T)
        for pos, name in (("WR", "rec_yd"), ("RB", "rush_att"), ("WR", "rec_tgt")):
            u1 = era.Units(mu, "E1", T - 1)
            self.assertNotIn((pos, name), u1.fallback)
            d0 = sm.build_data(st, self.spec, pos, [2015, 2016], [2017], era.Units(mu, "E0", T - 1), hist=False)
            d1 = sm.build_data(st, self.spec, pos, [2015, 2016], [2017], u1, hist=False)
            r0, e0 = d0["train"]["targets"][name]
            r1, e1 = d1["train"]["targets"][name]
            S = d0["train"]["S"]
            for s in (2015, 2016):
                m = (S == s) & (e0 > 0)
                self.assertGreater(m.sum(), 0)
                np.testing.assert_allclose(r1[m], r0[m] / mu[(pos, name)][s - 1])
            np.testing.assert_array_equal(e0, e1)
            g0, g1 = d0["train"]["targets"]["gamesShare"], d1["train"]["targets"]["gamesShare"]
            np.testing.assert_array_equal(g0[0], g1[0])           # a raw target is never divided

    def test_prediction_multiplied_by_previous_season_mean(self):
        st, T, pos = self.store, 2018, "WR"
        mu = st.mu(T)
        units = era.Units(mu, "E1", T - 1)
        data = sm.build_data(st, self.spec, pos, [2015, 2016, 2017], [T], units, hist=False)
        tdefs = [t for t in st.spec_for(False)["targets"][pos] if t["name"] in ("rec_yd", "gamesShare")]
        with mock.patch.object(model_g, "fit_target", lambda spec, name, g, Xtr, r, e, w, Xpr: np.full(len(Xpr), 2.0)), \
                mock.patch.object(chain, "clip_bounds", lambda r, e, name: (-np.inf, np.inf)):
            preds, _ = sm.fit_family("G", self.spec, data, pos, 0.0, "g1", units, False, st, tdefs)
        np.testing.assert_allclose(preds["rec_yd"], 2.0 * mu[(pos, "rec_yd")][T - 1])
        np.testing.assert_allclose(preds["gamesShare"], 2.0)


class TestComposition(unittest.TestCase):
    """T-M-5. Fails on a hard-coded 17, a dropped minor term or a rounded ppg."""

    def test_total_is_hand_computed(self):
        spec = spec_mod.default_spec("H")
        pred = dict(rush_att=np.array([10.0]), rec_tgt=np.array([4.0]), rush_yd=np.array([4.123]), rush_td=np.array([0.05]), rec=np.array([0.6]), rec_yd=np.array([8.31]),
                    rec_td=np.array([0.04]), bonus_fd_rb=np.array([0.2]), kr_yd=np.array([1.37]), bonus_rush_yd_100=np.array([0.011]), fum_lost=np.array([0.021]), gamesShare=np.array([0.5]))
        minor = {k: 0.0 for k in chain.minor_keys(spec, "RB", ss.KEYS)}
        minor["st_td"], minor["fgm_20_29"] = 0.0123, 0.0045
        out = chain.season_points(pred, spec, "RB", minor, ss.WEIGHTS, np.array([8.0]), c=1.1)
        W = ss.WEIGHTS
        ppg = (W["rush_yd"] * 4.123 * 10 + W["rush_td"] * 0.05 * 10 + W["rec"] * 0.6 * 4 + W["rec_yd"] * 8.31 * 4 + W["rec_td"] * 0.04 * 4 + W["bonus_fd_rb"] * 0.2 * 14
               + W["kr_yd"] * 1.37 + W["bonus_rush_yd_100"] * 0.011 + W["fum_lost"] * 0.021 + W["st_td"] * 0.0123 + W["fgm_20_29"] * 0.0045)
        self.assertAlmostEqual(out["ppg"][0], ppg, places=12)             # unrounded
        self.assertAlmostEqual(out["games"][0], 4.0)                     # 0.5 x teamGames_k (8), never 17
        self.assertAlmostEqual(out["total"][0], 1.1 * 4.0 * ppg, places=10)
        self.assertAlmostEqual(out["kv_bonus_fd_rb"][0], 0.2 * 14)


def _synthetic_h(rate_true_k, decay, seed=5, n=300, seasons=range(2014, 2022), rho=1.0):
    """Players with a persistent effect: r(i, s) = mu + u(i, s) + eps / sqrt(e), u an AR(1) with correlation rho across seasons."""
    rng = np.random.RandomState(seed)
    allS = list(range(2012, 2023))
    e = rng.uniform(4, 16, (n, len(allS)))
    med = float(np.median(e))
    sig2 = rate_true_k * med
    u = np.zeros((n, len(allS)))
    u[:, 0] = rng.normal(0, 1, n)
    for j in range(1, len(allS)):
        u[:, j] = rho * u[:, j - 1] + np.sqrt(1 - rho ** 2) * rng.normal(0, 1, n)
    r = 3.0 + u + rng.normal(0, 1, (n, len(allS))) * np.sqrt(sig2 / e)
    X = rng.normal(0, 1, (n, len(allS), 2))
    return allS, e, r, X, n


def _arrays(allS, e, r, X, n, train, pred):
    idx = {s: j for j, s in enumerate(allS)}

    def hist(Ss, pid_idx):
        out = {}
        for l in (1, 2, 3):
            Xl, rl, el = [], [], []
            for s_, i in zip(Ss, pid_idx):
                s = s_ - l
                if s in idx and s >= 2012:
                    Xl.append(X[i, idx[s]]); rl.append(r[i, idx[s]]); el.append(e[i, idx[s]])
                else:
                    Xl.append(np.zeros(2)); rl.append(np.nan); el.append(0.0)
            out[l] = {"X": np.array(Xl), "r": np.array(rl), "e": np.array(el)}
        return out

    Ss = [s for s in train for _ in range(n)]
    ii = [i for _ in train for i in range(n)]
    tr = {"S": np.array(Ss), "X": np.array([X[i, idx[s]] for s, i in zip(Ss, ii)]), "r": np.array([r[i, idx[s]] for s, i in zip(Ss, ii)]),
          "e": np.array([e[i, idx[s]] for s, i in zip(Ss, ii)]), "hist": hist(Ss, ii)}
    tr["w"] = tr["e"].copy()
    Ps = [s for s in pred for _ in range(n)]
    pi = [i for _ in pred for i in range(n)]
    pr = {"P": np.array(Ps), "X": np.array([X[i, idx[s]] for s, i in zip(Ps, pi)]), "hist": hist(Ps, pi)}
    return tr, pr


GRID = dict(alphas=[1, 10, 100, 1000], kmult=[0, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10], deltas=[0.5, 0.65, 0.8, 0.9, 1.0])


class TestH(unittest.TestCase):
    """T-M-6. Fails if the cohort mean has seen the row's own season."""

    def test_recovers_known_k_and_delta(self):
        allS, e, r, X, n = _synthetic_h(0.5, 1.0, rho=1.0)
        tr, pr = _arrays(allS, e, r, X, n, range(2014, 2022), [2022])
        res = model_h.fit_target(tr, pr, **GRID)
        self.assertIn(res["kmult"], (0.35, 0.5, 0.75))          # true k = 0.5 x median exposure
        self.assertIn(res["delta"], (0.9, 1.0))                  # a persistent effect: no decay
        # a decaying effect (AR(1), rho 0.6) is fitted with a smaller delta
        allS, e, r, X, n = _synthetic_h(0.5, 0.6, seed=6, rho=0.6)
        tr, pr = _arrays(allS, e, r, X, n, range(2014, 2022), [2022])
        res2 = model_h.fit_target(tr, pr, **GRID)
        self.assertLessEqual(res2["delta"], 0.8)
        self.assertGreater(res["delta"], res2["delta"] - 1e-9)

    def test_no_history_is_the_cohort_mean(self):
        allS, e, r, X, n = _synthetic_h(0.5, 1.0, n=60)
        tr, pr = _arrays(allS, e, r, X, n, range(2014, 2020), [2020])
        for l in (1, 2, 3):
            pr["hist"][l]["e"][:] = 0.0
        res = model_h.fit_target(tr, pr, **GRID)
        keep = np.ones(len(tr["S"]), bool)
        mall = model_h.Cohort(tr["X"][keep], tr["r"][keep], tr["w"][keep], res["alpha"])
        np.testing.assert_allclose(res["pred"], mall.predict(pr["X"]))
        res0 = model_h.fit_target(tr, pr, alphas=[10], kmult=[0], deltas=[1.0])      # k = 0 and no history: not NaN
        self.assertTrue(np.isfinite(res0["pred"]).all())

    def _recorded(self, train, pred, n=20):
        """Run with Cohort recording: every predict() of a hist block / own block is tagged by an id in column 0."""
        allS, e, r, X, n = _synthetic_h(0.5, 1.0, n=n)
        tr, pr = _arrays(allS, e, r, X, n, train, pred)
        N = len(tr["S"])
        tr["X"][:, 0] = -(np.arange(N) + 1)                                  # own descriptors: negative ids
        for l in (1, 2, 3):
            tr["hist"][l]["X"][:, 0] = (1000 * l) + np.arange(N)            # history descriptors: (lag, row) ids
        M = len(pr["P"])
        pr["X"][:, 0] = -(np.arange(M) + 100000)
        for l in (1, 2, 3):
            pr["hist"][l]["X"][:, 0] = 500000 + 1000 * l + np.arange(M)
        seen = {}
        orig = model_h.Cohort.predict

        def rec(self, Xn):
            for v in np.asarray(Xn)[:, 0]:
                seen.setdefault(float(v), set()).add(self.seasons)
            return orig(self, Xn)
        with mock.patch.object(model_h.Cohort, "predict", rec):
            res = model_h.fit_target(tr, pr, alphas=[10], kmult=[0, 1], deltas=[1.0])
        return tr, pr, seen, res

    def test_excluded_seasons(self):
        train, pred = (2014, 2015, 2016), [2017, 2018]
        tr, pr, seen, _ = self._recorded(train, pred)
        sset = set(train)
        for i in range(len(tr["S"])):
            S = int(tr["S"][i])
            for l in (1, 2, 3):
                if tr["hist"][l]["e"][i] > 0:
                    want = tuple(sorted(sset - {S, S - l}))
                    if want:
                        self.assertEqual(seen[float(1000 * l + i)], {want}, (i, S, l))
            self.assertEqual(seen[float(-(i + 1))], {tuple(sorted(sset - {S}))})        # m_(-{S}) for the row itself
        for j in range(len(pr["P"])):
            P = int(pr["P"][j])
            for l in (1, 2, 3):
                if pr["hist"][l]["e"][j] > 0:
                    self.assertEqual(seen[float(500000 + 1000 * l + j)], {tuple(sorted(sset - {P - l}))}, (j, P, l))

    def test_empty_training_set_gives_zero_exposure(self):
        tr, pr, seen, res = self._recorded((2016,), [2017])
        self.assertTrue(np.isfinite(res["pred"]).all())
        # with one training season, every lag whose exclusion empties it contributes nothing: no history model was ever used
        self.assertFalse([k for k in seen if 1000 <= k < 100000 or 501000 <= k < 502000])      # no training-row hist model, no predicted lag-1 model


def _fold_preds(tables, spec, family, T, grid=None):
    st = sm.Store(tables, ss.KEYS, ss.WEIGHTS, spec)
    out = []
    for pos in ("QB", "RB", "WR", "TE"):
        fr, d = sm.run_position(st, spec, family, pos, T, grid=grid)
        fr["position"] = pos
        out.append(fr)
    return pd.concat(out, ignore_index=True)


def randomize_from(t, T, seed=11):
    """Every outcome of seasons >= T randomised: weeks (status, played, pts, raw, depth), X, seasons outcome columns (not inSeasonUniverse nor the
    S_ROW_COLS), teams sum_*, bench, teamctx, extras."""
    rng = np.random.RandomState(seed)
    w, X = t.weeks.copy(), t.X.copy()
    m = (w["S"] >= T).to_numpy()
    n = int(m.sum())
    for c in ["pts", "depthOrder"] + ss.RAW:
        w.loc[m, c] = rng.uniform(0, 99, n)
    w.loc[m, "played"] = rng.rand(n) < 0.5
    w.loc[m, "status"] = rng.choice(["P", "D", "X"], n)
    X[m] = rng.uniform(0, 99, (n, X.shape[1]))
    se = t.seasons.copy()
    mm = (se["S"] >= T).to_numpy()
    for c in ["gamesPlayed", "fantasyPoints", "offPct"]:
        se.loc[mm, c] = rng.uniform(0, 99, int(mm.sum()))
    se.loc[mm, "hasRow"] = rng.rand(int(mm.sum())) < 0.5
    teams = t.teams.copy()
    for c in [c for c in teams.columns if c.startswith("sum_")]:
        teams.loc[teams["S"] >= T, c] = rng.uniform(0, 99, int((teams["S"] >= T).sum()))
    be = t.bench.copy()
    mb = (be["S"] >= T).to_numpy()
    for c in ["b1_total", "b2_ppg", "b2_total"]:
        be.loc[mb, c] = rng.uniform(0, 99, int(mb.sum()))
    tc = t.teamctx.copy()
    mt = (tc["S"] >= T).to_numpy()
    for c in [c for c in tc.columns if c not in ("team", "S", "w")]:
        tc.loc[mt, c] = rng.uniform(0, 99, int(mt.sum()))
    ex = t.extras.copy()
    me = (ex["S"] >= T).to_numpy()
    for c in [c for c in ex.columns if c.startswith("gl_")]:
        ex.loc[me, c] = rng.uniform(0, 99, int(me.sum()))
    return asof.Tables(w, teams, se, be, X=X, teamctx=tc, extras=ex)


class TestIsolation(unittest.TestCase):
    """T-M-7. Fails on any cross-fold leak (inner selection, c, mu, raw fallback, minor constants, clip bounds)."""

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = ss.make_panel(per_pos={"QB": 4, "RB": 6, "WR": 7, "TE": 4})

    def _check(self, family):
        spec = two_entry_spec(family)
        T = 2018
        a = _fold_preds(self.t, spec, family, T)
        b = _fold_preds(randomize_from(self.t, T), spec, family, T)
        pd.testing.assert_frame_equal(a, b)
        self.assertTrue(a["total"].notna().all())
        self.assertTrue((a["c"] != 1.0).any(), "c was never exercised")

    def test_h(self):
        self._check("H")

    def test_g(self):
        self._check("G")


class TestWeightsDeterminism(unittest.TestCase):
    """T-M-8. Fails on an unweighted fit, a wrong s_max or an unseeded source."""

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = ss.make_panel(per_pos={"QB": 4, "RB": 6, "WR": 7, "TE": 4})

    def test_weighted_fit_matches_mean_season_sum(self):
        rng = np.random.RandomState(0)
        g = rng.randint(1, 17, 400).astype(float)
        r = 0.5 + 0.1 * g
        spec = spec_mod.default_spec("G")
        X = np.ones((400, 1))
        pw = model_g.fit_target(spec, "rec_yd", "g1", X, r, g, g, X[:1])[0]
        pu = model_g.fit_target(spec, "rec_yd", "g1", X, r, g, np.ones(400), X[:1])[0]
        truth = float((g * r).mean())
        self.assertLess(abs(g.mean() * pw / truth - 1), 0.02)
        self.assertGreater(abs(g.mean() * pu / truth - 1), 0.05)

    def test_g_receives_seed(self):
        """Asserts G is seeded from the spec and not early-stopped; fails if random_state is dropped or not read from spec['seed']."""
        spec = spec_mod.default_spec("G")
        spec["seed"] = 12345
        rng = np.random.RandomState(1)
        X = rng.rand(60, 2)
        r = rng.rand(60) + 0.5
        e = np.ones(60)
        wrapped = mock.Mock(wraps=model_g.HistGradientBoostingRegressor)
        with mock.patch.object(model_g, "HistGradientBoostingRegressor", wrapped):
            model_g.fit_target(spec, "rec_yd", "g1", X, r, e, e, X[:3])
        self.assertGreaterEqual(wrapped.call_count, 1)
        for c in wrapped.call_args_list:
            self.assertEqual(c.kwargs["random_state"], 12345)
            self.assertIs(c.kwargs["early_stopping"], False)

    def test_season_weights_formula(self):
        S = np.arange(2014, 2018)
        np.testing.assert_allclose(era.season_weights(S, 2017, 0.2), np.exp(-0.2 * (2017 - S)))
        np.testing.assert_array_equal(era.season_weights(S, 2017, 0.0), np.ones(4))

    def test_s_max_inner_and_refit(self):
        spec = small_spec("G")
        spec["grid"] = [{"era": "E1", "lam": 0.2, "g": "g1"}]
        T = 2018
        st = sm.Store(self.t, ss.KEYS, ss.WEIGHTS, spec)
        rec = []
        real_build = sm.build_data

        def build(*a, **k):
            d = real_build(*a, **k)
            rec.append(("S", d["train"]["S"].copy()))
            return d

        def fit(spec_, name, g_, Xtr, r, e, w, Xpr):
            rec.append(("w", name, e.copy(), w.copy()))
            return np.full(len(Xpr), float(np.average(r[e > 0], weights=e[e > 0])))
        with mock.patch.object(sm, "build_data", build), mock.patch.object(model_g, "fit_target", fit):
            sm.run_position(st, spec, "G", "WR", T)
        phases = [x for x in rec if x[0] == "S"]
        self.assertEqual(len(phases), 2)                              # the inner fit, then the refit
        s_max_expected = [T - 3, T - 1]
        i = -1
        for item in rec:
            if item[0] == "S":
                i += 1
                S = item[1]
            else:
                _t, _name, e, w = item
                m = e > 0
                np.testing.assert_allclose(w[m] / e[m], np.exp(-0.2 * (s_max_expected[i] - S[m])), err_msg="phase %d" % i)

    def test_determinism(self):
        for fam in ("H", "G"):
            spec = small_spec(fam)
            a = _fold_preds(self.t, spec, fam, 2018)
            b = _fold_preds(self.t, spec, fam, 2018)
            pd.testing.assert_frame_equal(a, b)


if __name__ == "__main__":
    unittest.main()
