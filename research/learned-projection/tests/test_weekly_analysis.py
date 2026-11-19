"""LP-2b-1c-i tests T-C-1..T-C-10 (task `.claude/tasks/learned-projection-2b1c1-weekly-analyses.md` §15): the copied `paired` arithmetic, week bands, edge classes, error
surfaces and R-S, the k sweep, the widened / fixedCalib / no-context refits, override speeds, the runner's anchors and the held season, report-only isolation, and the pins.
Fixtures: `synth_wmodels` (H `Fits` from `fit_w`), hand-built frames and the `e2e_w` run (imported, never edited). Every test that reaches `fold_w` patches `registry.require`;
each states its Fact in setUp / setUpClass."""
import contextlib
import copy
import hashlib
import io
import json
import os
import pickle
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

import numpy as np
import pandas as pd

import run_weekly_analysis as rwa
import run_weekly_models as rwm
from lp import analysis_w as A
from lp import evaluate_w, metrics as M, registry, registry_w, report_s2b1c, spec as spec_mod, weekly_data as wd
from lp import weekly_models as wm
from tests import e2e_w
from tests import synth_season as ss
from tests import synth_wmodels as swm

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TASK = os.path.join(REPO, ".claude", "tasks", "learned-projection-2b1c1-weekly-analyses.md")


def _pass(*a, **k):
    return None


def _sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ── hand frames ─────────────────────────────────────────────────────────────────────────────────────────────
FOLDS2 = (2019, 2020)


def hand_wk(seed=3):
    """The concatenated test frames of two folds, two positions: 12 players a position, weeks 1-12 (so some rows sit at w = 4, 5, 9 and 10), h, g, std and b1cw columns.
    Player X is in the RB rows only and never `relevant`; player R11 has no rows from week 9 on."""
    rng = np.random.RandomState(seed)
    rows = []
    for T in FOLDS2:
        for P in ("RB", "WR"):
            for w in range(1, 13):
                for i in range(12):
                    if P == "RB" and i == 11 and w >= 9:
                        continue
                    pts = float(rng.gamma(3.0, 3.0))
                    rows.append(dict(pid="%s%02d" % (P[0], i), S=T, w=w, position=P, T=T, relevant=True, played=bool(rng.rand() < 0.92), pts=pts, std=pts * 0.3 + rng.uniform(2, 9),
                                     b1cw=(np.nan if rng.rand() < 0.05 else pts * 0.4 + rng.uniform(2, 8)), h=pts * 0.5 + rng.uniform(1, 7), g=pts * 0.45 + rng.uniform(1, 8)))
                if P == "RB":
                    pts = float(rng.gamma(3.0, 3.0))
                    rows.append(dict(pid="XRB", S=T, w=w, position=P, T=T, relevant=False, played=True, pts=pts, std=6.0, b1cw=6.0, h=7.0, g=7.0))
    return pd.DataFrame(rows)


# ── T-C-1 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestPairedEqualsLabels(unittest.TestCase):
    """T-C-1. Fails if the resampler universe, the group ids or the rows drift from `evaluate_w.labels`."""

    @classmethod
    def setUpClass(cls):
        cls.wk = hand_wk()
        cls.res = evaluate_w.labels(cls.wk, FOLDS2, B=200)

    def setUp(self):
        d = self.wk[self.wk["position"] == "RB"]
        only_nonrel = set(d[~d["relevant"]]["pid"]) - set(d[d["relevant"]]["pid"])
        self.assertTrue(only_nonrel, "Fact: a pid appears only in non-relevant rows, so the two resampler universes differ")

    def test_paired_equals_labels_for_both_benchmarks_and_positions(self):
        for c in ("h", "g"):
            for bname, bcol in (("STD", "std"), ("B1c", "b1cw")):
                got = A.paired(self.wk, c, bcol, A.all_rows, FOLDS2, 200)
                for P in ("RB", "WR"):
                    ref = self.res[c][P][bname]
                    g = got[P]
                    self.assertEqual(g["n"], ref["n"])
                    self.assertEqual(g["aMae"], ref["candMae"])
                    self.assertEqual(g["bMae"], ref["benchMae"])
                    self.assertEqual(g["d"], ref["d"])
                    self.assertEqual(g["pct"], ref["pct"])
                    self.assertEqual(g["dSpearman"], ref["dSpearman"])
                    self.assertNotIn("label", g)


# ── T-C-2 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestBands(unittest.TestCase):
    """T-C-2. Fails if bands use w instead of w - 1, or the resampler universe shrinks to the band."""

    @classmethod
    def setUpClass(cls):
        cls.wk = hand_wk()

    def setUp(self):
        self.assertTrue({4, 5, 9, 10} <= set(self.wk["w"]), "Fact: the fixture has rows at w = 4, 5, 9 and 10")
        late = set(self.wk[self.wk["w"] >= 9]["pid"])
        self.assertIn("R11", set(self.wk["pid"]) - late, "Fact: a pid appears only outside the 9+ band")

    def test_band_edges_use_the_origin_n_equal_w_minus_one(self):
        self.assertEqual(list(A.band_of([4, 5, 9, 10])), ["0-3", "4-8", "4-8", "9+"])

    def test_bands_partition_the_comparison_rows(self):
        for P in ("RB", "WR"):
            d = self.wk[self.wk["position"] == P]
            masks = [A.band_rows(b)(d) for b in A.BANDS]
            self.assertTrue((sum(m.astype(int) for m in masks) == 1).all())
            comp = d["relevant"].astype(bool) & d["played"].astype(bool) & d["std"].notna()
            self.assertEqual(int(comp.sum()), int(sum((m & comp).sum() for m in masks)))

    def test_a_band_equals_paired_on_a_frame_that_marks_the_other_rows_not_relevant(self):
        for band in A.BANDS:
            a = A.paired(self.wk, "h", "std", A.band_rows(band), FOLDS2, 200)
            wk2 = self.wk.copy()
            wk2["relevant"] = wk2["relevant"].astype(bool) & (A.band_of(wk2["w"]) == band)
            b = A.paired(wk2, "h", "std", A.all_rows, FOLDS2, 200)
            self.assertEqual(a, b, "band %s" % band)


# ── T-C-3 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _info(kmult, rho, ridx, alpha, sse_none=False):
    return {"k": 1.0, "kGames": kmult, "kMult": float(kmult), "rho": float(rho), "rhoIdx": ridx, "alpha": alpha, "alphaSse": None if sse_none else [1.0, 2.0, 3.0, 4.0, 5.0], "medE": 1.0,
            "cohort": None, "gridSse": np.arange(1, 56, dtype=float).reshape(11, 5).tolist()}


HFOLDS = tuple(range(2019, 2025))
RHO_IDX = {0.6: 0, 0.75: 1, 0.85: 2, 0.92: 3, 1.0: 4}


def hand_fits():
    """H: RB targets rush_att (kMult 32 in all six folds, rho 1.0, alpha "off"; in 2019 the alpha is the default: no alphaSse), rec_tgt (kMult 0.5, rho 0.6 and alpha 1 in three folds each,
    else 8 / 0.85 / 1000) and rush_yd (interior). G: phi only."""
    fits = {}
    for i, T in enumerate(HFOLDS):
        first = (T == 2019)
        edge3 = i < 3
        tg = {"rush_att": _info(32, 1.0, 4, "off", sse_none=first),
              "rec_tgt": _info(0.5 if edge3 else 8, 0.6 if edge3 else 0.85, 0 if edge3 else 2, ("off" if first else (1.0 if 1 <= i <= 3 else 1000.0)), sse_none=first),
              "rush_yd": _info(8, 0.85, 2, 100.0, sse_none=first)}
        fits[("h", T)] = SimpleNamespace(pos={"RB": SimpleNamespace(phi=0.95, targets=tg, c_w=1.0)})
        fits[("g", T)] = SimpleNamespace(pos={"RB": SimpleNamespace(phi=1.0, targets={}, c_w=1.0)})
    return fits


def hand_art():
    res = {"RB": {"h": {"chosen": {}}, "g": {"chosen": {}}}}
    for i, T in enumerate(HFOLDS):
        e3 = i < 3
        res["RB"]["h"]["chosen"][str(T)] = {"entry": {"era": "E0", "lam": 0.35 if e3 else 0.2}, "innerMae": [], "params": {
            "rush_att": {"alpha": 1000 if e3 else 100, "kmult": 10 if e3 else (0 if i == 3 else 2), "delta": 0.5 if e3 else (1.0 if i == 3 else 0.8)}, "gamesShare": {"alpha": 100, "kmult": 5, "delta": 0.9}}}
        res["RB"]["g"]["chosen"][str(T)] = {"entry": {"era": "E1", "g": "g3", "lam": 0.2}, "innerMae": [], "params": {}}
    return {"results": res}


class TestEdgeClasses(unittest.TestCase):
    """T-C-3. Fails if "off" or a natural limit is read as an edge, or the last element as interior."""

    @classmethod
    def setUpClass(cls):
        cls.wspec = {"h": copy.deepcopy(swm._DEFAULT["H"]), "g": copy.deepcopy(swm._DEFAULT["G"])}
        cls.sspec = {"h": spec_mod.default_spec("H"), "g": spec_mod.default_spec("G")}
        cls.ge = A.grid_edges(hand_fits(), hand_art(), cls.wspec, cls.sspec, HFOLDS, positions=("RB",))

    def setUp(self):
        seen = {(r["layer"], r["setting"], r["value"]) for r in self.ge["rows"]}
        for want in (("weekly", "kMult", 32.0), ("weekly", "kMult", 0.5), ("weekly", "kMult", 8.0), ("weekly", "rho", 1.0), ("weekly", "rho", 0.6), ("weekly", "alpha", "off"),
                     ("weekly", "alpha", 1.0), ("weekly", "alpha", 1000.0), ("weekly", "phi", 0.95), ("season", "alpha", 1000), ("season", "kmult", 0), ("season", "kmult", 10),
                     ("season", "delta", 1.0), ("season", "delta", 0.5), ("season", "lam", 0.35)):
            self.assertIn(want, seen, "Fact: the fixture holds %s" % (want,))

    def cls_of(self, layer, setting, value, cand="h"):
        c = {r["cls"] for r in self.ge["rows"] if (r["cand"], r["layer"], r["setting"], r["value"]) == (cand, layer, setting, value) and r["cls"] != "default"}
        self.assertEqual(len(c), 1, (layer, setting, value, c))
        return next(iter(c))

    def test_weekly_classes(self):
        self.assertEqual(self.cls_of("weekly", "kMult", 32.0), "edge-high")
        self.assertEqual(self.cls_of("weekly", "kMult", 0.5), "edge-low")
        self.assertEqual(self.cls_of("weekly", "kMult", 8.0), "interior")
        self.assertEqual(self.cls_of("weekly", "rho", 1.0), "limit-high")
        self.assertEqual(self.cls_of("weekly", "rho", 0.6), "edge-low")
        self.assertEqual(self.cls_of("weekly", "alpha", "off"), "limit-high")
        self.assertEqual(self.cls_of("weekly", "alpha", 1.0), "edge-low")
        self.assertEqual(self.cls_of("weekly", "alpha", 1000.0), "interior")
        self.assertEqual(self.cls_of("weekly", "phi", 0.95), "interior")

    def test_season_classes(self):
        self.assertEqual(self.cls_of("season", "alpha", 1000), "edge-high")
        self.assertEqual(self.cls_of("season", "kmult", 0), "limit-low")
        self.assertEqual(self.cls_of("season", "kmult", 10), "edge-high")
        self.assertEqual(self.cls_of("season", "delta", 1.0), "limit-high")
        self.assertEqual(self.cls_of("season", "delta", 0.5), "edge-low")
        self.assertEqual(self.cls_of("season", "lam", 0.35), "edge-high")
        self.assertEqual(self.cls_of("season", "lam", 0.2, "g"), "two-point")
        self.assertEqual(self.cls_of("season", "g", "g3", "g"), "n/a")
        self.assertEqual(self.cls_of("season", "era", "E1", "g"), "n/a")

    def test_the_default_alpha_is_not_a_fitted_choice(self):
        s = next(x for x in self.ge["shares"] if (x["cand"], x["layer"], x["setting"], x["pos"]) == ("h", "weekly", "alpha", "RB"))
        self.assertEqual((s["cells"], s["defaultCells"]), (15, 3))
        self.assertTrue(all(r["cls"] == "default" for r in self.ge["rows"] if r["setting"] == "alpha" and r["T"] == 2019 and r["layer"] == "weekly"))

    def test_the_four_of_six_list_holds_exactly_the_planted_target(self):
        got = self.ge["atEdgeInAtLeast4Folds"]
        self.assertEqual([(x["cand"], x["layer"], x["setting"], x["pos"], x["target"], x["folds"]) for x in got], [("h", "weekly", "kMult", "RB", "rush_att", 6)])


# ── T-C-4 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestSurfaces(unittest.TestCase):
    """T-C-4. Fails if the drop reads the wrong axis or column, or R-S ignores a threshold."""

    def setUp(self):
        rng = np.random.RandomState(5)
        S = 100.0 + rng.uniform(0, 50, (11, 5))
        S[10, 2] = S.min() - 1.0                                                   # the chosen cell is the grid minimum
        self.S = S
        self.row_wise = (S[10, 3] - S[10, 2]) / S[10, 2]
        self.col_wise = (S[9, 2] - S[10, 2]) / S[10, 2]
        self.assertNotAlmostEqual(self.row_wise, self.col_wise, 6, "Fact: the hand matrix's row-wise and column-wise last-step drops differ")
        self.spec = {"kMultW": swm._DEFAULT["H"]["kMultW"], "rhos": swm._DEFAULT["H"]["rhos"]}
        self.sspec = {"h": spec_mod.default_spec("H"), "g": spec_mod.default_spec("G")}

    def fits(self, targets):
        return {("h", 2021): SimpleNamespace(pos={"RB": SimpleNamespace(targets=targets)})}

    def test_the_k_high_drop_reads_the_neighbouring_k_row_at_the_chosen_rho(self):
        info = _info(32, 0.85, 2, 100.0)
        info["gridSse"] = self.S.tolist()
        out = A.weekly_surface(self.fits({"t": info}), self.spec)["rows"]
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["axis"], out[0]["end"]), ("kMult", "high"))
        self.assertAlmostEqual(out[0]["drop"], self.col_wise, 12)

    def test_the_rho_low_edge_reads_the_next_rho_column_at_the_chosen_k(self):
        info = _info(8, 0.6, 0, 100.0)
        S = self.S.copy()
        S[6, 0] = S.min() - 1.0
        info["gridSse"] = S.tolist()
        out = A.weekly_surface(self.fits({"t": info}), self.spec)["rows"]
        self.assertEqual([(r["axis"], r["end"]) for r in out], [("rho", "low")])
        self.assertAlmostEqual(out[0]["drop"], (S[6, 1] - S[6, 0]) / S[6, 0], 12)

    def test_an_interior_choice_and_a_rho_limit_give_no_row(self):
        info = _info(8, 1.0, 4, 100.0)
        info["gridSse"] = self.S.tolist()
        self.assertEqual(A.weekly_surface(self.fits({"t": info}), self.spec)["rows"], [])

    def season_art(self, drops, g_pair=False):
        """Six folds of H innerMae (grid: E1 lam 0..0.35 then E0 lam 0..0.35): fold i chooses (E0, 0.35) with the stated drop when drops[i] is not None, else (E0, 0.2)."""
        chosen = {}
        for i, T in enumerate(HFOLDS):
            inner = [50.0] * 8
            if drops[i] is None:
                ent, inner[6] = {"era": "E0", "lam": 0.2}, 49.0
            else:
                ent, inner[7], inner[6] = {"era": "E0", "lam": 0.35}, 50.0, 50.0 * (1 + drops[i])
            chosen[str(T)] = {"entry": ent, "innerMae": inner, "params": {}}
        return {"results": {"RB": {"h": {"chosen": chosen}}}}

    def rs(self, drops):
        rows = A.season_surface(self.season_art(drops), self.sspec, HFOLDS, cands=("h",), positions=("RB",))
        return A.season_rs(rows)[0], rows

    def test_rs_needs_four_folds_and_a_mean_of_half_a_percent(self):
        r, rows = self.rs([0.004, 0.006, 0.007, 0.007, None, None])
        self.assertTrue(r["holds"], r)
        self.assertAlmostEqual(r["meanDrop"], 0.006, 12)
        self.assertEqual(A.rs_stop_lines([r]), ["STOP for Anton before LP-2b-2 is planned: the season λ surface is still falling at the edge (RB, H)"])
        r3, _ = self.rs([0.02, 0.02, 0.02, None, None, None])
        self.assertFalse(r3["holds"], "three folds are not enough")
        self.assertEqual(A.rs_stop_lines([r3]), [])
        r4, _ = self.rs([0.003, 0.004, 0.004, 0.005, None, None])
        self.assertFalse(r4["holds"], "a mean of 0.4% is below the 0.5% threshold")

    def test_the_g_lambda_drop_reads_the_chosen_era_and_g(self):
        grid = self.sspec["g"]["grid"]
        inner = [1000.0 + i for i in range(16)]                                      # decoy values everywhere
        i_edge = grid.index({"era": "E1", "g": "g3", "lam": 0.2})
        i_low = grid.index({"era": "E1", "g": "g3", "lam": 0.0})
        inner[i_edge], inner[i_low] = 98.0, 100.0
        art = {"results": {"RB": {"g": {"chosen": {str(T): {"entry": {"era": "E1", "g": "g3", "lam": 0.2}, "innerMae": inner, "params": {}} for T in HFOLDS}}}}}
        rows = A.season_surface(art, self.sspec, HFOLDS, cands=("g",), positions=("RB",))
        self.assertAlmostEqual(rows[0]["drop"], (100.0 - 98.0) / 98.0, 12)


# ── fixtures for T-C-5 / T-C-6 ───────────────────────────────────────────────────────────────────────────────
class _Fold:
    """ONE registered-path H fit on the synthetic frame (cross-fitted), the shared fixture of T-C-5 and T-C-6; the number of `xfit_groups` calls it made is recorded."""
    _C = {}

    @classmethod
    def get(cls):
        if not cls._C:
            W = swm.make_frame()
            spec = swm.small_spec_w("H")
            with mock.patch.object(registry, "require", _pass), mock.patch.object(wm, "xfit_groups", wraps=wm.xfit_groups) as m:
                preds, fits = wm.fold_w(W.frame, 2021, W.store, "H", spec, W.rel, W.hist)
            cls._C.update(W=W, spec=spec, preds=preds, fits=fits, xfit_calls=m.call_count, frame_T=W.frame[W.frame["S"] == 2021])
        return cls._C


def _cond(fits, W, frame_T):
    return wm.predict_w(fits, frame_T, W.hist, W.store)["cond"].to_numpy()


# ── T-C-5 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestKSweep(unittest.TestCase):
    """T-C-5. Fails if the sweep mutates the fits in place or touches more than k."""

    @classmethod
    def setUpClass(cls):
        cls.C = _Fold.get()

    def setUp(self):
        C = self.C
        base, two = _cond(C["fits"], C["W"], C["frame_T"]), _cond(A.scale_k(C["fits"], 2.0), C["W"], C["frame_T"])
        has_e = (C["frame_T"]["nP"].to_numpy() > 0)
        self.assertGreater(float(np.abs(base - two)[has_e].max()), 1e-6, "Fact: the s = 2 prediction differs from s = 1 on some row with E > 0")

    def ks(self, fits):
        return {(P, t): i["k"] for P, pf in fits.pos.items() for t, i in pf.targets.items()}

    def test_scale_one_reproduces_the_predictions_exactly(self):
        C = self.C
        self.assertTrue(np.array_equal(_cond(A.scale_k(C["fits"], 1.0), C["W"], C["frame_T"]), _cond(C["fits"], C["W"], C["frame_T"])))

    def test_scale_two_doubles_k_and_touches_nothing_else(self):
        C = self.C
        f, g = C["fits"], A.scale_k(C["fits"], 2.0)
        for P, pf in f.pos.items():
            self.assertEqual(g.pos[P].c_w, pf.c_w)
            self.assertEqual(g.pos[P].phi, pf.phi)
            self.assertEqual(g.pos[P].bounds, pf.bounds)
            for t, i in pf.targets.items():
                j = g.pos[P].targets[t]
                self.assertEqual(j["k"], 2.0 * i["k"])
                self.assertEqual(j["rho"], i["rho"])
                self.assertEqual(j["alpha"], i["alpha"])
                self.assertEqual(j["cohort"] is None, i["cohort"] is None)
                if i["cohort"] is not None:
                    X = C["frame_T"][pf.design["ctx"]].to_numpy(float)
                    self.assertTrue(np.array_equal(j["cohort"].predict(X), i["cohort"].predict(X)))

    def test_two_sweeps_leave_the_original_unchanged_and_do_not_compound(self):
        C = self.C
        before = self.ks(C["fits"])
        A.scale_k(C["fits"], 2.0)
        s4 = A.scale_k(C["fits"], 4.0)
        self.assertEqual(self.ks(C["fits"]), before)
        self.assertEqual(self.ks(s4), {key: 4.0 * v for key, v in before.items()})

    def test_the_cohort_count_matches_the_planted_targets(self):
        C = self.C
        f = copy.deepcopy(C["fits"])
        donor = next(i["cohort"] for pf in f.pos.values() for i in pf.targets.values() if i["cohort"] is not None) if any(
            i["cohort"] is not None for pf in f.pos.values() for i in pf.targets.values()) else object()
        planted = {"QB": 0, "RB": 2, "WR": 1, "TE": 0}
        for P, pf in f.pos.items():
            for n, info in enumerate(pf.targets.values()):
                info["cohort"] = donor if n < planted[P] else None
        self.assertEqual(A.cohort_counts(f), planted)


# ── T-C-6 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestRefits(unittest.TestCase):
    """T-C-6. Fails if an arm cross-fits, edits the stamped spec, or the reproduction is not exact."""

    @classmethod
    def setUpClass(cls):
        cls.C = _Fold.get()

    def setUp(self):
        C = self.C
        self.assertTrue(any(abs(pf.c_w - 1.0) > 1e-3 for pf in C["fits"].pos.values()), "Fact: the registered c_w differs from 1 by more than 1e-3 at some position")
        self.assertGreater(C["xfit_calls"], 0, "Fact: the registered path cross-fits")

    def refit(self, spec=None, extra=None):
        C = self.C
        with mock.patch.object(registry, "require", _pass), mock.patch.object(wm, "xfit_groups", wraps=wm.xfit_groups) as m:
            out = A.refit(C["W"].frame, 2021, C["W"].store, spec or C["spec"], C["W"].rel, C["W"].hist, C["fits"], extra=extra)
        return out, m.call_count

    def test_widened_spec_changes_only_kmultw_and_leaves_its_input_alone(self):
        spec = self.C["spec"]
        before = copy.deepcopy(spec)
        sb = A.widened_spec(spec)
        self.assertEqual(spec, before)
        self.assertEqual(sb["kMultW"], spec["kMultW"] + [48, 64, 96, 128])
        self.assertEqual({k: v for k, v in sb.items() if k != "kMultW"}, {k: v for k, v in spec.items() if k != "kMultW"})
        self.assertNotEqual(registry.spec_sha(sb), registry.spec_sha(spec))

    def test_the_fixed_calib_refit_makes_no_cross_fit_and_reproduces_the_registered_fit_exactly(self):
        C = self.C
        (preds, fits), calls = self.refit()
        self.assertEqual(calls, 0)
        self.assertTrue(np.array_equal(preds["cond"].to_numpy(), C["preds"]["cond"].to_numpy()))
        for P, pf in C["fits"].pos.items():
            self.assertEqual((fits.pos[P].c_w, fits.pos[P].phi), (pf.c_w, pf.phi))
            for t, i in pf.targets.items():
                j = fits.pos[P].targets[t]
                self.assertEqual((j["kMult"], j["rho"], j["alpha"]), (i["kMult"], i["rho"], i["alpha"]))

    def test_the_widened_refit_records_the_widened_spec(self):
        sb = A.widened_spec(self.C["spec"])
        (_, fits), calls = self.refit(spec=sb)
        self.assertEqual(calls, 0)
        self.assertEqual(fits.specSha256, registry.spec_sha(sb))
        self.assertTrue(all(i["kMult"] in sb["kMultW"] for pf in fits.pos.values() for i in pf.targets.values()))

    def test_no_context_gives_no_cohort_anywhere(self):
        (_, fits), calls = self.refit(extra={"hContext": False})
        self.assertEqual(calls, 0)
        self.assertEqual(A.cohort_counts(fits), {P: 0 for P in fits.pos})
        self.assertTrue(all(i["alpha"] is None for pf in fits.pos.values() for i in pf.targets.values()))


# ── T-C-7 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestOverrideSpeeds(unittest.TestCase):
    """T-C-7. Fails if start-chain rows count, the scales are mixed, or the slope is not through the origin."""

    def setUp(self):
        rng = np.random.RandomState(8)
        n_rows = 40
        self.c_w = 0.9
        ppg0 = rng.uniform(5, 15, n_rows)
        x = ppg0 + rng.choice([-1.0, 1.0], n_rows) * rng.uniform(1.5, 8.0, n_rows)                 # every row has |x - ppg0| >= 1.5
        m = x * self.c_w
        ppg = ppg0 + 0.4 * (x - ppg0)
        self.rows = pd.DataFrame({"pid": ["p%d" % i for i in range(n_rows)], "position": "RB", "n": 3, "sum_pts": m * 3, "c_w": self.c_w, "ppg0": ppg0, "ppg": ppg})
        near = self.rows.iloc[:5].copy()                                                     # rows with |x - ppg0| < 1: far-off ppg, must be excluded
        near["ppg0"], near["sum_pts"], near["ppg"] = 10.0, 3 * self.c_w * 10.5, 99.0
        near["pid"] = ["n%d" % i for i in range(5)]
        self.rows = pd.concat([self.rows, near], ignore_index=True)
        d = (self.rows["sum_pts"] / self.rows["n"]) - self.rows["ppg0"]
        d = d[(self.rows["sum_pts"] / self.rows["n"] / self.c_w - self.rows["ppg0"]).abs() >= 1]
        unscaled = float(((self.rows.loc[d.index, "ppg"] - self.rows.loc[d.index, "ppg0"]) * d).sum() / (d ** 2).sum())
        self.assertGreater(abs(unscaled - 0.4), 1e-3, "Fact: c_w is not 1, so the unscaled slope differs from 0.4")
        qb_plain = [(2, 2.5, None), (3, 3.0, "original"), (4, 3.0, "none"), (5, 2.0, None), (6, 2.5, "original")]
        qb_chain = [(1, 0.5, "backup"), (2, 0.4, "starter"), (3, 0.3, "preseason")]
        rows = [dict(nB=n, kB=k, kind=kind, population="standard", liveChain=False) for n, k, kind in qb_plain + qb_chain]
        self.qb = pd.DataFrame(rows)
        self.plain_median = float(np.median([n / (n + k) for n, k, _ in qb_plain]))
        self.assertGreater(abs(float(np.median(self.qb["nB"] / (self.qb["nB"] + self.qb["kB"]))) - self.plain_median), 1e-3,
                           "Fact: a QB backup row with liveChain False has n/(n + k) far from the others, so the median moves")

    def test_the_slope_through_the_origin_on_the_calibrated_scale(self):
        cell = A.lambda_cells(self.rows, "ppg", "ppg0")[("RB", 3)]
        self.assertAlmostEqual(cell["lambda"], 0.4, 12)
        self.assertEqual(cell["rows"], 40)
        self.assertEqual(cell["players"], 40)
        self.assertEqual(cell["status"], "ok")

    def test_a_cell_under_thirty_rows_is_insufficient(self):
        r = self.rows.copy()
        r["n"] = np.where(np.arange(len(r)) < 10, 4, 3)
        cell = A.lambda_cells(r, "ppg", "ppg0")[("RB", 4)]
        self.assertEqual((cell["status"], cell["lambda"]), ("INSUFFICIENT", None))

    def test_b1_weight_is_the_median_over_plain_rows_and_matches_hand_values(self):
        for n, k in ((1, 2.5), (4, 3.0), (8, 1.5)):
            one = pd.DataFrame([dict(nB=n, kB=k, kind=None, population="standard")])
            self.assertAlmostEqual(A.b1_weight(one)["lambda"], n / (n + k), 12)
        w = A.b1_weight(self.qb)
        self.assertAlmostEqual(w["lambda"], self.plain_median, 12)
        self.assertEqual(w["rows"], 5)
        self.assertAlmostEqual(w["excludedShare"], 3 / 8, 12)

    def test_the_origin_is_an_array_of_zeros_in_frame_row_order(self):
        C = _Fold.get()
        W, fits = C["W"], C["fits"]
        fr = C["frame_T"].iloc[::-1]
        with mock.patch.object(wm, "predict_w", wraps=wm.predict_w) as m:
            out = A.origin0_ppg(fits, fr, W.hist, W.store)
        o = m.call_args.kwargs["origin"]
        self.assertIsInstance(o, np.ndarray)
        self.assertEqual((len(o), int(np.abs(o).sum())), (len(fr), 0))
        self.assertEqual(list(out["pid"]), list(fr["pid"]))
        with self.assertRaises(Exception):
            wm.predict_w(fits, fr, W.hist, W.store, origin=0)
        w1 = fr["w"].to_numpy() == 1
        base = wm.predict_w(fits, fr, W.hist, W.store)
        self.assertTrue(np.allclose(out["ppg0"].to_numpy()[w1], base["ppg"].to_numpy()[w1]), "at w = 1 the origin is already 0")

    def test_target_classes_follow_the_season_spec(self):
        tg = spec_mod.targets_spec()
        self.assertEqual(A.target_class("RB", "rush_att", tg), "volume")
        self.assertEqual(A.target_class("RB", "rush_yd", tg), "efficiency")
        self.assertEqual(A.target_class("RB", "kr_yd", tg), "other")


# ── the runner on the e2e world ──────────────────────────────────────────────────────────────────────────────
_RUN = {}


def _planted(sspec, folds):
    """A 2a-shaped artifact for the e2e folds with planted values: per (P, cand, T) the chosen entry, an innerMae list in grid order and, for H, params for every target."""
    res = {}
    for P in ("QB", "RB", "WR", "TE"):
        res[P] = {}
        for cand in ("h", "g"):
            sp = sspec[cand]
            grid = sp["grid"]
            chosen = {}
            for i, T in enumerate(folds):
                idx = (i + len(P)) % len(grid)
                inner = [50.0 - 0.1 * j for j in range(len(grid))]
                ch = {"entry": grid[idx], "index": idx, "innerMae": inner, "c": 1.0, "cRows": 10, "fallback": [], "seconds": 1.0, "params": {}}
                if cand == "h":
                    ch["params"] = {t["name"]: {"alpha": sp["alphas"][(i + j) % 4], "kmult": sp["kMult"][(i * 3 + j) % len(sp["kMult"])], "delta": sp["deltas"][(i + 2 * j) % 5]}
                                    for j, t in enumerate(sp["targets"][P])}
                chosen[str(T)] = ch
            res[P][cand] = {"chosen": chosen}
    return {"results": res}


def _fixture():
    if "fx" in _RUN:
        return _RUN["fx"]
    c, dev = e2e_w.build(), e2e_w.dev_run()
    assert dev["rc"] == 0
    root = tempfile.mkdtemp()
    base = e2e_w.make_base()
    full = {n: spec_mod.default_spec(n) for n in ("H", "G")}
    for n in ("H", "G"):                                                    # the season layer of the tmp candidates holds the full default grid (the e2e one is cut to one entry)
        p = registry.cand_path(registry.Env(base=base, repo=base), n)
        with open(p) as f:
            obj = json.load(f)
        obj["layers"]["season"]["spec"]["grid"] = full[n]["grid"]
        with open(p, "w") as f:
            f.write(json.dumps(obj, indent=1, sort_keys=True) + "\n")
    folds = tuple(T for T in (2019, 2020, 2021))
    art_2a = os.path.join(root, "art2a.json")
    with open(art_2a, "w") as f:
        json.dump(_planted({"h": full["H"], "g": full["G"]}, folds), f)
    cons = os.path.join(root, "constants.json")
    with open(cons, "w") as f:
        json.dump({"constants": {"K_ROS_POINTS": {P: {"k": 2.5} for P in ("QB", "RB", "WR", "TE")}, "K_ROS_OPP": {P: {"k": 1.5} for P in ("QB", "RB", "WR", "TE")}}}, f)
    out = dev["out"]
    art = [p for p in os.listdir(out) if p.endswith("learned-s2b1b-dev-panel.json")][0]
    bw = c["benchw"].copy()
    bw["n"] = np.clip(bw["w"] - 1, 0, None)
    bw["k"] = 2.5
    bw["kind"] = [("backup" if i % 7 == 0 else None) for i in range(len(bw))]
    bw["population"] = "standard"
    fx = {"base": base, "root": root, "folds": folds, "paths": dict(preds=os.path.join(out, "weekly-preds.jsonl"), fits=os.path.join(out, "weekly-fits.pkl"), art_2b1b=os.path.join(out, art), art_2a=art_2a, constants=cons),
          "benchw": bw, "dev": dev, "c": c}
    _RUN["fx"] = fx
    return fx


def runner_deps(paths=None, **over):
    fx = _fixture()
    p = {**fx["paths"], **(paths or {})}
    rd = e2e_w.deps_for(fx["base"])
    out = tempfile.mkdtemp()
    kw = dict(anchor=ss.ANCHOR, load_meta=rd.load_meta, load_benchw_meta=rd.load_benchw_meta, load_cache=rd.load_cache, load_teamctx=rd.load_teamctx, load_extras=rd.load_extras,
              load_benchw=lambda: (fx["benchw"].copy(), {}), inputs_path=rd.inputs_path, inputs_sha=rd.inputs_sha, prior_path=rd.prior_path, prior_sha=rd.prior_sha,
              preds_path=p["preds"], preds_sha=_sha(fx["paths"]["preds"]), fits_path=p["fits"], fits_sha=_sha(fx["paths"]["fits"]), benchw_path=rd.benchw_path, benchw_sha=_sha(rd.benchw_path),
              art_2b1b_path=p["art_2b1b"], art_2b1b_sha=_sha(fx["paths"]["art_2b1b"]), art_2a_path=p["art_2a"], art_2a_sha=_sha(fx["paths"]["art_2a"]),
              constants_path=p["constants"], constants_sha=_sha(fx["paths"]["constants"]), env=rd.env, env_w=rd.env_w, out_dir=out, verdict_dir=out)
    kw.update(over)
    d = rwa.Deps(**kw)
    d.out = out
    return d


class _Recorder:
    def __init__(self):
        self.guard, self.paired, self.predict = [], [], []

    def patches(self):
        g, pa, pr = wd.guard, A.paired, wm.predict_w

        def guard(S, confirm=False):
            self.guard.append(int(S))
            return g(S, confirm)

        def paired(wk, *a, **k):
            self.paired.append(int(wk["S"].max()))
            return pa(wk, *a, **k)

        def predict(fits, frame_pr, *a, **k):
            self.predict.append(int(frame_pr["S"].max()))
            return pr(fits, frame_pr, *a, **k)
        return [mock.patch.object(wd, "guard", guard), mock.patch.object(A, "paired", paired), mock.patch.object(wm, "predict_w", predict)]


def _snapshot(*roots):
    out = {}
    for root in roots:
        for dp, _, fs in os.walk(root):
            for f in fs:
                p = os.path.join(dp, f)
                st = os.stat(p)
                out[p] = (st.st_size, st.st_mtime_ns, _sha(p))
    return out


def run_once():
    """ONE successful runner run on the e2e world (LAST_SEASON = L, `registry.require` patched, the leak limit raised: the stand-in benchw is random), shared by T-C-8 and T-C-9."""
    if "run" in _RUN:
        return _RUN["run"]
    fx = _fixture()
    deps = runner_deps()
    rec = _Recorder()
    real_cands = os.path.join(HERE, "candidates")
    real_models = os.path.join(HERE, ".cache", "models")
    before = _snapshot(fx["base"], *[p for p in (real_cands, real_models) if os.path.isdir(p)])
    reg_files = sorted(set(registry.SEASON_CODE + registry.season_code("H") + registry.season_code("G") + registry.SEASON_HARNESS + registry_w.WEEKLY_CODE("H") + registry_w.WEEKLY_CODE("G")
                           + registry_w.WEEKLY_HARNESS))
    reg_before = {p: _sha(os.path.join(HERE, p)) for p in reg_files if os.path.exists(os.path.join(HERE, p))}      # SEASON_CODE's `lp/MODEL.py` is a template, not a file
    err = io.StringIO()
    patches = [mock.patch.object(registry, "require", e2e_w.fake_require), mock.patch.object(wd, "LAST_SEASON", e2e_w.L), mock.patch.object(A, "LEAK_GAIN", 10.0)] + rec.patches()
    for p in patches:
        p.start()
    try:
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()) as so:
            rc = rwa.main(["--write", "--date", "2026-01-02", "--resamples", "60"], deps=deps)
    finally:
        for p in reversed(patches):
            p.stop()
    after = _snapshot(fx["base"], *[p for p in (real_cands, real_models) if os.path.isdir(p)])
    reg_after = {p: _sha(os.path.join(HERE, p)) for p in reg_files if os.path.exists(os.path.join(HERE, p))}
    _RUN["run"] = dict(rc=rc, deps=deps, rec=rec, err=err.getvalue(), stdout=so.getvalue(), before=before, after=after, reg_before=reg_before, reg_after=reg_after, reg_files=reg_files)
    return _RUN["run"]


# ── T-C-8 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestAnchorsAndHeldSeason(unittest.TestCase):
    """T-C-8. Fails if a cache is read unverified or a held row reaches a frame."""

    def setUp(self):
        self.fx = _fixture()
        self.assertEqual(int(self.fx["c"]["benchw"]["S"].max()), e2e_w.L + 1, "Fact: benchw holds S = L + 1 rows")

    def call(self, deps, **patch):
        err = io.StringIO()
        ps = [mock.patch.object(registry, "require", patch.get("require", e2e_w.fake_require)), mock.patch.object(wd, "LAST_SEASON", e2e_w.L)]
        for p in ps:
            p.start()
        try:
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                rc = rwa.main(["--resamples", "60"], deps=deps)
        finally:
            for p in reversed(ps):
                p.stop()
        return rc, err.getvalue()

    def test_a_changed_byte_in_any_input_returns_2_before_any_cache_is_read(self):
        names = {"inputs": "inputs_path", "prior": "prior_path", "preds": "preds_path", "fits": "fits_path", "benchw": "benchw_path", "art_2b1b": "art_2b1b_path", "art_2a": "art_2a_path", "constants": "constants_path"}
        base = runner_deps()
        for key, attr in names.items():
            src = getattr(base, attr)
            tmp = os.path.join(tempfile.mkdtemp(), os.path.basename(src))
            shutil.copy(src, tmp)
            with open(tmp, "r+b") as f:
                b = f.read(1)
                f.seek(0)
                f.write(bytes([b[0] ^ 1]))
            self.assertNotEqual(_sha(tmp), _sha(src), "Fact: the changed copy's SHA differs from the constant")
            d = runner_deps()
            setattr(d, attr, tmp)
            boom = mock.Mock(side_effect=AssertionError("read before the SHA check"))
            with mock.patch.object(pd, "read_pickle", boom), mock.patch.object(pickle, "load", boom), mock.patch.object(rwa, "_read_preds", boom), mock.patch.object(rwa, "_read_json", boom):
                rc, err = self.call(d)
            self.assertEqual(rc, 2, key)
            self.assertIn("differs from its anchor", err, key)
            boom.assert_not_called()

    def test_a_held_season_row_in_the_preds_stops_at_the_trim_check_not_the_anchor(self):
        src = self.fx["paths"]["preds"]
        tmp = os.path.join(tempfile.mkdtemp(), "weekly-preds.jsonl")
        with open(src) as f:
            lines = [l for l in f if l.strip()]
        row = json.loads(lines[0])
        row["S"], row["T"] = e2e_w.L + 1, e2e_w.L + 1
        with open(tmp, "w") as f:
            f.writelines(lines)
            f.write(json.dumps(row) + "\n")
        d = runner_deps(paths={"preds": tmp}, preds_sha=_sha(tmp))
        rc, err = self.call(d)
        self.assertEqual(rc, 2)
        self.assertIn("trim check", err)
        self.assertNotIn("differs from its anchor", err)

    def test_a_require_failure_returns_2(self):
        def boom(*a, **k):
            raise registry.NotRegistered("planted")
        rc, err = self.call(runner_deps(), require=boom)
        self.assertEqual(rc, 2)
        self.assertIn("planted", err)

    def test_every_guard_call_and_every_frame_stays_at_or_below_last_season(self):
        r = run_once()
        self.assertEqual(r["rc"], 0, r["err"])
        rec = r["rec"]
        self.assertTrue(rec.guard and rec.paired and rec.predict)
        self.assertLessEqual(max(rec.guard), e2e_w.L)
        self.assertLessEqual(max(rec.paired), e2e_w.L)
        self.assertLessEqual(max(rec.predict), e2e_w.L)


# ── T-C-9 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _keys(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield k
            yield from _keys(v)
    elif isinstance(o, list):
        for v in o:
            yield from _keys(v)


class TestReportOnlyAndIsolation(unittest.TestCase):
    """T-C-9. Fails if a label leaks or a registered path is written."""

    @classmethod
    def setUpClass(cls):
        cls.r = run_once()
        d = cls.r["deps"].out
        cls.files = sorted(os.listdir(d))
        cls.art_path = os.path.join(d, "2026-01-02-learned-s2b1c1-analysis.json")
        cls.rep_path = os.path.join(d, "2026-01-02-learned-s2b1c1-report.md")

    def setUp(self):
        self.assertEqual(self.r["rc"], 0, self.r["err"])
        with open(self.art_path) as f:
            self.art = json.load(f)
        with open(self.rep_path, encoding="utf-8") as f:
            self.rep = f.read()
        hits = []
        for name, a in self.art["arms"].items():
            for k in ("vsH", "vsB1c", "vsSTD"):
                for P, x in a[k].items():
                    rk = x["dSpearman"]["ci"]
                    hits.append(M.label(x["d"]["value"], x["d"]["ci"], x["bMae"]["value"], None if None in rk else rk))
        self.assertIn("beats", hits, "Fact: the fixture arm's numbers give M.label = 'beats', so a leaked label would show")

    def test_no_label_key_and_no_verdict_words_outside_the_permitted_quotes(self):
        self.assertNotIn("label", set(_keys(self.art)))
        txt = self.rep.replace(report_s2b1c.RULING_31, "")
        for blob in (txt, json.dumps(self.art)):
            kept = [l for l in blob.split("\n") if "FINDING for Anton" not in l]
            kept = [re.sub(r"FINDING for Anton[^\"]*", "", l) for l in kept]
            self.assertIsNone(re.search(r"\b(beats|loses)\b", "\n".join(kept), re.I))

    def test_the_ruling_constant_is_the_task_files_text(self):
        with open(TASK, encoding="utf-8") as f:
            self.assertIn(report_s2b1c.RULING_31, f.read())

    def test_every_arm_and_band_is_exploratory_with_a_spec_hash(self):
        self.assertTrue(self.art["arms"])
        for name, a in self.art["arms"].items():
            self.assertIs(a["exploratory"], True, name)
            self.assertRegex(a["specSha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(a["armSha256"], r"^[0-9a-f]{64}$")
        for band in A.BANDS:
            self.assertIs(self.art["bands"][band]["exploratory"], True)
            self.assertTrue(self.art["bands"][band]["specSha256"]["h"])
        self.assertIn(A.EXPLORATORY, self.rep)

    def test_the_run_writes_only_its_two_outputs_and_touches_no_registered_path(self):
        self.assertEqual(self.files, ["2026-01-02-learned-s2b1c1-analysis.json", "2026-01-02-learned-s2b1c1-report.md"])
        self.assertEqual(self.r["before"], self.r["after"], "candidates/, .cache/models/ and the tmp base are byte-identical, mtimes included")
        self.assertEqual(self.r["reg_before"], self.r["reg_after"])
        new = {"lp/analysis_w.py", "lp/report_s2b1c.py", "run_weekly_analysis.py"}
        self.assertFalse(new & set(self.r["reg_files"]), "the new modules are in no registered path list")

    def test_the_report_holds_no_commit_id(self):
        try:
            head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
        except OSError:
            self.skipTest("git unavailable")
        if head:
            self.assertNotIn(head, self.rep)
            self.assertNotIn(head, json.dumps(self.art))

    def test_leak_check_flags_a_pooled_gain_above_twelve_percent(self):
        t = {"a": {"RB": {"pct": 0.13}, "WR": {"pct": 0.12}, "QB": {"pct": None}}}
        self.assertEqual(A.leak_check(t, 0.12), [("a", "RB", 0.13)])


# ── T-C-10 ──────────────────────────────────────────────────────────────────────────────────────────────────
class TestPins(unittest.TestCase):
    """T-C-10. Fails if numpy is imported before `run_weekly_models`."""

    def test_importing_the_runner_pins_the_threads_before_numpy(self):
        code = ("import json, os, sys\nsys.path.insert(0, %r)\n"
                "pre = {v: os.environ.get(v) for v in ('OMP_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS')}\n"
                "np_pre = 'numpy' in sys.modules\nimport run_weekly_analysis as r\nimport numpy\n"
                "from threadpoolctl import threadpool_info\n"
                "print(json.dumps({'pre': pre, 'numpyPre': np_pre, 'post': {v: os.environ.get(v) for v in pre}, 'info': [x['num_threads'] for x in threadpool_info()], 'threads': r._threads()}))\n" % HERE)
        env = {k: v for k, v in os.environ.items() if k not in ("OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "PYTHONHASHSEED")}
        out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=HERE)
        self.assertEqual(out.returncode, 0, out.stderr)
        o = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertEqual(set(o["pre"].values()), {None}, "Fact: the subprocess starts with the variables unset")
        self.assertFalse(o["numpyPre"])
        self.assertEqual(set(o["post"].values()), {"1"})
        self.assertFalse(o["threads"]["numpyPreloaded"])
        self.assertTrue(o["info"] and all(n == 1 for n in o["info"]), o["info"])

    def test_the_hash_seed_re_exec(self):
        calls = []
        fake = lambda exe, argv: calls.append((exe, list(argv)))
        with mock.patch.dict(os.environ):
            os.environ.pop("PYTHONHASHSEED", None)
            rwa._ensure_seed(fake)
            self.assertEqual(calls, [(sys.executable, [sys.executable] + sys.argv)])
            self.assertEqual(os.environ["PYTHONHASHSEED"], "0")
            rwa._ensure_seed(fake)
            self.assertEqual(len(calls), 1, "with the seed already 0 the fake is not called again")

    def test_threads_is_the_run_weekly_models_record(self):
        self.assertEqual(rwa._threads(), rwm._threads())


if __name__ == "__main__":
    unittest.main()
