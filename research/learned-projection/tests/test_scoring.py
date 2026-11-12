"""T-PY-1 / T-PY-2 — scoring parity between the Python copy (lp/score.py) and the Node scorer that wrote `pts`."""
import json
import os
import unittest

import numpy as np

from lp import io, score

HERE = os.path.dirname(os.path.abspath(__file__))


class ScoringParity(unittest.TestCase):
    def test_py2_pinned_rows(self):
        """T-PY-2: 20 pinned rows score exactly to the panel's `pts` (no cache needed). Fails on any drift between copy and port."""
        with open(os.path.join(HERE, "fixtures", "scoring_rows.json")) as f:
            fx = json.load(f)
        self.assertEqual(len(fx["rows"]), 20)
        self.assertTrue(any(max(r["x"]) >= 100 for r in fx["rows"]), "fixture must include a threshold-bonus row")
        for r in fx["rows"]:
            self.assertEqual(score.score(r["x"], fx["weights"]), r["pts"], "%s %s w%s" % (r["pid"], r["S"], r["w"]))
        self.assertEqual(score.js_round2(0.125), 0.13, "JS Math.round ties go up")
        self.assertEqual(score.js_round2(-0.125), -0.12, "…toward +inf for negatives too (Python round() would give -0.12 / 0.12)")

    def test_py1_real_cache(self):
        """T-PY-1: every played row of the real cache. Skips (loudly) when the cache is absent; run_benchmarks.py hard-stops on it."""
        if not os.path.exists(os.path.join(io.PANEL_DIR, "meta.json")):
            self.skipTest("research cache absent — run `node bin/learned.mjs export` first (T-PY-1 NOT exercised)")
        p = io.load_cache()
        n, bad = score.parity(p.Xw, p.weeks["pts"].to_numpy(), p.weights)
        self.assertGreater(n, 80000)
        self.assertEqual(len(bad), 0, "scoring parity failed on %d of %d played rows" % (len(bad), n))


if __name__ == "__main__":
    unittest.main()
