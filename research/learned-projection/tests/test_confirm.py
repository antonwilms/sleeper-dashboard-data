"""LP-2b-2a tests: T-R-1 (boundary), T-R-2 (held_inputs copy), T-R-3 (rehearsal reproduces the dev fold), T-R-4 (no row past the held season), T-R-5 (synthetic stand-in
end to end), T-R-6 (held-fold evaluation wiring), T-R-7 (runner order, refusals, writes), T-R-8 (pins and `_threads`), T-R-9 (`parity` and `merge_preds` copies).
Every Fact is asserted in setUp / setUpClass. Nothing here reads a real cache, a real candidate file or the real run-log."""
import contextlib
import glob
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
import pandas as pd

import run_confirm as rc
import run_weekly_models as rwm
from lp import baselines, confirm, evaluate, evaluate_w, registry, season_models as sm, season_prior, spec_wm, weekly_data as wd, weekly_models
from tests import e2e_c
from tests.e2e_c import L0

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGV = ["--rehearse", "--write", "--date", "2026-02-02", "--resamples", "60"]


def _run(argv, deps, patches=()):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        r = e2e_c.run_rehearse(argv, deps, patches)
    return r, out.getvalue(), err.getvalue()


def _artifact(deps):
    files = glob.glob(os.path.join(deps.out_dir, "*.json"))
    assert len(files) == 1, files
    with open(files[0]) as f:
        return json.load(f)


_CLEAN = {}


def clean_run():
    """ONE clean `--rehearse --write` on a fresh base, shared by T-R-3 and T-R-6; the clean run's own predictions are kept (a spy on `compare_preds`), and so are the
    R4c re-fit's (a spy on `compare_cached_refit`)."""
    if _CLEAN:
        return _CLEAN
    seen = {}
    orig = confirm.compare_preds
    orig_c = confirm.compare_cached_refit

    def spy(ck, preds, preds_file, held):
        seen["preds"] = {n: p.copy() for n, p in preds.items()}
        return orig(ck, preds, preds_file, held)

    def spy_c(ck, preds, preds_file, held):
        seen["refit"] = preds.copy()
        return orig_c(ck, preds, preds_file, held)
    d = e2e_c.rehearse_deps()
    rcode, out, err = _run(ARGV, d, patches=(mock.patch.object(confirm, "compare_preds", spy), mock.patch.object(confirm, "compare_cached_refit", spy_c)))
    _CLEAN.update(rc=rcode, out=out, err=err, deps=d, preds=seen.get("preds"), refit=seen.get("refit"), art=_artifact(d) if rcode == 0 else None)
    return _CLEAN


_REPORT_ONLY = {("R4", "g"), ("R6", "g"), ("R7", "g")}


def _assert_report_only_marks(tc, out):
    """Every per-check maxima line ends ' (report-only)' exactly for the slots `lp/confirm` records without failing (R4 g, R6 g, R7 g); at least one of each kind is present."""
    lines = [ln for ln in out.splitlines() if re.match(r"\[run\] R\d+c? [gh]: max relative ", ln)]
    seen = set()
    for ln in lines:
        m = re.match(r"\[run\] (R\d+c?) ([gh]): ", ln)
        seen.add((m.group(1), m.group(2)))
        tc.assertEqual(ln.endswith(" (report-only)"), (m.group(1), m.group(2)) in _REPORT_ONLY, ln)
    tc.assertTrue(_REPORT_ONLY <= seen and ("R4c", "g") in seen and ("R4", "h") in seen, seen)


def _read_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def _measure(a, b):
    """The rehearsal check's own measure: |a - b| / (1 + |b|) (`season_prior.py:139-140`)."""
    return abs(a - b) / (1.0 + abs(b))


def _solve(a, b0, m):
    """b' with |a - b'| / (1 + |b'|) = m, in the direction of the existing gap b0 - a (bisection on the distance)."""
    sgn = 1.0 if b0 >= a else -1.0
    lo, hi = 0.0, 1e6
    for _ in range(200):
        mid = (lo + hi) / 2
        if _measure(a, a + sgn * mid) < m:
            lo = mid
        else:
            hi = mid
    return a + sgn * hi


def _perturbed_preds(cand, pos, col, m):
    """A copy of the stand-in `weekly-preds.jsonl` with ONE `cand` row's `col` moved so the check's own measure against the clean run's value is `m`. The
    reference value is the one the check that fails reads: H's end-to-end prediction (R4), G's cached re-fit prediction (R4c)."""
    c = e2e_c.build()
    clean = clean_run()
    p = clean["refit"] if cand == "g" else clean["preds"][cand.upper()]
    row = p[p["position"] == pos].iloc[0]
    a = float(row[col])
    rows = _read_jsonl(c["preds"])
    hit = [r for r in rows if r["cand"] == cand and r["T"] == L0 and r["pid"] == row["pid"] and r["S"] == int(row["S"]) and r["w"] == int(row["w"])]
    assert len(hit) == 1
    if cand == "g":                                                           # Fact: on this synthetic fixture the re-fit and the end-to-end value agree, so the measure is valid for R4 and R4c
        e2e = clean["preds"]["G"]
        e2e_row = e2e[(e2e["pid"] == row["pid"]) & (e2e["S"] == row["S"]) & (e2e["w"] == row["w"])]
        assert len(e2e_row) == 1 and _measure(a, float(e2e_row.iloc[0][col])) <= 1e-9, (a, e2e_row)
    b0 = float(hit[0][col])
    b1 = _solve(a, b0, m)
    hit[0][col] = b1
    path = os.path.join(tempfile.mkdtemp(), "weekly-preds.jsonl")
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    return path, registry.sha_file(path), a, b0, b1


# ── T-R-1 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestBoundary(unittest.TestCase):
    """T-R-1. Fails if the unlock outlives the body or widens past held."""

    def setUp(self):
        p = mock.patch.object(wd, "LAST_SEASON", L0)
        p.start()
        self.addCleanup(p.stop)
        self.assertEqual(wd.LAST_SEASON, L0)                                  # Fact

    def test_boundary(self):
        with confirm.boundary(L0 + 1):
            self.assertEqual(wd.LAST_SEASON, L0 + 1)
            with self.assertRaises(RuntimeError):
                with confirm.boundary(L0 + 1):
                    pass
        self.assertEqual(wd.LAST_SEASON, L0)
        with self.assertRaises(KeyError):
            with confirm.boundary(L0 + 1):
                raise KeyError("inside")
        self.assertEqual(wd.LAST_SEASON, L0)
        for bad in (L0 + 2, L0 - 1):
            with self.assertRaises(ValueError):
                with confirm.boundary(bad):
                    pass
            self.assertEqual(wd.LAST_SEASON, L0)
        with self.assertRaises(registry.ConfirmationHeld):
            wd.guard(L0 + 1)
        with confirm.boundary(L0):
            self.assertEqual(wd.LAST_SEASON, L0)
            with self.assertRaises(registry.ConfirmationHeld):
                wd.guard(L0 + 1)
        with confirm.boundary(L0 + 1):
            wd.guard(L0 + 1)                                                  # passes on its own
            with self.assertRaises(registry.ConfirmationHeld):
                wd.guard(L0 + 2)
        with self.assertRaises(registry.ConfirmationHeld):
            wd.guard(L0 + 1)


# ── T-R-2 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestHeldInputs(unittest.TestCase):
    """T-R-2. Fails if the copy of `run_weekly_inputs` step 6 drifts (week origin, fallback)."""

    @classmethod
    def setUpClass(cls):
        cls.c = e2e_c.build()
        pr = rwm._read_prior(cls.c["prior"])
        cls.prior = {n: pr[pr["cand"] == n.lower()].reset_index(drop=True) for n in registry.NAMES}
        cls.cache = pd.read_pickle(cls.c["inputs"])
        with mock.patch.object(wd, "LAST_SEASON", L0):
            spec = e2e_c.season_spec_c("H")
            cls.store = sm.Store(cls.c["tables_l0"], cls.c["panel"].meta["keys"], cls.c["panel"].meta["weights"], spec)
            cls.got = {S: confirm.held_inputs(cls.c["tables_l0"], cls.store, S, cls.prior) for S in range(2018, L0 + 1)}

    def test_facts(self):
        for S in range(2018, L0 + 1):
            h = self.cache["H"][self.cache["H"]["S"] == S]
            self.assertGreaterEqual(h.loc[h["nP"] > 0, "w"].nunique(), 2, S)
        self.assertGreaterEqual(int((self.cache["H"]["noPrior"] == 1).sum()), 1)

    def test_equals_the_cache(self):
        for S in range(2018, L0 + 1):
            for n in registry.NAMES:
                want = self.cache[n][self.cache[n]["S"] == S].reset_index(drop=True)
                pd.testing.assert_frame_equal(self.got[S][n], want, check_exact=True)


# ── T-R-3 / T-R-6 ───────────────────────────────────────────────────────────────────────────────────────────
class TestRehearsal(unittest.TestCase):
    """T-R-3. Fails if a comparison is skipped or uses the wrong tolerance per candidate."""

    @classmethod
    def setUpClass(cls):
        cls.c = e2e_c.build()
        cls.clean = clean_run()

    def test_clean_run_passes(self):
        self.assertEqual(self.clean["rc"], 0, self.clean["err"][-1500:])
        checks = self.clean["art"]["checks"]
        self.assertEqual(sorted(checks), ["R1", "R2", "R3", "R4", "R4c", "R5", "R6", "R7"])
        for r, by in checks.items():
            for cand, byp in by.items():
                for pos, v in byp.items():
                    if not (r in ("R6", "R7") and cand == "g"):
                        self.assertTrue(v["pass"], (r, cand, pos, v))
                    if cand == "h":
                        self.assertLessEqual(v["maxRel"], 1e-9, (r, cand, pos, v))
        self.assertEqual(sorted(checks["R4c"]), ["g"])
        for pos, v in checks["R4c"]["g"].items():
            self.assertLessEqual(v["maxRel"], 1e-9, (pos, v))
            self.assertNotIn("reportOnly", v)
        for pos, v in checks["R4"]["g"].items():
            self.assertTrue(v.get("reportOnly"), (pos, v))
        self.assertIn("fit G cached", self.clean["art"]["seconds"])
        self.assertIn("rehearsal passed: R1\u2013R3, R4 H, R4c, R5 within tolerance; R4 G, R6 G, R7 G report-only;", self.clean["out"])
        _assert_report_only_marks(self, self.clean["out"])
        self.assertIn("rehearsal", self.clean["art"]["label"])
        self.assertEqual(self.clean["art"]["held"], L0)

    def _run_with(self, **over):
        d = e2e_c.rehearse_deps(**over)
        return _run(ARGV, d)

    def test_h_ppg_moved_fails_r4_h(self):
        path, sha, a, b0, b1 = _perturbed_preds("h", "WR", "ppg", 1e-6)
        self.assertGreater(_measure(a, b1), 1e-9)                              # Fact
        r, out, err = self._run_with(preds_path=path, preds_sha=sha)
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R4 h", err)
        _assert_report_only_marks(self, out)                                   # the stop path prints the same maxima lines

    def test_g_cond_moved_by_1e6_fails_r4c(self):
        path, sha, a, b0, b1 = _perturbed_preds("g", "WR", "cond", 1e-6)
        self.assertGreater(_measure(a, b1), 1e-9)                              # Fact
        d = e2e_c.rehearse_deps(preds_path=path, preds_sha=sha)
        r, out, err = _run(ARGV, d)
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R4c g", err)
        self.assertEqual(glob.glob(os.path.join(d.out_dir, "*.json")), [])

    def test_g_cond_moved_by_six_percent_fails_r4c_not_r4(self):
        path, sha, a, b0, b1 = _perturbed_preds("g", "WR", "cond", 0.06)
        self.assertGreater(_measure(a, b1), 0.05)                              # Fact
        r, out, err = self._run_with(preds_path=path, preds_sha=sha)
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R4c g", err)
        self.assertNotIn("R4 g", err)

    def test_g_chosen_entry_changed_fails_r1(self):
        c = e2e_c.build()
        with open(c["s2a"]) as f:
            panel = json.load(f)
        ent = panel["results"]["WR"]["g"]["chosen"][str(L0)]["entry"]
        ent["lam"] = float(ent["lam"]) + 7.0
        path = os.path.join(tempfile.mkdtemp(), "s2a.json")
        with open(path, "w") as f:
            json.dump(panel, f)
        r, out, err = self._run_with(dev_s2a_path=path, dev_s2a_sha=registry.sha_file(path))
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R1", err)


class TestCachedRefit(unittest.TestCase):
    """T-R-10. Fails if R4c re-fits on the rebuilt frame (the end-to-end gap would hide behind report-only)."""
    FACTOR = 1 + 1e-3

    @staticmethod
    def _wrap(factor):
        orig = sm.fit_family

        def wrapped(family, *a, **k):
            res = orig(family, *a, **k)
            if family != "G":
                return res
            return ({n: v * factor for n, v in res[0].items()},) + tuple(res[1:])
        return mock.patch.object(sm, "fit_family", wrapped)

    @classmethod
    def setUpClass(cls):
        cls.c = e2e_c.build()
        cls.cache = pd.read_pickle(cls.c["inputs"])["G"]
        with mock.patch.object(wd, "LAST_SEASON", L0), mock.patch.object(registry, "require", e2e_c.fake_require_c):
            store = sm.Store(cls.c["tables_l0"], cls.c["panel"].meta["keys"], cls.c["panel"].meta["weights"], e2e_c.season_spec_c("H"))
            spec = e2e_c.season_spec_c("G")
            plain = season_prior.derive(store, "G", spec, L0)
            with cls._wrap(cls.FACTOR):
                wrapped = season_prior.derive(store, "G", spec, L0)
        ent = lambda df: {pos: season_prior._entry_of(g.iloc[0]) for pos, g in df.groupby("position")}
        assert ent(plain) == ent(wrapped), "the chosen entries change under the wrap — use 1e-4"                 # Fact
        rb_p, rb_w = plain[plain["position"] == "RB"], wrapped[wrapped["position"] == "RB"]
        m = 0.0
        for col in [c for c in plain.columns if c.startswith("pr_")]:
            u, w = rb_p[col].to_numpy(float), rb_w[col].to_numpy(float)
            ok = ~np.isnan(u)
            if ok.any():
                m = max(m, float((np.abs(w[ok] - u[ok]) / (1 + np.abs(u[ok]))).max()))
        assert m > 1e-9, m                                                                                      # Fact

    def _wrapped_run(self, patches=()):
        d = e2e_c.rehearse_deps()
        r, out, err = _run(ARGV, d, patches=(self._wrap(self.FACTOR), *patches))
        return d, r, err

    def test_r4c_reads_the_cache(self):
        d, r, err = self._wrapped_run()
        self.assertEqual(r, 0, err[-1500:])
        art = _artifact(d)
        c4, c4c = art["checks"]["R4"]["g"], art["checks"]["R4c"]["g"]
        self.assertGreater(max(v["maxRel"] for v in c4.values()), 1e-9)
        self.assertTrue(all(v.get("reportOnly") for v in c4.values()))
        for pos, v in c4c.items():
            self.assertLessEqual(v["maxRel"], 1e-9, (pos, v))

    def test_refit_on_the_rebuilt_frame_goes_red(self):
        """The defect: `refit_cached` handed run_held's combined frame (cache S < held + rebuilt rows). R4c then misses."""
        orig = confirm.refit_cached
        holder = {}
        orig_run_held = confirm.run_held

        def spy_run_held(tables, store, cache, specs_s, specs_w, held, *a, **k):
            res = orig_run_held(tables, store, cache, specs_s, specs_w, held, *a, **k)
            holder["combined"] = pd.concat([cache["G"][cache["G"]["S"] < held], res.rows["G"]], ignore_index=True)
            return res

        def bent(cache_frame, held, *a, **k):
            return orig(holder["combined"], held, *a, **k)
        d, r, err = self._wrapped_run(patches=(mock.patch.object(confirm, "run_held", spy_run_held), mock.patch.object(confirm, "refit_cached", bent)))
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R4c g", err)


class TestComparePredsUnit(unittest.TestCase):
    """`compare_preds`: a G gap is a report-only miss, an H gap is a failure. Fails if G is checked as a failure or H is let through."""

    def _pair(self, cand, gap):
        p = pd.DataFrame({"pid": ["a", "b"], "S": [2020, 2020], "w": [1, 1], "position": ["WR", "WR"], "cond": [5.0, 6.0], "ppg": [5.0, 6.0], "p": [0.5, 0.5],
                          "uncond": [4.0, 4.0], "c_w": [1.0, 1.0], "noPrior": [0.0, 0.0]})
        f = p.copy()
        f["cond"] = f["cond"] + np.array([gap, 0.0])
        f["cand"], f["T"] = cand, 2020
        return {cand.upper(): p}, f

    def test_g_report_only(self):
        preds, f = self._pair("g", 2.0)
        ck = confirm.Checker()
        confirm.compare_preds(ck, preds, f, 2020)
        self.assertEqual(ck.misses, [])
        self.assertGreater(ck.summary()["R4"]["g"]["WR"]["maxRel"], 0.05)         # Fact: the gap is beyond the 5% limit and recorded
        self.assertTrue(ck.summary()["R4"]["g"]["WR"]["reportOnly"])

    def test_h_fails(self):
        preds, f = self._pair("h", 1e-6)
        ck = confirm.Checker()
        confirm.compare_preds(ck, preds, f, 2020)
        self.assertEqual(len(ck.misses), 1)
        self.assertIn("R4 h", ck.misses[0])


class TestValueMissesFailGates(unittest.TestCase):
    """Item 4 of Fix pass 2: each value check, through the real `Checker`, on hand-built frames. Fails if a G value gap beyond 5% (or an H gap of 1e-6) is let through,
    or the F12 allowance is dropped. Every perturbed cell's measure (|a - b| / (1 + |b|), a = this run, b = the reference) is asserted on its stated side of the limit."""
    HELD = 2020
    ENTRY = {"era": "e1", "lam": 1.0, "g": "g1"}

    def _ref(self, a, m):
        """The reference value b with the check's measure against `a` equal to `m` (a Fact is asserted on the result)."""
        b = _solve(a, a + 1.0, m)
        self.assertAlmostEqual(_measure(a, b), m, places=9)
        return b

    # R1 / R2
    def _season(self, cand, col, m):
        a = 2.0
        b = self._ref(a, m)
        dr = pd.DataFrame({"pid": ["p1", "p2"], "position": ["WR", "WR"], "era": ["e1", "e1"], "lam": [1.0, 1.0], "g": ["g1", "g1"], "total": [a, 3.0], "pr_x": [a, 3.0]})
        ref = pd.DataFrame({"cand": cand, "T": self.HELD, "pid": ["p1", "p2"], "position": ["WR", "WR"], "total": [a, 3.0], "pr_x": [a, 3.0]})
        sp, pf = ref.copy(), ref.copy()
        (sp if col == "total" else pf).loc[0, col] = b
        ck = confirm.Checker()
        confirm.compare_season(ck, {cand.upper(): dr}, sp, pf, {(cand, self.HELD, "WR"): self.ENTRY}, self.HELD)
        return ck

    def test_r1_g_value_gap(self):
        ck = self._season("g", "total", 0.06)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R1 g", ck.misses[0])
        self.assertEqual(self._season("g", "total", 0.04).misses, [])
        self.assertGreater(0.06, confirm.G_LIMIT)                              # Fact: the two measures sit on either side of the 5% limit
        self.assertLess(0.04, confirm.G_LIMIT)

    def test_r1_h_value_gap(self):
        ck = self._season("h", "total", 1e-6)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R1 h", ck.misses[0])
        self.assertGreater(1e-6, confirm.TOL)                                  # Fact

    def test_r2_g_prior_gap(self):
        ck = self._season("g", "pr_x", 0.06)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R2 g", ck.misses[0])
        self.assertEqual(self._season("g", "pr_x", 0.04).misses, [])

    def test_r2_h_prior_gap(self):
        ck = self._season("h", "pr_x", 1e-6)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R2 h", ck.misses[0])

    # R3
    SPEC = {"priorCols": ["pr_x", "dstd_x", "drec_x", "noPrior"], "identity": ["pid", "S", "w"], "targets": ["x"]}

    def _frames(self, **new_over):
        base = {"pid": ["a", "b"], "S": [2020, 2020], "w": [1, 2], "position": ["WR", "WR"], "usage1": [1.0, 2.0], "pr_x": [1.0, 2.0], "dstd_x": [10.0, 20.0],
                "drec_x": [10.0, 20.0], "noPrior": [0.0, 0.0]}
        return pd.DataFrame({**base, **new_over}), pd.DataFrame(base)

    def _inputs(self, cand, **new_over):
        new, old = self._frames(**new_over)
        ck = confirm.Checker()
        confirm.compare_inputs(ck, {cand.upper(): new}, {cand.upper(): old}, self.SPEC)
        return ck

    def test_r3_g_prior_gap(self):
        b = self._ref(1.0, 0.06)
        ck = self._inputs("g", pr_x=[1.0, 2.0])
        self.assertEqual(ck.misses, [])                                        # control: identical frames pass
        new, old = self._frames(pr_x=[1.0, 2.0])
        old["pr_x"] = [b, 2.0]
        ck = confirm.Checker()
        confirm.compare_inputs(ck, {"G": new}, {"G": old}, self.SPEC)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R3 g", ck.misses[0])
        self.assertIn("pr_x", ck.misses[0])
        self.assertGreater(_measure(1.0, b), confirm.G_LIMIT)                  # Fact

    def test_r3_g_non_prior_column_gap(self):
        new, old = self._frames()
        old["usage1"] = [self._ref(1.0, 1e-6), 2.0]
        ck = confirm.Checker()
        confirm.compare_inputs(ck, {"G": new}, {"G": old}, self.SPEC)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R3 g", ck.misses[0])
        self.assertIn("usage1", ck.misses[0])
        self.assertGreater(_measure(1.0, old["usage1"][0]), confirm.TOL)       # Fact: beyond exact, far below 5%

    def test_r3_g_dstd_within_the_prior_gap_row(self):
        """F12: a `dstd_` gap up to the same row's `pr_` absolute gap passes; twice that fails although it is within 5% relative."""
        gap = 0.04
        for mult, want in ((1.0, 0), (2.0, 1)):
            new, old = self._frames(pr_x=[1.0, 2.0], dstd_x=[10.0 + mult * gap, 20.0])
            old["pr_x"] = [1.0 + gap, 2.0]
            ck = confirm.Checker()
            confirm.compare_inputs(ck, {"G": new}, {"G": old}, self.SPEC)
            self.assertEqual(len(ck.misses), want, (mult, ck.misses))
            if want:
                self.assertIn("dstd_x", ck.misses[0])
            # Fact: the pr_ row itself is within 5%, the dstd_ cell is within 5% relative at both multiples, and the stated side of the allowance holds
            self.assertLess(_measure(1.0, 1.0 + gap), confirm.G_LIMIT)
            self.assertLess(_measure(10.0 + mult * gap, 10.0), confirm.G_LIMIT)
            self.assertEqual(mult * gap > gap + confirm.TOL * (1.0 + 10.0), bool(want))

    def test_r3_h_column_gap(self):
        new, old = self._frames()
        old["usage1"] = [self._ref(1.0, 1e-6), 2.0]
        ck = confirm.Checker()
        confirm.compare_inputs(ck, {"H": new}, {"H": old}, self.SPEC)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R3 h", ck.misses[0])
        self.assertGreater(_measure(1.0, old["usage1"][0]), confirm.TOL)       # Fact

    # R5
    def _facts(self, cand, **over):
        f = {"cW": 1.0, "phi": 0.5, "targets": {"t": {"k": 3.0, "kGames": 5.0, "rho": 0.2, "alpha": "off", "kMult": 1.0, "medE": 1.5}}}
        dev = {cand: {str(self.HELD): {"WR": json.loads(json.dumps(f))}}}
        run = json.loads(json.dumps(f))
        for k, v in over.items():
            if k == "k":
                run["targets"]["t"]["k"] = v
            else:
                run[k] = v
        ck = confirm.Checker()
        confirm.compare_fits(ck, {cand.upper(): {"WR": run}}, dev, self.HELD)
        return ck

    def test_r5_g_phi_differs(self):
        ck = self._facts("g", phi=0.75)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R5 g WR phi", ck.misses[0])
        self.assertEqual(self._facts("g").misses, [])                          # control

    def test_r5_g_cw_gap(self):
        b = 1.0
        a = b + 0.06 * (1.0 + b)
        ck = self._facts("g", cW=a)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R5 g WR cW", ck.misses[0])
        self.assertGreater(_measure(a, b), confirm.G_LIMIT)                    # Fact
        a2 = b + 0.04 * (1.0 + b)
        self.assertEqual(self._facts("g", cW=a2).misses, [])
        self.assertLess(_measure(a2, b), confirm.G_LIMIT)                      # Fact

    def test_r5_h_k_differs(self):
        ck = self._facts("h", k=3.5)
        self.assertEqual(len(ck.misses), 1, ck.misses)
        self.assertIn("R5 h WR t.k", ck.misses[0])
        self.assertEqual(self._facts("h").misses, [])                          # control


class TestEvaluationWiring(unittest.TestCase):
    """T-R-6. Fails if `run_held` scores the wrong candidate, fold or rows."""

    @classmethod
    def setUpClass(cls):
        cls.c = e2e_c.build()
        cls.clean = clean_run()

    def test_facts(self):
        for pos in ("QB", "RB", "WR", "TE"):
            h = self.c["season_cand"]["h"]
            g = self.c["season_cand"]["g"]
            hh, gg = h[(h["T"] == L0) & (h["position"] == pos)].set_index("pid")["total"], g[(g["T"] == L0) & (g["position"] == pos)].set_index("pid")["total"]
            self.assertTrue((hh.reindex(gg.index) != gg).any(), pos)
        with open(self.c["s2a"]) as f:
            res = json.load(f)["results"]
        self.assertTrue(any(res[p]["h"]["labels"][b]["dByFold"][str(L0)] != res[p]["g"]["labels"][b]["dByFold"][str(L0)] for p in res if p in ("QB", "RB", "WR", "TE") for b in ("B2", "B1c")))

    def test_h_values_match_exactly(self):
        self.assertEqual(self.clean["rc"], 0, self.clean["err"][-800:])
        side = self.clean["art"]["sideBySide"]
        n = 0
        for pos, by in side["R6"].items():
            for b, v in by["h"].items():
                self.assertAlmostEqual(v["run"], v["dev"], delta=1e-9 * (1 + abs(v["dev"])), msg=(pos, b))
                n += 1
        self.assertEqual(n, 8)
        m = 0
        for pos, by in side["R7"]["h"].items():
            for b, v in by.items():
                for k in ("n", "candMae", "benchMae", "d"):
                    self.assertAlmostEqual(v["run"][k], v["dev"][k], delta=1e-9 * (1 + abs(v["dev"][k])), msg=(pos, b, k))
                    m += 1
        self.assertGreater(m, 0)

    def test_swapped_candidates_fail_r6(self):
        orig = evaluate.build_frame
        swap = lambda tables, folds, ct: orig(tables, folds, {"h": ct["g"], "g": ct["h"]})
        r, out, err = _run(ARGV, e2e_c.rehearse_deps(), patches=(mock.patch.object(evaluate, "build_frame", swap),))
        self.assertEqual(r, 2, err[-800:])
        self.assertIn("R6", err)
        self.assertNotIn("Traceback", err)


# ── T-R-4 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestNoRowPastHeld(unittest.TestCase):
    """T-R-4. Fails if a held row (2025 in the real run) reaches a table, fit or metric."""

    @classmethod
    def setUpClass(cls):
        cls.c = e2e_c.build()
        cls.rec = e2e_c.RecC()
        pat = [mock.patch.object(season_models_mod, "fold", cls.rec.wrap("fold", season_models_mod.fold)),
               mock.patch.object(season_prior, "derive", cls.rec.wrap("derive", season_prior.derive)),
               mock.patch.object(wd, "inputs_at", cls.rec.wrap("inputs_at", wd.inputs_at)),
               mock.patch.object(wd, "targets_at", cls.rec.wrap("targets_at", wd.targets_at)),
               mock.patch.object(weekly_models, "fit_w", cls.rec.wrap("fit_w", weekly_models.fit_w)),
               mock.patch.object(weekly_models, "predict_w", cls.rec.wrap("predict_w", weekly_models.predict_w)),
               mock.patch.object(baselines, "weekly_forecasts", cls.rec.wrap("weekly_forecasts", baselines.weekly_forecasts)),
               mock.patch.object(evaluate, "evaluate", cls.rec.wrap("evaluate", evaluate.evaluate)),
               mock.patch.object(evaluate_w, "labels", cls.rec.wrap("labels", evaluate_w.labels))]
        cls.rc, cls.out, cls.err = _run(ARGV, e2e_c.rehearse_deps(), patches=pat)

    def test_facts(self):
        c = self.c
        self.assertEqual(int(c["panel"].weeks["S"].max()), L0 + 1)
        self.assertEqual(int(c["benchw"]["S"].max()), L0 + 1)
        probe = e2e_c.RecC()
        probe.wrap("x", lambda *a: None)(c["full"])
        self.assertEqual(probe.maxima("x")[0][0], L0 + 1)                      # the recorder can see a held row

    def test_nothing_past_held(self):
        self.assertEqual(self.rc, 0, self.err[-1500:])
        for name in ("fold", "derive", "inputs_at", "targets_at", "fit_w", "predict_w", "weekly_forecasts", "evaluate", "labels"):
            self.assertGreaterEqual(self.rec.count(name), 1, name)
            for seen in self.rec.maxima(name):
                for k, v in seen.items():
                    self.assertLessEqual(v, L0, (name, k, v))
        for seen in self.rec.maxima("fit_w"):
            self.assertLess(seen[0], L0)                                       # frame_tr: trained on seasons before the held one


# ── T-R-5 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestStandIn(unittest.TestCase):
    """T-R-5. Fails if the path cannot reach a season past the last training season, or trains on it."""

    @classmethod
    def setUpClass(cls):
        c = cls.c = e2e_c.build()
        cls.rec = e2e_c.RecC()
        base = e2e_c.make_base_c()
        cls.env = registry.Env(base=base, repo=base, prereg=e2e_c.e2e_w.report_hash())
        from lp import registry_w
        cls.env_w = registry_w.weekly_env(base=base, repo=base, prereg=e2e_c.e2e_w.report_hash(), data_fn=lambda: {})
        held = L0 + 1
        with mock.patch.object(wd, "LAST_SEASON", L0), mock.patch.object(registry, "require", e2e_c.fake_require_c), \
                mock.patch.object(weekly_models, "fit_w", cls.rec.wrap("fit_w", weekly_models.fit_w)):
            cls.tables = wd.trim(c["full"], last=held)
            specs_s = {n: e2e_c.season_spec_c(n) for n in registry.NAMES}
            specs_w = {n: e2e_c.weekly_spec_c(n) for n in registry.NAMES}
            store = sm.Store(cls.tables, c["panel"].meta["keys"], c["panel"].meta["weights"], specs_s["H"])
            cache = pd.read_pickle(c["inputs"])
            cls.held = confirm.run_held(cls.tables, store, cache, specs_s, specs_w, held, wd.trim_frame(c["benchw"], last=held), cls.env, cls.env_w, 60)
            cls.after = wd.LAST_SEASON
        cls.cache = cache

    def test_facts(self):
        for pos in ("QB", "RB", "WR", "TE"):
            r = self.held.rows["H"]
            sub = r[(r["position"] == pos) & r["played"].astype(bool)]
            self.assertTrue(len(sub) and np.isfinite(sub[[c for c in sub.columns if c.startswith("r_")]].to_numpy(float)).any(axis=1).any(), pos)

    def test_stand_in_path(self):
        h = self.held
        for n in registry.NAMES:
            self.assertTrue((h.derived[n]["T"] == L0 + 1).all())
            self.assertTrue((h.preds[n]["S"] == L0 + 1).all())
            self.assertGreater(len(h.preds[n]), 0)
        self.assertEqual(max(self.cache[n]["S"].max() for n in registry.NAMES), L0)
        calls = self.rec.maxima("fit_w")
        self.assertGreaterEqual(len(calls), 2)
        for seen in calls:
            self.assertEqual(seen[0], L0)
        self.assertEqual(h.season["folds"], [L0 + 1])
        for c in ("h", "g"):
            for pos in ("QB", "RB", "WR", "TE"):
                self.assertIn(pos, h.weekly[c], (c, pos))
        self.assertEqual(self.after, L0)
        with mock.patch.object(wd, "LAST_SEASON", L0):
            with self.assertRaises(registry.ConfirmationHeld):
                wd.guard(L0 + 1)


# ── T-R-7 ───────────────────────────────────────────────────────────────────────────────────────────────────
class _Counter:
    def __init__(self, fn):
        self.fn, self.n = fn, 0

    def __call__(self, *a, **k):
        self.n += 1
        return self.fn(*a, **k)


class TestRunner(unittest.TestCase):
    """T-R-7. Fails if a check runs after a load or a write, or a second rehearsal runs silently."""

    def setUp(self):
        self.c = e2e_c.build()

    def _counted(self, **over):
        d = e2e_c.rehearse_deps(**over)
        d.load_meta, d.load_cache = _Counter(d.load_meta), _Counter(d.load_cache)
        req = _Counter(e2e_c.fake_require_c)
        return d, req

    def _run(self, argv, d, req, extra=()):
        return _run(argv, d, patches=(mock.patch.object(registry, "require", req), *extra))

    def test_wrong_prereg_hash(self):
        t = os.path.join(tempfile.mkdtemp(), "task.md")
        with open(rc.run_season_models.LP1A_TASK_FILE, encoding="utf-8") as src:
            text = src.read()
        with open(t, "w", encoding="utf-8") as f:
            f.write(re.sub(r"(^## 8\.[^\n]*\n)", r"\1EDITED ", text, count=1, flags=re.M))
        d, req = self._counted(task_file=t)
        r, out, err = self._run(ARGV, d, req)
        self.assertEqual(r, 2)
        self.assertEqual((d.load_meta.n, d.load_cache.n, req.n), (0, 0, 0))

    def test_wrong_sha_or_missing_file(self):
        fields = (("inputs_sha", "inputs_path"), ("prior_sha", "prior_path"), ("preds_sha", "preds_path"), ("fits_sha", "fits_path"), ("season_preds_sha", "season_preds_path"),
                  ("dev_s2a_sha", "dev_s2a_path"), ("dev_s2b1b_sha", "dev_s2b1b_path"))
        for sha_f, path_f in fields:
            for how in ("sha", "missing"):
                over = {sha_f: "0" * 64} if how == "sha" else {path_f: os.path.join(tempfile.mkdtemp(), "nope")}
                d, req = self._counted(**over)
                r, out, err = self._run(ARGV, d, req)
                self.assertEqual(r, 2, (sha_f, how))
                self.assertEqual((d.load_cache.n, req.n), (0, 0), (sha_f, how))
                self.assertIn("SHA-256", err)

    def test_require_failure_returns_2_without_a_log_entry(self):
        def boom(*a, **k):
            raise registry.NotRegistered("x is not registered")
        d, req = self._counted()
        fold = _Counter(weekly_models.fold_w)
        r, out, err = self._run(ARGV, d, _Counter(boom), extra=(mock.patch.object(weekly_models, "fold_w", fold),))
        self.assertEqual(r, 2)
        self.assertEqual(fold.n, 0)
        self.assertEqual(registry.runlog_entries(d.env_w), [])
        self.assertNotIn("Traceback", err)

    def test_spec_last_season_mismatch(self):
        def req(name, T, layer="season", env=None):
            out = e2e_c.fake_require_c(name, T, layer, env)
            if layer == "weekly":
                out["spec"]["lastSeason"] = L0 - 1
            return out
        d, _ = self._counted()
        r, out, err = self._run(ARGV, d, _Counter(req))
        self.assertEqual(r, 2)
        self.assertIn("lastSeason", err)

    def test_run_held_raising_returns_2(self):
        for exc in (AssertionError("a"), ValueError("v"), registry.ConfirmationHeld("c"), spec_wm.NoTrainingRows("n")):
            d, req = self._counted()
            rh = _Counter(mock.Mock(side_effect=exc))
            r, out, err = self._run(ARGV, d, req, extra=(mock.patch.object(confirm, "run_held", rh),))
            self.assertEqual(r, 2, type(exc))
            self.assertEqual(rh.n, 1)
            self.assertEqual(glob.glob(os.path.join(d.out_dir, "*")), [])
            self.assertNotIn("Traceback", err)

    def test_success_second_run_and_again(self):
        c = self.c
        files = [c["inputs"], c["prior"], c["preds"], c["fits"], c["season_preds"], c["s2a"], c["s2b"]]
        before = [registry.sha_file(f) for f in files]
        d, req = self._counted()
        r, out, err = self._run(ARGV, d, req)
        self.assertEqual(r, 0, err[-1500:])
        self.assertEqual(d.load_cache.n, 1)
        self.assertEqual([registry.sha_file(f) for f in files], before)
        self.assertEqual([os.path.basename(p) for p in glob.glob(os.path.join(d.out_dir, "*"))], ["2026-02-02-learned-s2b2a-rehearsal.json"])
        log = [e for e in registry.runlog_entries(d.env_w) if e.get("mode") == "confirm-rehearsal"]
        self.assertEqual(len(registry.runlog_entries(d.env_w)), 1)
        self.assertEqual(len(log), 1)
        self.assertEqual(log[0]["held"], L0)
        self.assertIsNone(log[0]["again"])
        self.assertIn("OMP_NUM_THREADS", log[0]["threads"])
        # a second rehearsal on the same base is refused before load_cache
        d2 = e2e_c.rehearse_deps(base=d.base)
        d2.load_cache = _Counter(d2.load_cache)
        r, out, err = _run(ARGV, d2, patches=())
        self.assertEqual(r, 2)
        self.assertEqual(d2.load_cache.n, 0)
        self.assertIn("--again", err)
        # --again with a reason runs, and its entry carries the reason
        d3 = e2e_c.rehearse_deps(base=d.base)
        r, out, err = _run(ARGV + ["--again", "test"], d3, patches=())
        self.assertEqual(r, 0, err[-800:])
        agains = [e["again"] for e in registry.runlog_entries(d3.env_w) if e.get("mode") == "confirm-rehearsal"]
        self.assertEqual(agains, [None, "test"])

    def test_no_season_option(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as cm:
                rc.main(["--rehearse", "--held", "2025"], deps=e2e_c.rehearse_deps())
        self.assertEqual(cm.exception.code, 2)


# ── T-R-8 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _norm(s):
    return re.sub(r"\s+", " ", s).strip()


def _pin_block(path):
    with open(path) as f:
        t = f.read()
    m = re.search(r"_SKLEARN_PRELOADED = .*?os\.environ\[_v\] = \"1\"", t, re.S)
    return _norm(m.group(0))


class TestPins(unittest.TestCase):
    """T-R-8. Fails if a G fit can run multi-threaded or unseeded, or the record reports another module's flags."""

    def setUp(self):
        self.assertGreater(os.cpu_count(), 1)                                  # Fact

    def test_copies_equal_the_originals(self):
        self.assertEqual(rc.THREAD_VARS, rwm.THREAD_VARS)
        self.assertEqual(_pin_block(os.path.join(HERE, "run_confirm.py")), _pin_block(os.path.join(HERE, "run_weekly_models.py")))
        import inspect
        self.assertEqual(_norm(inspect.getsource(rc._ensure_hash_seed)), _norm(inspect.getsource(rwm._ensure_hash_seed)))

    def test_pins_in_a_subprocess(self):
        env = {**os.environ, **{v: "8" for v in rc.THREAD_VARS}}
        code = ("import os, run_confirm as r; from threadpoolctl import threadpool_info; "
                "print(*[os.environ[v] for v in r.THREAD_VARS], r._SKLEARN_PRELOADED); print(*[i['num_threads'] for i in threadpool_info()])")
        r = subprocess.run([sys.executable, "-c", code], cwd=HERE, env=env, capture_output=True, text=True)
        lines = r.stdout.strip().splitlines()
        self.assertEqual(lines[0].split(), ["1", "1", "1", "1", "False"], r.stderr[-500:])
        self.assertTrue(len(lines) > 1 and lines[1].split(), "threadpoolctl reports at least one loaded pool")
        self.assertEqual(set(lines[1].split()), {"1"}, lines[1])

    def test_hash_seed_reexec(self):
        calls = []
        with mock.patch.dict(os.environ, {"PYTHONHASHSEED": "1"}):
            rc._ensure_hash_seed(execv=lambda *a: calls.append(a))
            self.assertEqual(os.environ["PYTHONHASHSEED"], "0")
        self.assertEqual(len(calls), 1)
        with mock.patch.dict(os.environ, {"PYTHONHASHSEED": "0"}):
            rc._ensure_hash_seed(execv=lambda *a: calls.append(a))
        self.assertEqual(len(calls), 1)

    def test_threads_reads_this_modules_flags(self):
        self.assertEqual(set(rc._threads()), set(rwm._threads()))
        with mock.patch.object(rc, "_NUMPY_PRELOADED", True):
            self.assertTrue(rc._threads()["numpyPreloaded"])
        with mock.patch.object(rc, "_NUMPY_PRELOADED", False):
            self.assertFalse(rc._threads()["numpyPreloaded"])


# ── T-R-9 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestCopies(unittest.TestCase):
    """T-R-9. Fails if `parity` or `merge_preds` drifts from `run_weekly_models`."""

    @classmethod
    def setUpClass(cls):
        c = cls.c = e2e_c.build()
        cls.tables = c["tables_l0"]
        meta = dict(c["panel"].meta)
        if [meta["keys"].index(k) for k in meta["weights"]] == list(range(len(meta["weights"]))):
            meta["weights"] = dict(reversed(list(meta["weights"].items())))
        cls.meta = meta
        with open(os.path.join(HERE, "run_weekly_models.py")) as f:
            cls.src = f.read().splitlines()
        cls.preds_rows = pd.DataFrame(_read_jsonl(c["preds"]))

    def test_facts(self):
        order = [self.meta["keys"].index(k) for k in self.meta["weights"]]
        self.assertNotEqual(order, list(range(len(order))))
        self.assertTrue((self.preds_rows["ppg"] != self.preds_rows["cond"]).any())

    def test_sources_contain_the_original_lines(self):
        import inspect
        par = _norm(inspect.getsource(confirm.parity))
        for line in self.src[255:257]:
            self.assertIn(_norm(line), par)
        mrg = _norm(inspect.getsource(confirm.merge_preds))
        self.assertIn(_norm(self.src[328]), mrg)
        for line in self.src[329:331]:
            self.assertIn(_norm(line.replace("pd.concat(preds[n], ignore_index=True)", "preds[n]")), mrg)

    def test_parity_equals_score_parity(self):
        from lp import score
        T_trim, pmeta = self.tables, self.meta
        order = [pmeta["keys"].index(k) for k in pmeta["weights"]]
        want = score.parity(T_trim.X[T_trim.weeks["rid"].to_numpy()][:, order], T_trim.weeks["pts"].to_numpy(), [pmeta["weights"][k] for k in pmeta["weights"]])
        got = confirm.parity(T_trim, pmeta)
        self.assertEqual(got[0], want[0])
        self.assertEqual(len(got[1]), 0)
        self.assertEqual(list(got[1]), list(want[1]))
        t2 = wd.trim(self.tables, last=L0)
        i = int(np.flatnonzero(t2.weeks["played"].astype(bool).to_numpy())[0])
        t2.weeks.iloc[i, t2.weeks.columns.get_loc("pts")] = float(t2.weeks["pts"].iloc[i]) + 1.0
        got = confirm.parity(t2, pmeta)
        self.assertEqual(len(got[1]), 1)

    def test_merge_preds_equals_the_original_merge(self):
        c = self.c
        with mock.patch.object(wd, "LAST_SEASON", L0):
            wf = baselines.build_weekly_frame(self.tables, seasons=range(2014, L0 + 1))
            wk = baselines.weekly_forecasts(wf, L0, None, c["benchw"][c["benchw"]["S"] <= L0])
        preds = {n: self.preds_rows[(self.preds_rows["cand"] == n.lower()) & (self.preds_rows["T"] == L0)].reset_index(drop=True) for n in registry.NAMES}
        want = wk
        names = registry.NAMES
        preds_l = {n: [preds[n]] for n in names}
        for n in names:
            d = pd.concat(preds_l[n], ignore_index=True)[["pid", "S", "w", "cond", "p"]].rename(columns={"cond": n.lower(), "p": n.lower() + "_p"})
            want = want.merge(d, on=["pid", "S", "w"], how="left")
        pd.testing.assert_frame_equal(confirm.merge_preds(wk, preds), want, check_exact=True)


season_models_mod = sm

if __name__ == "__main__":
    unittest.main()
