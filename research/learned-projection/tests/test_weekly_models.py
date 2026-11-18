"""LP-2b-1b model tests: T-B-1 (n = 0 identity), T-B-2 (H evidence), T-B-3 (H fit), T-B-4 (non-universe history), T-B-5 (G / P(plays) read the spec),
T-B-6 (P(plays), horizon), T-B-7 (cross-fitting and calibration), T-B-8 (relevant-flag copy), T-B-9 (fold isolation), T-B-10 (held season, unit part),
T-B-11 (hook 1: fits persistence), T-B-12 (hook 2: the variant switch). Every test that reaches `fold_w` patches `registry.require`; each states its Fact in setUp."""
import copy
import os
import pickle
import tempfile
import unittest
from unittest import mock

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from threadpoolctl import threadpool_limits

from lp import asof, baselines, chain, model_h, pplays, registry, season_models as sm, spec as spec_mod, spec_w, spec_wm, splits, weekly_data as wd, weekly_g, weekly_h
from lp import weekly_models as wm
from tests import synth_season as ss
from tests import synth_weekly as sw
from tests import synth_wmodels as swm
from tests import test_weekly_bench as twb

_LIMIT = threadpool_limits(limits=1)           # G fits in one thread: identical runs give identical trees (the runner pins the same way)
POS = ("QB", "RB", "WR", "TE")
SPEC_W = spec_w.inputs_spec()


def _pass(*a, **k):
    return None


def _store(tables, name="H"):
    return sm.Store(tables, ss.KEYS, ss.WEIGHTS, sw.small_spec(name))


def _bio(pids):
    return pd.DataFrame({"pid": list(pids), "age": 25.0, "exp": 3.0, "isRookie": 0.0})


def _fold(W, name, T=2021, variant=None, spec=None, frame=None):
    spec = spec or swm.small_spec_w(name)
    fr = W.frame if frame is None else frame
    with mock.patch.object(registry, "require", _pass):
        return wm.fold_w(fr, T, W.store, name, spec, W.rel, W.hist, variant=variant)


def _world():
    return swm.make_frame()


# ── T-B-1 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestN0Identity(unittest.TestCase):
    """T-B-1. Fails if a minor term or a denominator is dropped from the composition."""

    @classmethod
    def setUpClass(cls):
        cls.W = _world()
        cls.fits = _fold(cls.W, "H")[1]
        ix = weekly_h.index(cls.W.hist)
        cls.row = None                                                       # a season-2021 row whose raw q is outside its clip bounds, for some target
        d_all = cls.W.frame[cls.W.frame["S"] == 2021]
        for P, pf in cls.fits.pos.items():
            d = d_all[d_all["position"] == P]
            for t, info in pf.targets.items():
                j = SPEC_W["targets"].index(t)
                E, N = weekly_h.evidence(ix, d["pid"].to_numpy(object), d["S"].to_numpy(int), d["w"].to_numpy(int) - 1, [info["rho"]])
                raw = weekly_h.predict_target(info, d["pr_" + t].to_numpy(float), E[0][:, j], N[0][:, j], d[pf.design["ctx"]].to_numpy(float))
                lo, hi = pf.bounds[t]
                bad = np.flatnonzero((raw < lo) | (raw > hi))
                if len(bad) and cls.row is None:
                    cls.row = (P, d.iloc[[int(bad[0])]])
        assert cls.row is not None, "Fact: a row's raw q is outside its clip bounds"

    def setUp(self):
        self.store = swm.FakeStore()
        self.minor = self.store.minor([], "RB")
        self.assertTrue(any(self.store.weights.get(k, 0) != 0 for k in self.minor), "Fact: a minor key has a non-zero weight")
        self.q = {"rush_att": 12.0, "rec_tgt": 4.0, "rush_yd": 4.0, "rush_td": 0.03, "rec": 0.6, "rec_yd": 8.0, "rec_td": 0.04, "bonus_fd_rb": 0.2, "kr_yd": 1.5,
                  "bonus_rush_yd_100": 0.1, "fum_lost": 0.2}

    def hand(self):
        w, q = self.store.weights, self.q
        ra, rt = q["rush_att"], q["rec_tgt"]
        pts = w["rush_yd"] * q["rush_yd"] * ra + w["rush_td"] * q["rush_td"] * ra + w["rec"] * q["rec"] * rt + w["rec_yd"] * q["rec_yd"] * rt + w["rec_td"] * q["rec_td"] * rt
        pts += w["bonus_fd_rb"] * q["bonus_fd_rb"] * (ra + rt)                                   # two denominators
        pts += w["kr_yd"] * q["kr_yd"] + w["bonus_rush_yd_100"] * q["bonus_rush_yd_100"] + w["fum_lost"] * q["fum_lost"]      # direct per-game keys
        pts += sum(w.get(k, 0) * v for k, v in self.minor.items())                               # the minor constants
        return pts

    def test_compose_equals_the_hand_value_and_a_binding_clip_differs(self):
        got = wm.compose({k: np.array([v]) for k, v in self.q.items()}, "RB", self.store, self.minor)[0]
        self.assertAlmostEqual(got, self.hand(), places=10)
        q2 = dict(self.q, rec_tgt=2.0)                                  # a clip that binds changes the composed value
        self.assertGreater(abs(wm.compose({k: np.array([v]) for k, v in q2.items()}, "RB", self.store, self.minor)[0] - self.hand()), 1e-6)

    def test_prior_row_through_the_fitted_clip_differs(self):
        W = _world()
        fits = _fold(W, "H")[1]
        pf = fits.pos["RB"]
        lo, hi = pf.bounds["rush_att"]
        self.assertTrue(np.isfinite(hi))
        raw = {t["name"]: np.array([W.frame.loc[W.frame["position"] == "RB", "pr_" + t["name"]].median()]) for t in swm._tdefs("RB")}
        clipped = dict(raw, rush_att=np.array([hi * 3.0]))
        unclipped = wm.compose(clipped, "RB", W.store, W.store.minor([], "RB"))[0]
        clipped["rush_att"] = np.clip(clipped["rush_att"], lo, hi)
        self.assertGreater(abs(wm.compose(clipped, "RB", W.store, W.store.minor([], "RB"))[0] - unclipped), 1e-6)

    def test_predict_path_composes_the_clipped_q(self):
        P, row = self.row
        pf = self.fits.pos[P]
        ix = weekly_h.index(self.W.hist)
        q, outside = {}, 0
        for t, info in pf.targets.items():
            j = SPEC_W["targets"].index(t)
            E, N = weekly_h.evidence(ix, row["pid"].to_numpy(object), row["S"].to_numpy(int), row["w"].to_numpy(int) - 1, [info["rho"]])
            raw = weekly_h.predict_target(info, row["pr_" + t].to_numpy(float), E[0][:, j], N[0][:, j], row[pf.design["ctx"]].to_numpy(float))
            lo, hi = pf.bounds[t]
            outside += int(((raw < lo) | (raw > hi)).any())
            q[t] = np.clip(raw, lo, hi)
        self.assertGreater(outside, 0)
        want = wm._ppg_rows(q, row["S"], P, self.W.store)
        got = wm.predict_w(self.fits, row, self.W.hist, self.W.store)["ppg"].to_numpy()
        np.testing.assert_allclose(got, want, rtol=1e-12, atol=0)

    def test_n0_check_on_the_fixture_and_a_perturbed_prior(self):
        W = _world()
        f = W.frame[(W.frame["w"] == 1) & (W.frame["noPrior"] == 0)]
        self.assertTrue(len(f))
        rows = []
        for P in POS:
            d = f[f["position"] == P]
            q = {t: d["pr_" + t].to_numpy(float) for t in SPEC_W["targetsByPos"][P]}
            ppg = wm._ppg_rows(q, d["S"], P, W.store)
            rows.append(pd.DataFrame({"pid": d["pid"].to_numpy(), "T": d["S"].to_numpy(), "position": P, "ppg": ppg}))
        prior = pd.concat(rows, ignore_index=True)
        self.assertLessEqual(wm.n0_check(W.frame, prior, W.store), 1e-12)
        prior["ppg"] = prior["ppg"] + 0.5
        self.assertGreater(wm.n0_check(W.frame, prior, W.store), 1e-3)


# ── T-B-2 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _evidence_case():
    """WR `W1` plays weeks 1-5 (rec_tgt 1, 3, 2, 0, 4; rec_yd 10, 30, 12, 7, 20; rush_yd 1, 2, 0, 3, NaN) and misses week 6; `W2` has no played row."""
    m = sw.Mini(S=2018, W=7)
    rows = [(1, 1, 10, 1.0), (2, 3, 30, 2.0), (3, 2, 12, 0.0), (4, 0, 7, 3.0), (5, 4, 20, np.nan)]
    for w, rt, ry, ru in rows:
        x = ss.xvec(rec_yd=ry, rush_yd=ru if np.isfinite(ru) else 0.0)
        m.play("W1", "WR", w, raw=dict(rec_tgt=rt), x=x)
    m.miss("W1", "WR", 6)
    for w in range(1, 7):
        m.miss("W2", "WR", w)
    return m


class TestHEvidence(unittest.TestCase):
    """T-B-2. Fails if the decay is off by one, the zero-denominator numerator is dropped, or the NaN week counts."""

    def setUp(self):
        self.m = _evidence_case()
        self.t = self.m.tables()
        rid = int(self.t.weeks[(self.t.weeks["pid"] == "W1") & (self.t.weeks["w"] == 5)]["rid"].iloc[0])
        self.t.X[rid, ss.KEYS.index("rush_yd")] = np.nan                  # a played pg row whose numerator is NaN
        self.store = _store(self.t)
        self.hist = weekly_h.history(self.t, self.store, [2018])
        h = self.hist[(self.hist["pid"] == "W1") & (self.hist["w"] == 4)].iloc[0]
        self.assertTrue(h["exp_rec_yd"] == 0 and h["num_rec_yd"] != 0, "Fact: the exp = 0 week has a non-zero numerator")

    def test_hand_values(self):
        E, N = weekly_h.evidence(self.hist, ["W1", "W2"], [2018, 2018], [5, 5], [0.5])
        j = SPEC_W["targets"].index("rec_yd")
        wts = [0.5 ** 4, 0.5 ** 3, 0.5 ** 2, 0.5, 1.0]
        self.assertAlmostEqual(E[0, 0, j], 1 * wts[0] + 3 * wts[1] + 2 * wts[2] + 0 * wts[3] + 4 * wts[4], places=12)
        self.assertAlmostEqual(N[0, 0, j], 10 * wts[0] + 30 * wts[1] + 12 * wts[2] + 7 * wts[3] + 20 * wts[4], places=12)      # the exp = 0 numerator is kept
        k, pr = 2.0, 7.0
        info = {"k": k, "cohort": None}
        b = weekly_h.predict_target(info, [pr], [E[0, 0, j]], [N[0, 0, j]], None)[0]
        self.assertAlmostEqual(b, pr + (N[0, 0, j] - pr * E[0, 0, j]) / (k + E[0, 0, j]), places=12)
        # the pg week with a NaN numerator contributes 0 to both; the others decay by their later rows
        jr = SPEC_W["targets"].index("rush_yd")
        self.assertAlmostEqual(E[0, 0, jr], sum(wts[:4]), places=12)
        self.assertAlmostEqual(N[0, 0, jr], 1 * wts[0] + 2 * wts[1] + 0 * wts[2] + 3 * wts[3], places=12)
        # no evidence: E = N = 0 and b = pr exactly
        self.assertEqual((E[0, 1, j], N[0, 1, j]), (0.0, 0.0))
        self.assertEqual(weekly_h.predict_target(info, [pr], [0.0], [0.0], None)[0], pr)

    def test_equals_inputs_at(self):
        fr = wd.inputs_at(self.t, self.store, 2018, 5, SPEC_W, _bio(["W1", "W2"]))
        got = weekly_h.crosscheck(fr, self.hist)
        self.assertLessEqual(max(got.values()), 1e-12, got)
        r = fr[fr["pid"] == "W1"].iloc[0]
        E, N = weekly_h.evidence(self.hist, ["W1"], [2018], [5], [1.0, 0.7])
        j = SPEC_W["targets"].index("rec_yd")
        self.assertAlmostEqual(E[0, 0, j], r["ex_rec_yd"], places=12)
        self.assertAlmostEqual(N[0, 0, j] / E[0, 0, j], r["std_rec_yd"], places=12)
        self.assertAlmostEqual(N[1, 0, j] / E[1, 0, j], r["rec_rec_yd"], places=12)


# ── T-B-3 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _fit_dgp(seed=4, n=500, seasons=(2018, 2019, 2020)):
    """A `po` DGP: exposure e in 1..20, a player-level deviation (larger for high-e players) and noise with variance ~ 1/e; the decayed sums come
    from a stated history (E_rho = E1 (0.4 + 0.6 rho), N_rho = rate x E_rho + noise)."""
    rng = np.random.RandomState(seed)
    rhos = [0.6, 0.75, 0.85, 0.92, 1.0]
    e = rng.randint(1, 21, n).astype(float)
    pr = rng.uniform(0.4, 0.8, n)
    dev = rng.normal(0, 0.02 + 0.01 * e)
    lam = pr + dev
    r = lam + rng.normal(0, 1, n) / np.sqrt(e)
    E1 = rng.randint(0, 60, n).astype(float)
    E = np.stack([E1 * (0.4 + 0.6 * rh) for rh in rhos])
    N = np.stack([lam * E[j] + rng.normal(0, 0.3, n) * np.sqrt(E[j]) for j in range(len(rhos))])
    S = np.array(seasons)[rng.randint(0, len(seasons), n)]
    X = rng.normal(0, 1, (n, 3))
    return dict(r=r, e=e, pr=pr, E=E, N=N, S=S, X=X)


def _grid_argmin(d, spec, weighted=True):
    med = float(np.median(d["e"]))
    best, arg = None, None
    for km in spec["kMultW"]:
        for j in range(len(spec["rhos"])):
            k = km * med
            b = d["pr"] + (d["N"][j] - d["pr"] * d["E"][j]) / (k + d["E"][j])
            sse = float(((d["e"] if weighted else 1.0) * (d["r"] - b) ** 2).sum())
            if best is None or sse < best:
                best, arg = sse, (km * med, spec["rhos"][j])
    return arg


class TestHFit(unittest.TestCase):
    """T-B-3. Fails if the SSE is unweighted, or the alpha rule ignores the season count."""

    def setUp(self):
        self.spec = swm.small_spec_w("H")
        self.d = _fit_dgp()
        self.assertNotEqual(_grid_argmin(self.d, self.spec, True), _grid_argmin(self.d, self.spec, False), "Fact: the unweighted argmin differs from the weighted one")

    def _fit(self, d, **kw):
        return weekly_h.fit_target(self.spec, d["r"], d["e"], d["pr"], d["E"], d["N"], d["X"], d["S"], **kw)

    def test_weighted_argmin(self):
        info = self._fit(self.d)
        k, rho = _grid_argmin(self.d, self.spec, True)
        self.assertAlmostEqual(info["k"], k, places=9)
        self.assertEqual(info["rho"], rho)

    def test_alpha_rule(self):
        one = dict(self.d, S=np.full(len(self.d["S"]), 2018))
        info1 = self._fit(one)
        self.assertEqual((info1["alpha"], info1["cohort"], info1["alphaSse"]), ("off", None, None))      # fewer than 2 training seasons: the default
        info = self._fit(self.d)
        self.assertEqual(len(info["alphaSse"]), 5)                                                  # "off" competes with the four finite alphas
        self.assertEqual(self.spec["ctxAlphas"][int(np.argmin(info["alphaSse"]))], info["alpha"])
        d = self.d
        b = d["pr"] + (d["N"][info["rhoIdx"]] - d["pr"] * d["E"][info["rhoIdx"]]) / (info["k"] + d["E"][info["rhoIdx"]])
        for a, sse in zip(self.spec["ctxAlphas"], info["alphaSse"]):
            tot = 0.0
            for s in sorted(set(d["S"].tolist())):
                te = d["S"] == s
                if a == "off":                                                                       # no Cohort: the held-out SSE of b itself
                    tot += float((d["e"][te] * (d["r"] - b)[te] ** 2).sum())
                    continue
                c = model_h.Cohort(d["X"][~te], (d["r"] - b)[~te], d["e"][~te], a)
                tot += float((d["e"][te] * ((d["r"] - b)[te] - c.predict(d["X"][te])) ** 2).sum())
            self.assertAlmostEqual(tot, sse, places=8)

    def test_off_wins_when_the_context_is_pure_noise(self):
        rng = np.random.RandomState(11)
        d = dict(self.d, S=np.array([2018, 2019])[rng.randint(0, 2, len(self.d["S"]))], X=rng.normal(0, 1, (len(self.d["S"]), 6)))
        info = self._fit(d)
        self.assertEqual(len(info["alphaSse"]), 5)
        self.assertEqual(info["alpha"], "off")
        self.assertIsNone(info["cohort"])
        self.assertEqual(int(np.argmin(info["alphaSse"])), 4)


# ── T-B-4 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestHistoryNonUniverse(unittest.TestCase):
    """T-B-4. Fails if `history` drops played non-universe rows or reads a week >= w."""

    S = 2019

    @classmethod
    def setUpClass(cls):
        R, t, _p = sw.make_weekly_panel()
        wk = t.weeks
        cand = None
        for pid in sorted(set(wk.loc[(wk["S"] == cls.S) & wk["inUniverse"] & wk["played"], "pid"])):
            g = wk[(wk["pid"] == pid) & (wk["S"] == cls.S) & wk["played"] & wk["inUniverse"] & (wk["w"] <= 4)]
            later = wk[(wk["pid"] == pid) & (wk["S"] == cls.S) & wk["inUniverse"] & (wk["w"] >= 6)]
            if len(g) and len(later) and (g[["rec_tgt", "rush_att", "pass_att"]].sum(axis=1) > 0).any():
                cand = (pid, int(g[g[["rec_tgt", "rush_att", "pass_att"]].sum(axis=1) > 0]["w"].iloc[0]))
                break
        cls.flip = cand
        w2 = wk.copy()
        w2.loc[(w2["pid"] == cand[0]) & (w2["S"] == cls.S) & (w2["w"] == cand[1]), "inUniverse"] = False
        cls.t = asof.Tables(w2, t.teams, t.seasons, t.bench, X=t.X, teamctx=t.teamctx, extras=t.extras)
        cls.store = _store(cls.t)
        cls.hist = weekly_h.history(cls.t, cls.store, [cls.S])
        sc = cls.t.schedule
        cls.frame = pd.concat([wd.inputs_at(cls.t, cls.store, cls.S, n, SPEC_W, _bio(sorted(set(wk["pid"])))) for n in range(0, 7)], ignore_index=True)

    def setUp(self):
        pid, w = self.flip
        wk = self.t.weeks
        self.assertTrue(((wk["pid"] == pid) & (wk["S"] == self.S) & wk["inUniverse"] & (wk["w"] > w)).any(), "Fact: the pid-season has a universe row at a later w")
        r = self.hist[(self.hist["pid"] == pid) & (self.hist["S"] == self.S) & (self.hist["w"] == w)]
        self.assertTrue(len(r) and any(r.iloc[0]["exp_" + t] > 0 for t in SPEC_W["targets"] if np.isfinite(r.iloc[0]["exp_" + t])), "Fact: the flipped row has exp > 0")

    def test_history_reproduces_inputs_at(self):
        got = weekly_h.crosscheck(self.frame, self.hist)
        self.assertLessEqual(max(got.values()), 1e-12, got)
        pid, w = self.flip
        later = self.frame[(self.frame["pid"] == pid) & (self.frame["w"] > w)]
        self.assertTrue(len(later) and (later[[c for c in later.columns if c.startswith("ex_")]].fillna(0).sum(axis=1) > 0).any())

    def test_weeks_from_w_are_never_read(self):
        w0 = 5
        h2 = self.hist.copy()
        rng = np.random.RandomState(1)
        m = ((h2["S"] == self.S) & (h2["w"] >= w0)).to_numpy()
        for c in [c for c in h2.columns if c.startswith(("num_", "exp_"))]:
            h2.loc[m, c] = rng.uniform(50, 99, int(m.sum()))
        pids = sorted(set(self.hist["pid"]))
        a = weekly_h.evidence(self.hist, pids, [self.S] * len(pids), [w0 - 1] * len(pids), [0.7, 1.0])
        b = weekly_h.evidence(h2, pids, [self.S] * len(pids), [w0 - 1] * len(pids), [0.7, 1.0])
        np.testing.assert_array_equal(np.nan_to_num(a[0]), np.nan_to_num(b[0]))
        np.testing.assert_array_equal(np.nan_to_num(a[1]), np.nan_to_num(b[1]))


# ── T-B-5 ───────────────────────────────────────────────────────────────────────────────────────────────────
class _RecReg(HistGradientBoostingRegressor):
    fits = []

    def fit(self, X, y, sample_weight=None):
        _RecReg.fits.append((np.array(X), np.array(y), np.array(sample_weight)))
        return super().fit(X, y, sample_weight=sample_weight)


class TestSpecIsRead(unittest.TestCase):
    """T-B-5. Fails if a seed or parameter is not read from the spec, or the fit target is not r - pr."""

    def setUp(self):
        self.spec = swm.small_spec_w("G")
        self.assertEqual(self.spec["seed"], 7, "Fact: the test seed is 7, not None")
        rng = np.random.RandomState(0)
        n = 60
        self.X, self.pr = rng.normal(0, 1, (n, 4)), rng.uniform(1, 2, n)
        self.r, self.e = self.pr + rng.normal(0, 0.3, n), rng.uniform(0.5, 3, n)
        self.r[3], self.e[5] = np.nan, 0.0
        _RecReg.fits = []

    def test_regressor(self):
        mock_cls = mock.Mock(wraps=_RecReg)
        with mock.patch.object(weekly_g, "HistGradientBoostingRegressor", mock_cls):
            weekly_g.fit_target(self.spec, self.X, self.r, self.e, self.pr)
            weekly_g.fit_target(self.spec, self.X, self.r, self.e, self.pr, g_prior=False)
        for call in mock_cls.call_args_list:
            kw = call.kwargs
            self.assertEqual((kw["random_state"], kw["early_stopping"], kw["loss"]), (7, False, "squared_error"))
            for k, v in self.spec["gPoint"].items():
                self.assertEqual(kw[k], v)
        m = np.isfinite(self.r) & (self.e > 0)
        (X1, y1, w1), (X2, y2, w2) = _RecReg.fits
        np.testing.assert_allclose(y1, (self.r - self.pr)[m])
        np.testing.assert_allclose(y2, self.r[m])
        np.testing.assert_allclose(w1, self.e[m])
        self.assertEqual(len(X1), int(m.sum()))

    def test_classifier_and_logistic(self):
        W = _world()
        df = W.frame[W.frame["position"] == "WR"]
        cols = swm.spec_wm.default_spec_w("H")["pplaysCols"]
        hs = swm.small_spec_w("H")
        mock_c, mock_l = mock.Mock(wraps=HistGradientBoostingClassifier), mock.Mock(wraps=LogisticRegression)
        with mock.patch.object(pplays, "HistGradientBoostingClassifier", mock_c), mock.patch.object(pplays, "LogisticRegression", mock_l):
            pplays.fit(df, self.spec, cols)
            pplays.fit(df, hs, cols)
        kw = mock_c.call_args.kwargs
        self.assertEqual((kw["random_state"], kw["early_stopping"]), (7, False))
        for k, v in self.spec["gPoint"].items():
            self.assertEqual(kw[k], v)
        self.assertEqual(mock_l.call_args.kwargs, {"C": hs["pplays"]["C"], "max_iter": hs["pplays"]["max_iter"]})

    def test_fit_w_passes_the_spec_on(self):
        W = swm.make_frame(pos_n={"QB": 4, "RB": 4, "WR": 4, "TE": 4}, seasons=(2018, 2019))
        mock_cls = mock.Mock(wraps=_RecReg)
        with mock.patch.object(weekly_g, "HistGradientBoostingRegressor", mock_cls):
            wm.fit_w(W.frame, W.rel, W.hist, W.store, self.spec, None, T=2019)
        self.assertTrue(len(mock_cls.call_args_list) > 10)
        for call in mock_cls.call_args_list:
            self.assertEqual(call.kwargs["random_state"], 7)
            self.assertEqual(call.kwargs["max_iter"], self.spec["gPoint"]["max_iter"])


# ── T-B-6 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestPPlaysHorizon(unittest.TestCase):
    """T-B-6. Fails if h counts calendar weeks or P(plays) is not deterministic."""

    def setUp(self):
        rows = [(w, True) for w in (1, 2, 3, 4, 5, 7, 8)]                      # week 6 is the team's bye: the pid has no row
        self.df = pd.DataFrame({"pid": "A", "S": 2018, "w": [w for w, _ in rows], "played": [p for _, p in rows], "p": 0.8, "gs": 0.6})
        self.assertNotIn(6, set(self.df["w"]), "Fact: at n + 2 the team has no game and the pid has no row")

    def test_h_counts_his_rows(self):
        p0, g0, h, y = pplays.horizon_pairs(self.df, [4])
        self.assertEqual(list(h), [2, 3])                                       # origin w = 5; the row at 7 is his NEXT row: h = 2
        p0, g0, h, y = pplays.horizon_pairs(self.df, [0])
        self.assertEqual(list(h), [2, 3, 4, 5, 6, 7])

    def test_pairs_used_for_phi_exclude_h1(self):
        p0, g0, h, y = pplays.horizon_pairs(self.df, [0, 4])
        self.assertTrue((h >= 2).all())
        pairs = (np.append(p0, 0.9), np.append(g0, 0.1), np.append(h, 1), np.append(y, 0.0))      # an injected h = 1 pair must not count
        _phi, scores = pplays.fit_phi(pairs, [0, 0.5, 1.0])
        want = [float(np.mean((pplays.p_at_horizon(p0, g0, h, f) - y) ** 2)) for f in (0, 0.5, 1.0)]
        np.testing.assert_allclose(scores, want)

    def test_phi_is_recovered(self):
        rng = np.random.RandomState(0)
        rows = []
        for i in range(600):
            p = rng.uniform(0.2, 0.95)
            for w in range(1, 17):
                if w == 1:
                    played = True
                    rows.append(dict(pid="P%d" % i, S=2018, w=w, played=True, p=p, gs=0.7))
                    continue
                ph = 0.7 + (p - 0.7) * 0.7 ** (w - 2)
                rows.append(dict(pid="P%d" % i, S=2018, w=w, played=bool(rng.rand() < ph), p=p, gs=0.7))
        phis = [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0]
        phi, _ = pplays.fit_phi(pplays.horizon_pairs(pd.DataFrame(rows), [0]), phis)
        self.assertLessEqual(abs(phis.index(phi) - phis.index(0.7)), 1)

    def test_p_is_deterministic_for_both_families(self):
        W = _world()
        df = W.frame[(W.frame["position"] == "RB") & (W.frame["S"] < 2021)]
        for fam in "HG":
            spec = swm.small_spec_w(fam)
            a = pplays.predict(pplays.fit(df, spec, spec["pplaysCols"]), df)
            b = pplays.predict(pplays.fit(df, spec, spec["pplaysCols"]), df)
            np.testing.assert_array_equal(a, b)


# ── T-B-7 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestCrossfit(unittest.TestCase):
    """T-B-7. Fails if the calibration sees in-sample predictions, or the groups depend on the row order."""

    @classmethod
    def setUpClass(cls):
        cls.W = _world()
        cls.spec = swm.small_spec_w("H")
        cls.tr = cls.W.frame[cls.W.frame["S"] < 2021].reset_index(drop=True)
        cls.cap, cls.cores = {}, []
        orig_cal, orig_core = wm._calibrate, wm._fit_core

        def cal(sub, rel, ppg_oof, mn):
            cls.cap[sub["position"].iloc[0]] = (sub.copy(), np.array(ppg_oof))
            return orig_cal(sub, rel, ppg_oof, mn)

        def core(sub, *a, **k):
            cls.cores.append((sub["position"].iloc[0], len(sub)))
            return orig_core(sub, *a, **k)
        with mock.patch.object(wm, "_calibrate", cal), mock.patch.object(wm, "_fit_core", core):
            cls.fits = wm.fit_w(cls.tr, cls.W.rel, cls.W.hist, cls.W.store, cls.spec, None, T=2021)
        ins = wm.predict_w(cls.fits, cls.tr, cls.W.hist, cls.W.store)
        cls.ins = ins

    def _med(self, P, ppg):
        sub, _ = self.cap[P]
        m = sub[["pid", "S", "w"]].merge(self.W.rel, on=["pid", "S", "w"], how="left")["relevant"].fillna(False).astype(bool).to_numpy()
        ok = m & sub["played"].to_numpy(bool) & (sub["pts"].to_numpy(float) > 0) & (ppg > 0)
        return float(np.median(sub["pts"].to_numpy(float)[ok] / ppg[ok])), int(ok.sum())

    def setUp(self):
        diffs = []
        for P in POS:
            sub, oof = self.cap[P]
            ins = self.ins[self.ins["position"] == P]
            ins = ins.merge(sub[["pid", "S", "w"]].reset_index(), on=["pid", "S", "w"]).sort_values("index")
            diffs.append(abs(self._med(P, oof)[0] - self._med(P, ins["ppg"].to_numpy())[0]))
        self.assertGreater(max(diffs), 1e-6, "Fact: the in-sample and out-of-fold medians differ")

    def test_c_w_is_the_median_of_oof_ratios(self):
        for P in POS:
            med, n = self._med(P, self.cap[P][1])
            self.assertGreaterEqual(n, self.spec["calibMinRows"])
            self.assertAlmostEqual(self.fits.pos[P].c_w, med, places=12)

    def test_oof_values_do_not_see_their_own_group(self):
        """Randomising the outcomes of one cross-fitting group's rows leaves that group's out-of-fold ppg unchanged."""
        P = "WR"
        grp = wm.xfit_groups(self.tr.loc[self.tr["position"] == P, "pid"].tolist(), self.spec["crossFolds"])
        g0 = {p for p, g in grp.items() if g == 0}
        fr = self.tr.copy()
        m = ((fr["position"] == P) & fr["pid"].isin(g0)).to_numpy()
        rng = np.random.RandomState(2)
        for c in [c for c in fr.columns if c.startswith(("r_", "e_"))]:
            fr.loc[m, c] = np.where(np.isfinite(fr.loc[m, c]), rng.uniform(1, 50, int(m.sum())), fr.loc[m, c])
        fr.loc[m, "pts"] = rng.uniform(1, 40, int(m.sum()))
        cap = {}
        orig = wm._calibrate
        with mock.patch.object(wm, "_calibrate", lambda sub, rel, ppg, mn: cap.setdefault(sub["position"].iloc[0], (sub.copy(), np.array(ppg))) and orig(sub, rel, ppg, mn)):
            wm.fit_w(fr, self.W.rel, self.W.hist, self.W.store, self.spec, None, T=2021)
        sub0, oof0 = self.cap[P]
        sub1, oof1 = cap[P]
        k = sub0["pid"].isin(g0).to_numpy()
        np.testing.assert_array_equal(oof0[k], oof1[k])
        self.assertFalse(np.array_equal(oof0[~k], oof1[~k]), "the other groups' fits do see the changed rows")

    def test_groups(self):
        pids = self.tr["pid"].tolist()
        a = wm.xfit_groups(pids, 4)
        rng = np.random.RandomState(0)
        sh = list(pids)
        rng.shuffle(sh)
        self.assertEqual(a, wm.xfit_groups(sh, 4))
        self.assertEqual(set(a), set(pids))
        self.assertEqual(set(a.values()), {0, 1, 2, 3})

    def test_final_models_use_every_training_row(self):
        for P in POS:
            n = int((self.tr["position"] == P).sum())
            self.assertEqual(self.fits.pos[P].facts["rows"], n)
            calls = [c for p, c in self.cores if p == P]
            self.assertEqual(len(calls), self.spec["crossFolds"] + 1)
            self.assertEqual(calls[-1], n)
            self.assertTrue(all(c < n for c in calls[:-1]))

    def test_fewer_than_calib_min_rows_gives_one(self):
        spec = dict(self.spec, calibMinRows=10 ** 6)
        fits = wm.fit_w(self.tr, self.W.rel, self.W.hist, self.W.store, spec, None, T=2021)
        self.assertEqual([fits.pos[P].c_w for P in POS], [1.0] * 4)


# ── T-B-8 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestRelevantCopy(unittest.TestCase):
    """T-B-8 (original: `baselines.weekly_forecasts`). Fails if the copy drifts from the original's training frame."""

    def setUp(self):
        self.wf = twb.weekly_frame(seasons=range(2014, 2021), n_weeks=5, per_pos=6)
        self.wf.loc[np.random.RandomState(1).rand(len(self.wf)) < 0.4, "prior_b2"] = np.nan          # stratum N: STD falls back to the position's training mean
        self.bw = twb.benchw_for(self.wf)
        self.T = 2020
        with mock.patch.object(baselines, "RELEVANT_K", {"QB": 2, "RB": 2, "WR": 2, "TE": 2}):
            got = self._medians(wm.train_relevant(self.wf, self.T), self.wf, self.bw)
            # Fact: pos_mean over ALL rows (a drifted copy) changes the per-position median of the copy's relevant rows
            train = self.wf[(self.wf["S"] < self.T)].copy()
            pm = train.groupby("position")["actual0"].mean().to_dict()                  # the mean over ALL rows (0 for a missed game)
            pm_played = train[train["played"] == True].groupby("position")["pts"].mean().to_dict()  # noqa: E712
            self.assertNotEqual(pm, pm_played)
            alt = baselines.mark_relevant(baselines.add_std(train, pm))[["pid", "S", "w", "relevant"]]
            self.assertNotEqual(self._medians(alt, self.wf, self.bw), got, "Fact: that pos_mean changes the per-position median")

    def _medians(self, rel, wf, bw):
        tr = wf[(wf["S"] < self.T) & (wf["S"] >= 2014)].merge(rel, on=["pid", "S", "w"]).merge(bw, on=["pid", "S", "w"], how="left")
        out = {}
        for P in POS:
            t = tr[(tr["position"] == P) & tr["relevant"] & (tr["played"] == True) & tr["cond"].notna() & (tr["cond"] > 0) & (tr["pts"] > 0)]  # noqa: E712
            out[P] = float(np.median(t["pts"] / t["cond"]))
        return out

    def test_copy_matches_weekly_forecasts(self):
        with mock.patch.object(baselines, "RELEVANT_K", {"QB": 2, "RB": 2, "WR": 2, "TE": 2}):
            wk = baselines.weekly_forecasts(self.wf, self.T, benchw=self.bw)
            rel = wm.train_relevant(self.wf, self.T)
            got = self._medians(rel, self.wf, self.bw)
            for P in POS:
                self.assertEqual(got[P], float(wk.loc[wk["position"] == P, "c_weekly"].iloc[0]), P)


# ── T-B-9 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _probe_state(fits, W, T=2021):
    out = {}
    probe = W.frame[W.frame["S"] == T]
    for P, pf in fits.pos.items():
        d = probe[probe["position"] == P]
        o = {"c_w": pf.c_w, "phi": pf.phi, "bounds": pf.bounds, "p": pplays.predict(pf.pplays, d)}
        if fits.family == "H":
            o["hp"] = {t: (i["k"], i["rho"], i["alpha"]) for t, i in pf.targets.items()}
            o["ridge"] = {t: (i["cohort"].predict(d[pf.design["ctx"]].to_numpy(float)) if i["cohort"] is not None else "off") for t, i in pf.targets.items()}
        else:
            o["trees"] = {t: m.predict(d[pf.design["g"]].to_numpy(float)) for t, m in pf.targets.items()}
        out[P] = o
    return out


def _same(a, b):
    if isinstance(a, dict):
        return set(a) == set(b) and all(_same(a[k], b[k]) for k in a)
    if isinstance(a, np.ndarray):
        return np.array_equal(a, b)
    if isinstance(a, tuple):
        return all(_same(x, y) for x, y in zip(a, b))
    return a == b


class TestFoldIsolation(unittest.TestCase):
    """T-B-9. Fails if a fit or a prediction looks ahead of its fold or its origin."""

    T = 2021

    @classmethod
    def setUpClass(cls):
        cls.W = _world()
        cls.W2 = swm.make_frame(seed=0)
        W = cls.W2
        rng = np.random.RandomState(5)
        fr = W.frame.copy()
        m = (fr["S"] == cls.T).to_numpy()
        for c in [c for c in fr.columns if c.startswith(("r_", "e_"))]:
            fr.loc[m, c] = np.where(np.isfinite(fr.loc[m, c]), rng.uniform(100, 500, int(m.sum())), fr.loc[m, c])
        fr.loc[m, "played"] = rng.rand(int(m.sum())) < 0.5
        fr.loc[m, "pts"] = rng.uniform(100, 300, int(m.sum()))
        h = W.hist.copy()
        mh = (h["S"] == cls.T).to_numpy()
        for c in [c for c in h.columns if c.startswith(("num_", "exp_"))]:
            h.loc[mh, c] = np.where(np.isfinite(h.loc[mh, c]), rng.uniform(100, 500, int(mh.sum())), h.loc[mh, c])
        cls.fr_mod, cls.h_mod = fr, h

    def setUp(self):
        W = self.W
        tr = W.frame[W.frame["S"] < self.T]
        for t in ("pass_yd", "rec_yd", "rush_yd", "rec_tgt"):
            self.assertGreater(self.fr_mod.loc[self.fr_mod["S"] == self.T, "r_" + t].max(), tr["r_" + t].max(), "Fact: the randomised season-T r exceeds the training maximum")
        self.n = 3
        h = W.hist
        self.assertTrue(((h["S"] == self.T) & (h["w"] > self.n) & (h["w"] < 7)).any(), "Fact: hist holds rows between n and w")

    def test_season_T_outcomes_change_no_fit(self):
        for name in "HG":
            base = _fold(self.W2, name)[1]
            with mock.patch.object(registry, "require", _pass):
                fits2 = wm.fold_w(self.fr_mod, self.T, self.W2.store, name, swm.small_spec_w(name), self.W2.rel, self.h_mod)[1]
            a, b = _probe_state(base, self.W2), _probe_state(fits2, self.W2)
            self.assertTrue(_same(a, b), name)

    def test_weeks_from_w0_do_not_change_the_w0_predictions(self):
        w0 = 5
        W = self.W2
        base = _fold(W, "H")[0]
        fr, h = W.frame.copy(), W.hist.copy()
        rng = np.random.RandomState(3)
        m = ((fr["S"] == self.T) & (fr["w"] >= w0)).to_numpy()
        for c in [c for c in fr.columns if c.startswith(("r_", "e_"))] + ["pts"]:
            fr.loc[m, c] = rng.uniform(100, 500, int(m.sum()))
        mh = ((h["S"] == self.T) & (h["w"] >= w0)).to_numpy()
        for c in [c for c in h.columns if c.startswith(("num_", "exp_"))]:
            h.loc[mh, c] = rng.uniform(100, 500, int(mh.sum()))
        with mock.patch.object(registry, "require", _pass):
            new = wm.fold_w(fr, self.T, W.store, "H", swm.small_spec_w("H"), W.rel, h)[0]
        k = (base["w"] <= w0).to_numpy()
        pd.testing.assert_frame_equal(base[k].reset_index(drop=True), new[k].reset_index(drop=True), check_exact=True)

    def test_origin_limits_the_evidence(self):
        W = self.W2
        fits = _fold(W, "H")[1]
        rows = W.frame[(W.frame["S"] == self.T) & (W.frame["w"] == 7)]
        base = wm.predict_w(fits, rows, W.hist, W.store, origin=np.full(len(rows), self.n))
        h = W.hist.copy()
        m = ((h["S"] == self.T) & (h["w"] > self.n)).to_numpy()
        rng = np.random.RandomState(4)
        for c in [c for c in h.columns if c.startswith(("num_", "exp_"))]:
            h.loc[m, c] = rng.uniform(100, 500, int(m.sum()))
        new = wm.predict_w(fits, rows, h, W.store, origin=np.full(len(rows), self.n))
        pd.testing.assert_frame_equal(base, new, check_exact=True)
        default = wm.predict_w(fits, rows, W.hist, W.store)
        self.assertFalse(np.allclose(default["cond"], base["cond"]), "the default origin (w - 1) reads the weeks the explicit origin ignores")


# ── T-B-10 (unit part; the runner part is in test_weekly_registry) ─────────────────────────────────────────
class TestHeldSeasonUnit(unittest.TestCase):
    """T-B-10. Fails if a held row reaches a fit."""

    def setUp(self):
        self.W = _world()
        self.assertTrue(len(self.W.frame))

    def test_fold_w_guards_the_held_season(self):
        with mock.patch.object(registry, "require", _pass):
            with self.assertRaises(registry.ConfirmationHeld):
                wm.fold_w(self.W.frame, wd.LAST_SEASON + 1, self.W.store, "H", swm.small_spec_w("H"), self.W.rel, self.W.hist)

    def test_a_row_beyond_last_season_raises(self):
        fr = self.W.frame.copy()
        fr.loc[fr.index[:5], "S"] = wd.LAST_SEASON + 1
        pred = (fr["S"] == wd.LAST_SEASON + 1).to_numpy()
        with mock.patch.object(registry, "require", _pass):
            with self.assertRaises(AssertionError):
                wm.fold_w(fr, 2021, self.W.store, "H", swm.small_spec_w("H"), self.W.rel, self.W.hist, pred=pred)

    def test_constants(self):
        for n in ("H", "G"):
            self.assertEqual(spec_wm.default_spec_w(n)["lastSeason"], wd.LAST_SEASON)
        self.assertEqual(wd.LAST_SEASON, splits.CONFIRM_FOLD - 1)
        self.assertEqual(tuple(T for T in splits.DEV_FOLDS if T <= wd.LAST_SEASON), tuple(range(2019, 2025)))
        self.assertEqual(spec_wm.default_spec_w("H")["trainFrom"], spec_w.TRAIN_FROM)


# ── T-B-11 ──────────────────────────────────────────────────────────────────────────────────────────────────
def _raw_outside(fits, W, T=2021):
    """Fact helper: some raw (unclipped) prediction lies outside its clip bounds."""
    d_all = W.frame[W.frame["S"] == T]
    ix = weekly_h.index(W.hist)
    for P, pf in fits.pos.items():
        d = d_all[d_all["position"] == P]
        for t, info in pf.targets.items():
            pr = d["pr_" + t].to_numpy(float)
            if fits.family == "H":
                j = SPEC_W["targets"].index(t)
                E, N = weekly_h.evidence(ix, d["pid"].to_numpy(object), d["S"].to_numpy(int), d["w"].to_numpy(int) - 1, [info["rho"]])
                raw = weekly_h.predict_target(info, pr, E[0][:, j], N[0][:, j], d[pf.design["ctx"]].to_numpy(float))
            else:
                raw = weekly_g.predict_target(info, d[pf.design["g"]].to_numpy(float), pr)
            lo, hi = pf.bounds[t]
            if ((raw < lo) | (raw > hi)).any():
                return True
    return False


class TestHook1FitsPersistence(unittest.TestCase):
    """T-B-11. Fails if a pickled `Fits` loses state (the clip bounds)."""

    @classmethod
    def setUpClass(cls):
        cls.W = _world()
        cls.res = {n: _fold(cls.W, n) for n in "HG"}
        for n, (_, fits) in cls.res.items():
            assert _raw_outside(fits, cls.W), "Fact: at least one raw prediction lies outside its bounds (%s)" % n

    def test_round_trip_gives_identical_predictions(self):
        for n, (preds, fits) in self.res.items():
            back = pickle.loads(pickle.dumps(fits, protocol=4))
            rows = self.W.frame[self.W.frame["S"] == 2021]
            pd.testing.assert_frame_equal(preds, wm.predict_w(back, rows, self.W.hist, self.W.store), check_exact=True)
            d = tempfile.mkdtemp()
            p = os.path.join(d, "weekly-fits.pkl")
            with open(p, "wb") as f:
                pickle.dump({(n.lower(), 2021): fits}, f, protocol=4)
            with open(p, "rb") as f:
                again = pickle.load(f)[(n.lower(), 2021)]
            pd.testing.assert_frame_equal(preds, wm.predict_w(again, rows, self.W.hist, self.W.store), check_exact=True)


    def test_a_fits_whose_alpha_is_off_round_trips(self):
        W = self.W
        preds, fits = _fold(W, "H", T=2019)                                   # one training season: every alpha is "off"
        self.assertTrue(all(i["alpha"] == "off" for pf in fits.pos.values() for i in pf.targets.values()))
        back = pickle.loads(pickle.dumps(fits, protocol=4))
        self.assertTrue(all(i["alpha"] == "off" and i["cohort"] is None for pf in back.pos.values() for i in pf.targets.values()))
        rows = W.frame[W.frame["S"] == 2019]
        pd.testing.assert_frame_equal(preds, wm.predict_w(back, rows, W.hist, W.store), check_exact=True)


# ── T-B-17 ──────────────────────────────────────────────────────────────────────────────────────────────────
class TestOneTrainingSeason(unittest.TestCase):
    """T-B-17. Fails if a fold with one training season fits a context ridge."""

    T = 2019

    @classmethod
    def setUpClass(cls):
        cls.W = _world()

    def setUp(self):
        W = self.W
        self.tr = W.frame[(W.frame["S"] >= 2018) & (W.frame["S"] < self.T)]
        self.assertEqual(len(self.tr["S"].unique()), 1, "Fact: the training set spans exactly one season")
        self.assertTrue(len(W.frame[(W.frame["S"] == self.T) & (W.frame["w"] == 1)]), "Fact: w1 is non-empty")
        self.assertEqual(spec_wm.default_spec_w("H")["ctxDefaultAlpha"], "off")
        spec = swm.small_spec_w("H")
        self.assertEqual((spec["ctxAlphas"], spec["ctxDefaultAlpha"]), (spec_wm.default_spec_w("H")["ctxAlphas"], "off"), "the spec under test is the registered one")
        # Fact (continued): with alpha = 100 the context ridge is NOT zero on this row set
        P = "RB"
        d = self.tr[self.tr["position"] == P]
        dsg = wm.design(spec, {}, set(W.frame.columns))
        ix = weekly_h.index(W.hist)
        E, N = weekly_h.evidence(ix, d["pid"].to_numpy(object), d["S"].to_numpy(int), d["w"].to_numpy(int) - 1, [1.0])
        t = "rush_att"
        j = SPEC_W["targets"].index(t)
        pr = d["pr_" + t].to_numpy(float)
        b = pr + (N[0][:, j] - pr * E[0][:, j]) / (4.0 + E[0][:, j])
        m = (d["e_" + t].to_numpy(float) > 0)
        c = model_h.Cohort(d[dsg["ctx"]].to_numpy(float)[m], (d["r_" + t].to_numpy(float) - b)[m], d["e_" + t].to_numpy(float)[m], 100)
        self.assertGreater(np.abs(c.predict(d[dsg["ctx"]].to_numpy(float))).max(), 1e-6, "Fact: a 100-alpha Cohort's prediction differs from 0")

    def test_prediction_is_the_clipped_evidence_blend_and_no_cohort_is_built(self):
        W = self.W
        spy = mock.Mock(wraps=model_h.Cohort)
        with mock.patch.object(model_h, "Cohort", spy):
            preds, fits = _fold(W, "H", T=self.T)
        spy.assert_not_called()
        ix = weekly_h.index(W.hist)
        rows_all = W.frame[W.frame["S"] == self.T]
        for P in POS:
            pf = fits.pos[P]
            rows = rows_all[rows_all["position"] == P]
            q = {}
            for t, info in pf.targets.items():
                self.assertEqual((info["alpha"], info["cohort"]), ("off", None))
                j = SPEC_W["targets"].index(t)
                E, N = weekly_h.evidence(ix, rows["pid"].to_numpy(object), rows["S"].to_numpy(int), rows["w"].to_numpy(int) - 1, [info["rho"]])
                pr = rows["pr_" + t].to_numpy(float)
                q[t] = np.clip(pr + (N[0][:, j] - pr * E[0][:, j]) / (info["k"] + E[0][:, j]), *pf.bounds[t])
            want = wm._ppg_rows(q, rows["S"], P, W.store)
            got = preds[preds["position"] == P].set_index(["pid", "S", "w"]).loc[list(zip(rows["pid"], rows["S"], rows["w"]))]["ppg"].to_numpy()
            np.testing.assert_allclose(got, want, rtol=1e-12, atol=0)
        w1 = rows_all[rows_all["w"] == 1]                                        # with E = 0 (week 1) b = pr: the prediction is the season prior's clipped value
        for P in POS:
            pf = fits.pos[P]
            rows = w1[w1["position"] == P]
            q = {t: np.clip(rows["pr_" + t].to_numpy(float), *pf.bounds[t]) for t in pf.targets}
            want = wm._ppg_rows(q, rows["S"], P, W.store)
            got = preds[preds["position"] == P].set_index(["pid", "S", "w"]).loc[list(zip(rows["pid"], rows["S"], rows["w"]))]["ppg"].to_numpy()
            np.testing.assert_allclose(got, want, rtol=1e-12, atol=0)


# ── T-B-12 ──────────────────────────────────────────────────────────────────────────────────────────────────
class TestHook2Variants(unittest.TestCase):
    """T-B-12. Fails if the default path differs from the registered one, or a variant does more than it names."""

    @classmethod
    def setUpClass(cls):
        cls.W = _world()
        cls.base = {n: _fold(cls.W, n) for n in "HG"}

    def setUp(self):
        self.assertTrue(any(abs(pf.c_w - 1.0) > 1e-3 for pf in self.base["H"][1].pos.values()), "Fact: the registered c_w differs from 1 by more than 1e-3")

    def test_none_and_empty_are_the_registered_path(self):
        p0, f0 = self.base["H"]
        p1, f1 = _fold(self.W, "H", variant={})
        pd.testing.assert_frame_equal(p0, p1, check_exact=True)
        self.assertEqual(pickle.dumps(f0, protocol=4), pickle.dumps(f1, protocol=4))
        self.assertEqual(wm.REGISTERED, {})

    def test_fixed_calib_reuses_the_registered_values_and_does_no_cross_fit(self):
        for n in "HG":
            preds, fits = self.base[n]
            fc = {"c_w": {P: fits.pos[P].c_w for P in POS}, "phi": {P: fits.pos[P].phi for P in POS}}
            with mock.patch.object(wm, "xfit_groups", side_effect=AssertionError("cross-fitting ran")):
                p2, f2 = _fold(self.W, n, variant={"fixedCalib": fc})
            pd.testing.assert_frame_equal(preds, p2, check_exact=True)

    def test_drop_and_add_columns(self):
        _p, f0 = self.base["H"]
        _p, f1 = _fold(self.W, "H", variant={"dropGroups": ["absence"], "addCols": ["ex_rush_att"]})
        gone = set(SPEC_W["groups"]["absence"])
        for P in POS:
            for k, cols in f0.pos[P].design.items():
                want = [c for c in cols if c not in gone] + (["ex_rush_att"] if "ex_rush_att" not in cols else [])
                self.assertEqual(f1.pos[P].design[k], want, (P, k))
        _p, g1 = _fold(self.W, "G", variant={"dropGroups": ["absence"], "addCols": ["ex_rush_att"]})
        self.assertFalse(gone & set(g1.pos["RB"].design["g"]))
        self.assertEqual(g1.pos["RB"].design["g"].count("ex_rush_att"), 1)

    def test_h_context_off_is_the_clipped_evidence_blend(self):
        preds, fits = _fold(self.W, "H", variant={"hContext": False})
        rows = self.W.frame[(self.W.frame["S"] == 2021) & (self.W.frame["position"] == "WR")]
        pf = fits.pos["WR"]
        ix = weekly_h.index(self.W.hist)
        q = {}
        for t, info in pf.targets.items():
            self.assertIsNone(info["cohort"])
            j = SPEC_W["targets"].index(t)
            E, N = weekly_h.evidence(ix, rows["pid"].to_numpy(object), rows["S"].to_numpy(int), rows["w"].to_numpy(int) - 1, [info["rho"]])
            b = rows["pr_" + t].to_numpy(float) + (N[0][:, j] - rows["pr_" + t].to_numpy(float) * E[0][:, j]) / (info["k"] + E[0][:, j])
            q[t] = np.clip(b, *pf.bounds[t])
        want = wm._ppg_rows(q, rows["S"], "WR", self.W.store)
        got = preds[preds["position"] == "WR"].set_index(["pid", "S", "w"]).loc[list(zip(rows["pid"], rows["S"], rows["w"]))]["ppg"].to_numpy()
        np.testing.assert_allclose(got, want, rtol=1e-12)

    def test_g_prior_off_has_no_prior_columns(self):
        _p, fits = _fold(self.W, "G", variant={"gPrior": False})
        prior = set(SPEC_W["groups"]["prior"])
        for P in POS:
            self.assertFalse(prior & set(fits.pos[P].design["g"]))
        self.assertTrue(prior & set(self.base["G"][1].pos["RB"].design["g"]))

    def test_unknown_keys_raise(self):
        for bad, fam in (({"nonsense": 1}, "H"), ({"gPrior": False}, "H"), ({"hContext": False}, "G"), ({"dropGroups": ["nope"]}, "H"), ({"fixedCalib": {"c_w": {}}}, "H")):
            with self.assertRaises(ValueError):
                _fold(self.W, fam, variant=bad)


class TestSpec(unittest.TestCase):
    """The registered weekly spec: per-family nulls and the fixed sections of §7."""

    def test_family_nulls(self):
        h, g = spec_wm.default_spec_w("H"), spec_wm.default_spec_w("G")
        self.assertIsNone(h["gGroups"])
        self.assertIsNone(h["gPoint"])
        for k in ("kMultW", "rhos", "ctxGroups", "ctxCols", "ctxAlphas", "ctxDefaultAlpha", "pplays"):
            self.assertIsNone(g[k], k)
        self.assertIsNotNone(g["gPoint"])
        self.assertEqual(h["pplaysCols"], g["pplaysCols"])
        self.assertEqual((h["trainFrom"], h["lastSeason"], h["seed"], h["crossFolds"], h["calibMinRows"]), (2018, 2024, 0, 4, 30))
        with self.assertRaises(ValueError):
            spec_wm.default_spec_w("X")


if __name__ == "__main__":
    unittest.main()
