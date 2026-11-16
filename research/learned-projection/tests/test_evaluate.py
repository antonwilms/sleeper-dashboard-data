"""LP-2a: T-M-12 (label wiring)."""
import unittest

import numpy as np
import pandas as pd

from lp import evaluate, metrics


def frame(seed=0, folds=(2018, 2019), n=40, cand_off=1.0, b2_off=10.0, extra_2025=False):
    rng = np.random.RandomState(seed)
    rows = []
    for pos in ("QB", "RB", "WR", "TE"):
        for T in folds:
            for i in range(n):
                actual = float(rng.uniform(20, 200))
                stratum = "V" if i % 5 else "N"
                rows.append(dict(pid="%s%d" % (pos, i), T=T, position=pos, headline=(i % 7 != 0), stratum=stratum, b1_covered=(i % 3 != 0), actual=actual,
                                 b1=actual + b2_off, b1c=actual + b2_off if (i % 4) else np.nan, b2=actual + b2_off if stratum == "V" else np.nan,
                                 ridge=actual + 5.0, h=actual + cand_off, g=actual - cand_off))
        if extra_2025:
            rows.append(dict(pid="%s0" % pos, T=2025, position=pos, headline=True, stratum="V", b1_covered=True, actual=100.0, b1=1e6, b1c=1e6, b2=1e6, ridge=1e6, h=-1e6, g=-1e6))
    df = pd.DataFrame(rows)
    return df


class TestLabelWiring(unittest.TestCase):
    """T-M-12. Fails if 2025 enters the pooled label, uncovered rows are scored or the one-fold smoke path crashes."""

    def test_rows_and_label(self):
        df = frame()
        out = evaluate.evaluate(df, (2018, 2019), B=50)
        h = df[df["position"] == "QB"]
        b2_rows = h[h["headline"] & (h["stratum"] == "V")]
        b1c_rows = h[h["headline"] & h["b1_covered"] & h["b1c"].notna()]
        self.assertEqual(out["QB"]["h"]["labels"]["B2"]["n"], len(b2_rows))
        self.assertEqual(out["QB"]["h"]["labels"]["B1c"]["n"], len(b1c_rows))
        self.assertLess(len(b1c_rows), int((h["headline"] & h["b1_covered"]).sum()))        # uncovered / null-b1c rows are not scored
        # candidate off by +1, B2 off by +10 on every row: d = -9 on every fold, MAE(B2) = 10 -> beats; the label is metrics.label's
        lab = out["QB"]["h"]["labels"]["B2"]
        self.assertAlmostEqual(lab["d"]["value"], -9.0)
        self.assertAlmostEqual(lab["benchMae"]["value"], 10.0)
        self.assertEqual(lab["label"], metrics.label(lab["d"]["value"], lab["d"]["ci"], lab["benchMae"]["value"], lab["dSpearman"]["ci"]))
        self.assertEqual(lab["label"], "beats")
        worse = evaluate.evaluate(frame(cand_off=30.0, b2_off=1.0), (2018, 2019), B=50)
        self.assertEqual(worse["QB"]["h"]["labels"]["B2"]["label"], "loses")
        # the signed-error pooled MAE of the benchmark equals the hand value
        self.assertAlmostEqual(lab["benchMae"]["value"], float(np.mean([np.abs(b2_rows[b2_rows["T"] == T]["b2"] - b2_rows[b2_rows["T"] == T]["actual"]).mean() for T in (2018, 2019)])))

    def test_2025_row_is_ignored(self):
        a = evaluate.evaluate(frame(), (2018, 2019), B=50)
        b = evaluate.evaluate(frame(extra_2025=True), (2018, 2019), B=50)
        self.assertEqual(a["QB"]["h"]["labels"], b["QB"]["h"]["labels"])
        self.assertEqual(a["QB"]["h"]["sets"]["headline"]["mae"], b["QB"]["h"]["sets"]["headline"]["mae"])

    def test_null_candidate_value_raises(self):
        df = frame()
        df.loc[3, "h"] = np.nan
        with self.assertRaises(ValueError):
            evaluate.evaluate(df, (2018, 2019), B=50)

    def test_stratum_v_without_b2_raises(self):
        df = frame()
        i = df[(df["position"] == "QB") & df["headline"] & (df["stratum"] == "V")].index[0]
        df.loc[i, "b2"] = np.nan
        with self.assertRaises(AssertionError):
            evaluate.evaluate(df, (2018, 2019), B=50)

    def test_one_fold_smoke_path(self):
        df = frame(folds=(2018,))
        base = df
        df = pd.concat([df, df[df["pid"] == "QB1"].assign(pid="QB_only2018")], ignore_index=True)
        out = evaluate.evaluate(df, (2018,), B=50)
        without = evaluate.evaluate(base, (2018,), B=50)
        q = base[(base["pid"] == "QB1") & (base["T"] == 2018)].iloc[0]
        self.assertTrue(q["headline"] and q["stratum"] == "V")                         # the copy is a headline V row
        self.assertEqual(out["QB"]["h"]["labels"]["B2"]["n"], without["QB"]["h"]["labels"]["B2"]["n"] + 1)   # a 2018-only pid is kept
        st = out["QB"]["h"]["sets"]["headline"]
        self.assertIsNone(st["drift"])                      # skipped under three folds
        self.assertEqual(list(st["maeByFold"]), ["2018"])
        self.assertNotIn("dSlope", out["QB"]["h"]["labels"]["B2"])
        self.assertIn("gateProvisional", out)


if __name__ == "__main__":
    unittest.main()
