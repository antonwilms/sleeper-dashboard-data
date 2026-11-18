"""LP-2b-1b (§9): the weekly labels of the two candidates on explicit `folds` (development folds only; the 2025 fold is held). LP-1a §8's arithmetic
through `lp/metrics.py` UNCHANGED under the same `preregHash`; every label is UNCONFIRMED. RB and WR are labelled (Anton, 2026-11-16); QB and TE
report the same numbers as report-only. The overall 3-of-4 weekly gate is computed and printed; it is expected to fail by construction and is not the
product decision."""
import numpy as np

from . import bootstrap as bs
from . import metrics as M
from .report import _metric, _num

POSITIONS = ("QB", "RB", "WR", "TE")
LABELLED = ("RB", "WR")
CANDS = ("h", "g")
BENCHES = (("STD", "std"), ("B1c", "b1cw"))
UNCONFIRMED_W = "unconfirmed — the 2025 fold is held"
RULE_DATE = "2026-11-16"


def labels(wk, folds, B=bs.B_DEFAULT):
    """`wk`: the concatenated `weekly_forecasts` test frames (columns pid, S, w, position, T, relevant, played, pts, std, b1cw) merged on (pid, S, w) with
    the candidates' predictions `h`, `g` (conditional points) and `h_p`, `g_p`. Rows of a season outside `folds` are dropped first; a null `h` or `g`
    raises. Per candidate and position: the label against STD (relevant, played rows) and B1c (the same rows with `b1cw` non-null)."""
    folds = tuple(folds)
    nf = len(folds)
    wk = wk[wk["T"].isin(folds)].reset_index(drop=True)
    for c in CANDS:
        if c not in wk.columns:
            raise KeyError("candidate column %s is missing" % c)
        if wk[c].isna().any():
            raise ValueError("candidate %s has %d null values" % (c, int(wk[c].isna().sum())))
    fidx = {T: i for i, T in enumerate(folds)}
    out = {"folds": list(folds), "resamples": B, "seed": bs.SEED, "confirmation": UNCONFIRMED_W}
    for c in CANDS:
        out[c] = {}
    for pos in POSITIONS:
        d = wk[wk["position"] == pos].reset_index(drop=True)
        if not len(d):
            continue
        rs = bs.Resampler(d["pid"], B=B, seed=bs.SEED)
        gid = {k: i for i, k in enumerate(sorted(set(zip(d["T"], d["w"]))))}
        d["_g"] = [gid[k] for k in zip(d["T"], d["w"])]
        g_fold = np.zeros(len(gid), int)
        for (T, _w), i in gid.items():
            g_fold[i] = fidx[T]
        base = d[d["relevant"].astype(bool) & d["played"].astype(bool)]
        for c in CANDS:
            res = {}
            for bname, bcol in BENCHES:
                rows = base[base[bcol].notna()] if bname == "B1c" else base
                if not len(rows):
                    continue
                f, pi = rows["T"].map(fidx).to_numpy(), rs.idx(rows["pid"])
                y = rows["pts"].to_numpy(float)
                ec, eb = (rows[c] - rows["pts"]).to_numpy(float), (rows[bcol] - rows["pts"]).to_numpy(float)
                dd = M.diff_pooled(np.abs(ec), np.abs(eb), f, nf, rs, pi)
                bm = M.mae_pooled(eb, f, nf, rs, pi)
                cm = M.mae_pooled(ec, f, nf, rs, pi)
                g = rows["_g"].to_numpy()
                sc = M.spearman_weekly(rows[c].to_numpy(float), y, g, g_fold, nf, rs, pidx=pi)
                sb = M.spearman_weekly(rows[bcol].to_numpy(float), y, g, g_fold, nf, rs, pidx=pi)
                rank = bs.ci95(sc["boot"] - sb["boot"])
                res[bname] = {"n": int(len(rows)), "candMae": _metric(cm), "benchMae": _metric(bm), "d": _metric(dd), "pct": _num(-dd["value"] / bm["value"]),
                              "dSpearman": {"value": _num(sc["value"] - sb["value"]), "ci": rank}, "label": M.label(dd["value"], dd["ci"], bm["value"], rank)}
            res["status"] = "labelled" if pos in LABELLED else "report-only"
            res["passes"] = all(res[b]["label"] == "beats" for b, _ in BENCHES if b in res) if pos in LABELLED else None
            out[c][pos] = res
    for c in CANDS:
        lab = {pos: {b: out[c][pos][b]["label"] for b, _ in BENCHES if b in out[c][pos]} for pos in POSITIONS if pos in out[c]}
        out[c]["gate"] = bool(M.gate(lab))
        out[c]["labelledPass"] = {pos: out[c][pos]["passes"] for pos in LABELLED if pos in out[c]}
    return out
