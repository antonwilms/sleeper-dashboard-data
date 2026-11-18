"""LP-2b-1b: T-B-14 (label wiring). The labels come from `lp/metrics.py` UNCHANGED under LP-1a §8; this tests the wiring on a hand-built frame."""
import unittest

import numpy as np
import pandas as pd

from lp import bootstrap as bs, evaluate_w, metrics as M, report_s2b

POS = ("QB", "RB", "WR", "TE")


def make_wk(seasons=(2019, 2020, 2021), seed=0):
    """Six players per position, weeks 1-4 per season. Seasons after 2020 carry errors of at least 10 for every column (the Fact of T-B-14)."""
    rng = np.random.RandomState(seed)
    rows = []
    for pos in POS:
        for k in range(6):
            for T in seasons:
                for w in range(1, 5):
                    pts = float(rng.uniform(2, 25))
                    big = T > 2020
                    off = (lambda s: 10.0 + abs(s)) if big else (lambda s: s)
                    rows.append(dict(pid="%s%d" % (pos, k), S=T, T=T, w=w, position=pos, relevant=bool(rng.rand() < 0.8), played=bool(rng.rand() < 0.85), pts=pts,
                                     std=pts + off(rng.normal(0, 4)), b1cw=(pts + off(rng.normal(0, 4))) if rng.rand() < 0.75 else np.nan,
                                     h=pts + off(rng.normal(0, 3)), g=pts + off(rng.normal(0, 5)), h_p=0.8, g_p=0.8))
    return pd.DataFrame(rows)


class TestLabelWiring(unittest.TestCase):
    """T-B-14. Fails if QB or TE gain labels, uncovered rows are scored, or a season outside `folds` is pooled."""

    folds = (2019, 2020)

    def setUp(self):
        self.wk = make_wk()
        late = self.wk[self.wk["T"] == 2021]
        self.assertTrue(len(late) and (np.abs(late[["std", "h", "g"]].sub(late["pts"], axis=0)).min().min() >= 10), "Fact: folds = (2019, 2020) and the 2021 errors are at least 10")

    def hand(self, cand, pos, bench):
        d = self.wk[(self.wk["T"].isin(self.folds)) & (self.wk["position"] == pos)].reset_index(drop=True)
        rows = d[d["relevant"] & d["played"]]
        col = "std" if bench == "STD" else "b1cw"
        if bench == "B1c":
            rows = rows[rows[col].notna()]
        rs = bs.Resampler(d["pid"], B=80)
        f = rows["T"].map({2019: 0, 2020: 1}).to_numpy()
        pi = rs.idx(rows["pid"])
        gid = {k: i for i, k in enumerate(sorted(set(zip(d["T"], d["w"]))))}
        g = np.array([gid[k] for k in zip(rows["T"], rows["w"])])
        gf = np.array([0 if k[0] == 2019 else 1 for k in sorted(gid)])
        ec, eb = (rows[cand] - rows["pts"]).to_numpy(), (rows[col] - rows["pts"]).to_numpy()
        dd = M.diff_pooled(np.abs(ec), np.abs(eb), f, 2, rs, pi)
        bm = M.mae_pooled(eb, f, 2, rs, pi)
        sc = M.spearman_weekly(rows[cand].to_numpy(), rows["pts"].to_numpy(), g, gf, 2, rs, pidx=pi)
        sb = M.spearman_weekly(rows[col].to_numpy(), rows["pts"].to_numpy(), g, gf, 2, rs, pidx=pi)
        return len(rows), dd, bm, M.label(dd["value"], dd["ci"], bm["value"], bs.ci95(sc["boot"] - sb["boot"]))

    def test_labels_equal_the_metrics_arithmetic(self):
        res = evaluate_w.labels(self.wk, self.folds, B=80)
        for cand in ("h", "g"):
            for pos in POS:
                for bench in ("STD", "B1c"):
                    n, dd, bm, lab = self.hand(cand, pos, bench)
                    x = res[cand][pos][bench]
                    self.assertEqual((x["n"], x["label"]), (n, lab), (cand, pos, bench))
                    self.assertAlmostEqual(x["d"]["value"], dd["value"], places=12)
                    self.assertAlmostEqual(x["benchMae"]["value"], bm["value"], places=12)
                    self.assertAlmostEqual(x["pct"], -dd["value"] / bm["value"], places=12)
        self.assertLess(res["h"]["QB"]["B1c"]["n"], res["h"]["QB"]["STD"]["n"], "B1c rows need a b1cw value")

    def test_status_gate_and_printing(self):
        res = evaluate_w.labels(self.wk, self.folds, B=80)
        for cand in ("h", "g"):
            self.assertEqual([res[cand][p]["status"] for p in POS], ["report-only", "labelled", "labelled", "report-only"])
            self.assertIsNone(res[cand]["QB"]["passes"])
            self.assertIn(res[cand]["RB"]["passes"], (True, False))
        text = "\n".join(report_s2b.label_lines(res))
        for line in text.splitlines():
            if line.startswith("| QB") or line.startswith("| TE"):
                self.assertIn("report-only", line)
            if line.startswith("| RB") or line.startswith("| WR"):
                self.assertIn("labelled", line)
                self.assertNotIn("report-only", line)
        self.assertIn("overall weekly gate (3 of 4)", text)
        self.assertIn("expected to fail by construction; not the product decision", text)
        self.assertIn("unconfirmed", text)

    def test_a_null_candidate_value_raises(self):
        wk = self.wk.copy()
        wk.loc[wk.index[0], "g"] = np.nan
        with self.assertRaises(ValueError):
            evaluate_w.labels(wk, self.folds, B=20)

    def test_a_single_fold_runs(self):
        wk = make_wk(seasons=(2018,))
        res = evaluate_w.labels(wk, (2018,), B=40)
        self.assertEqual(res["folds"], [2018])
        self.assertIn(res["h"]["RB"]["STD"]["label"], ("beats", "loses", "no-difference"))


if __name__ == "__main__":
    unittest.main()
