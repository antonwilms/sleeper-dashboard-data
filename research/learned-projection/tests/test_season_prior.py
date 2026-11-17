"""LP-2b-1a: T-W-3 (the weekly prior is the registered season layer). Every test that reaches `season_models.fold` patches `registry.require`;
none reaches the real lock."""
import json
import os
import tempfile
import unittest
from unittest import mock

import numpy as np
import pandas as pd

from lp import registry, season_models as sm, season_prior as sp, spec_w
from tests import synth_season as ss
from tests import synth_weekly as sw

POS = ("QB", "RB", "WR", "TE")
T = 2019


def _pass(*a, **k):
    return None


def _jsonable(v):
    if isinstance(v, (float, np.floating)):
        return None if not np.isfinite(v) else float(v)
    if isinstance(v, np.integer):
        return int(v)
    return v


class TestPriorIsSeasonLayer(unittest.TestCase):
    """T-W-3. Fails if the copy of `refit` drifts from the registered fit (a wrong training window, a dropped `c`) or if the comparison with the
    season layer's own prediction file is loose."""

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = sw.make_weekly_panel()
        cls.spec = sw.small_spec("H")
        cls.store = sm.Store(cls.t, ss.KEYS, ss.WEIGHTS, cls.spec)
        with mock.patch.object(registry, "require", _pass):
            cls.main, cls.out = sm.fold(cls.store, "H", cls.spec, T, None)
            cls.gaps = {}
            cls.derived = sp.derive(cls.store, "H", cls.spec, T, gaps=cls.gaps)

    def test_c_is_exercised(self):
        """The fixture: a calibration factor other than 1 for at least one position, so composing with c = 1 would show."""
        self.assertTrue(any(self.out["details"][p]["c"] != 1.0 for p in POS), {p: self.out["details"][p]["c"] for p in POS})

    def test_copy_composes_to_refit_and_fold(self):
        for pos in POS:
            det = self.out["details"][pos]
            preds, d, minor, info = sp.prior_refit(self.store, self.spec, "H", pos, T, det["entry"])
            comp = sm.compose(self.store, self.spec, pos, d, preds, minor, det["c"])
            frame, _info, _u = sm.refit(self.store, self.spec, "H", pos, T, det["entry"], det["c"])        # the original of the copy
            pd.testing.assert_frame_equal(comp, frame, check_exact=True)
            want = self.main[self.main["position"] == pos].reset_index(drop=True)
            for c in comp.columns:
                np.testing.assert_array_equal(comp[c].to_numpy(), want[c].to_numpy(), err_msg="%s %s" % (pos, c))
            self.assertEqual(set(info), set(preds), "H reports a partial-pooling alpha per season target")

    def test_derive_frame(self):
        """The prior columns are the fit's own predictions, in native units; the composed columns equal fold's; G has no alpha."""
        d = self.derived
        self.assertEqual(len(d), len(self.main))
        self.assertTrue((d["cand"] == "h").all() and (d["T"] == T).all())
        for pos in POS:
            det = self.out["details"][pos]
            preds, _d, _m, _i = sp.prior_refit(self.store, self.spec, "H", pos, T, det["entry"])
            sub = d[d["position"] == pos]
            for t in spec_w.targets_by_pos()[pos]:
                np.testing.assert_array_equal(sub["pr_" + t].to_numpy(), preds[t])
            np.testing.assert_array_equal(sub["pr_gamesShare"].to_numpy(), preds["gamesShare"])
            self.assertTrue(np.isfinite(sub["alpha_gamesShare"]).all())
            for t in set(spec_w.union_targets()) - set(spec_w.targets_by_pos()[pos]):
                self.assertTrue(sub["pr_" + t].isna().all())

    def test_compose_gaps_are_reported_and_exact_for_h(self):
        self.assertEqual(set(self.gaps), {("h", T, p) for p in POS})
        self.assertTrue(all(g == {"maxAbs": 0.0, "maxRel": 0.0} for g in self.gaps.values()))

    def test_compare_compose_is_exact_for_h_and_g(self):
        """The same-run check (copy against fold) is bit-exact for both candidates and NaN-pattern exact; it reports its gaps."""
        want = self.main[self.main["position"] == "WR"].reset_index(drop=True)
        comp = want[[c for c in want.columns if c in sp.COMP_COLS or c.startswith("kv_")]].copy()
        for name in ("H", "G"):
            self.assertEqual(sp.compare_compose(name, comp, want), {"maxAbs": 0.0, "maxRel": 0.0})
            tiny = comp.copy()
            tiny.loc[0, "total"] = tiny.loc[0, "total"] * (1 + 1e-12)
            with self.assertRaises(sp.PriorCheckError):
                sp.compare_compose(name, tiny, want)
            nan = comp.copy()
            nan.loc[0, "ppg"] = np.nan
            with self.assertRaises(sp.PriorCheckError):
                sp.compare_compose(name, nan, want)

    def test_derive_raises_when_the_copy_does_not_compose(self):
        real = sp.prior_refit

        def off(*a, **k):
            preds, d, minor, info = real(*a, **k)
            return {t: v * 1.001 for t, v in preds.items()}, d, minor, info
        with mock.patch.object(registry, "require", _pass), mock.patch.object(sp, "prior_refit", off):
            with self.assertRaises(sp.PriorCheckError):
                sp.derive(self.store, "H", self.spec, T)

    def _write(self, rows, drop_pid=None, tweak=None, cand="h"):
        d = tempfile.mkdtemp()
        path = os.path.join(d, "season-preds.jsonl")
        with open(path, "w") as f:
            for r in rows:
                if drop_pid is not None and r["pid"] == drop_pid:
                    continue
                f.write(json.dumps({"cand": cand, **({k: _jsonable(v) for k, v in r.items()} if tweak is None else tweak(r))}, sort_keys=True) + "\n")
            f.write(json.dumps({"cand": cand, "arm": "c=1", "position": "WR", "pid": "ARM", "T": T, "total": 1.0}) + "\n")      # an arm row is ignored
        return path, registry.sha_file(path)

    def test_check_against_file(self):
        rows = self.main.to_dict("records")
        path, sha = self._write(rows)
        deltas = sp.check_against_file(self.derived, path, sha)
        self.assertTrue(all(v["maxAbs"] <= 1e-9 and v["maxRel"] <= 1e-9 for v in deltas.values()) and ("h", T, "WR") in deltas)
        # a derived NaN equals a JSON null; a null against a finite value does not
        kv = next(c for c in self.derived.columns if c.startswith("kv_"))
        pid0 = self.derived["pid"].iloc[0]
        nan_derived = self.derived.copy()
        nan_derived.loc[nan_derived["pid"] == pid0, kv] = np.nan

        def null(r):
            out = {k: _jsonable(v) for k, v in r.items()}
            if r["pid"] == pid0:
                out[kv] = None
            return out
        pn, sn = self._write(rows, tweak=null)
        sp.check_against_file(nan_derived, pn, sn)
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(self.derived, pn, sn)
        # one kv_ value with |x| >= 0.01 multiplied by 1 + 1e-6
        r0 = next(r for r in rows for c, v in r.items() if c.startswith("kv_") and isinstance(v, float) and abs(v) >= 0.01)
        col = next(c for c, v in r0.items() if c.startswith("kv_") and isinstance(v, float) and abs(v) >= 0.01)

        def bump(r):
            out = {k: _jsonable(v) for k, v in r.items()}
            if r["pid"] == r0["pid"]:
                out[col] = _jsonable(r[col]) * (1 + 1e-6)
            return out
        p2, s2 = self._write(rows, tweak=bump)
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(self.derived, p2, s2)
        p3, s3 = self._write(rows, drop_pid=rows[0]["pid"])
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(self.derived, p3, s3)
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(self.derived, path, "0" * 64)


    def _g(self):
        """The H frame relabelled `g` (the check's tolerance is per candidate) and the dev run's chosen entries for it."""
        d = self.derived.copy()
        d["cand"] = "g"
        entries = {("g", T, pos): {"era": d[d["position"] == pos]["era"].iloc[0], "lam": float(d[d["position"] == pos]["lam"].iloc[0])} for pos in POS}
        return d, entries

    def test_g_is_checked_by_entry_and_relative_difference(self):
        """G (not bit-reproducible against LP-2a's unrecorded-thread dev run): same chosen entry exactly; relative difference reported; > 5% stops."""
        d, entries = self._g()
        rows = self.main.to_dict("records")

        def scale(f):
            def tw(r):
                out = {k: _jsonable(v) for k, v in r.items()}
                for c in ("total", "ppg"):
                    out[c] = out[c] * f
                return out
            return tw
        p, sh = self._write(rows, tweak=scale(1.02), cand="g")
        res = sp.check_against_file(d, p, sh, entries=entries)
        worst = max(v["maxRel"] for v in res.values())
        self.assertTrue(0.01 < worst < 0.05, worst)                    # reported, within the limit
        pe, she = self._write(rows, tweak=scale(1.10), cand="g")
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(d, pe, she, entries=entries)          # beyond 5%
        wrong = dict(entries)
        wrong[("g", T, "WR")] = {**entries[("g", T, "WR")], "lam": 99.0}
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(d, p, sh, entries=wrong)              # a different chosen entry is never tolerated
        ph, shh = self._write(rows, tweak=scale(1.02), cand="h")
        with self.assertRaises(sp.PriorCheckError):
            sp.check_against_file(self.derived, ph, shh)                # H stays exact: the same 2% is a stop

    def test_dev_entries_reads_the_registered_dev_run(self):
        e = sp.dev_entries(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "backtests", "2026-11-16-learned-s2a-dev-panel.json"))
        self.assertEqual(len(e), 48)
        self.assertEqual(e[("g", 2022, "RB")], {"era": "E1", "lam": 0.2, "g": "g3"})
        self.assertEqual(e[("h", 2019, "QB")], {"era": "E0", "lam": 0.0})


if __name__ == "__main__":
    unittest.main()
