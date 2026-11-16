"""LP-2a (§10): evaluation of the two season candidates on explicit `folds` (development folds only; the 2025 fold is held, R1). The
labels come from `lp/metrics.py` unchanged under LP-1a §8; every label here is UNCONFIRMED."""
import numpy as np
import pandas as pd

from . import baselines, bootstrap as bs, metrics as M
from .baselines import POSITIONS
from .report import _metric, _num, season_set_mask

CANDS = ("h", "g")
SETS = ("headline", "V", "N", "deep")
RIDGE_ROWS = {"headline": None}
UNCONFIRMED = "unconfirmed — the 2025 fold is held (R1)"


def build_frame(tables, folds, cand_totals):
    """`sf` = season_forecasts for T in folds + one total column per candidate merged on (pid, T). A null candidate value on any universe
    row is a hard stop; rows of any season outside `folds` are dropped."""
    sf = pd.concat([baselines.season_forecasts(tables, T) for T in folds], ignore_index=True)
    sf = sf[sf["T"].isin(folds)]
    for col, df in cand_totals.items():
        d = df[df["T"].isin(folds)][["pid", "T", "total"]].rename(columns={"total": col})
        sf = sf.merge(d, on=["pid", "T"], how="left")
        if sf[col].isna().any():
            raise ValueError("candidate %s has %d null values on universe rows" % (col, int(sf[col].isna().sum())))
    return sf.reset_index(drop=True)


def _rows(df, kind):
    """Rows a gate benchmark is judged on: headline rows. B2 → stratum V (b2 non-null, asserted); B1c → B1-covered with b1c non-null."""
    h = df[df["headline"]]
    if kind == "B2":
        r = h[h["stratum"] == "V"]
        if r["b2"].isna().any():
            raise AssertionError("a stratum-V row has no B2 value")
        return r
    if kind == "B1c":
        return h[h["b1_covered"] & h["b1c"].notna()]
    raise KeyError(kind)


def compare(rows, cand, bench, folds, rs, label=False):
    """Paired comparison of column `cand` against column `bench` on identical rows (MAE difference d, rank difference, arithmetic label)."""
    nf = len(folds)
    f = rows["T"].map({T: i for i, T in enumerate(folds)}).to_numpy()
    pi = rs.idx(rows["pid"])
    act = rows["actual"].to_numpy()
    ec, eb = (rows[cand] - rows["actual"]).to_numpy(), (rows[bench] - rows["actual"]).to_numpy()
    d = M.diff_pooled(np.abs(ec), np.abs(eb), f, nf, rs, pi)
    bm = M.mae_pooled(eb, f, nf, rs, pi)
    sc = M.spearman_pooled(rows[cand].to_numpy(), act, f, nf, rs, pidx=pi)
    sb = M.spearman_pooled(rows[bench].to_numpy(), act, f, nf, rs, pidx=pi)
    rank_ci = bs.ci95(sc["boot"] - sb["boot"])
    out = {"n": int(len(rows)), "candMae": _num(np.mean([np.abs(ec)[f == k].mean() for k in range(nf) if (f == k).any()])), "benchMae": _metric(bm),
           "d": _metric(d), "pct": _num(-d["value"] / bm["value"]), "dSpearman": {"value": _num(sc["value"] - sb["value"]), "ci": rank_ci},
           "label": M.label(d["value"], d["ci"], bm["value"], rank_ci)}
    if len(folds) >= 3:
        pf, bf = rs.per_fold_mean(np.abs(ec) - np.abs(eb), f, nf, pi)
        out["dByFold"] = {str(T): _num(pf[i]) for i, T in enumerate(folds)}
        out["dSlope"] = {"value": _num(bs.slope(list(folds), pf)), "ci": bs.ci95(bs.slope(list(folds), bf))}
    return out


def _stats(rows, col, folds, rs):
    nf = len(folds)
    f = rows["T"].map({T: i for i, T in enumerate(folds)}).to_numpy()
    pi = rs.idx(rows["pid"])
    err = (rows[col] - rows["actual"]).to_numpy()
    e = {"n": int(len(rows)), "mae": _metric(M.mae_pooled(err, f, nf, rs, pi)), "bias": _metric(M.signed_pooled(err, f, nf, rs, pi)),
         "spearman": _metric(M.spearman_pooled(rows[col].to_numpy(), rows["actual"].to_numpy(), f, nf, rs, pidx=pi))}
    pf, bf = rs.per_fold_mean(np.abs(err), f, nf, pi)
    e["maeByFold"] = {str(T): _num(pf[i]) for i, T in enumerate(folds)}
    e["drift"] = M.drift(pf, bf, list(folds)) if (nf >= 3 and np.isfinite(pf).all()) else None
    return e


def evaluate(sf, folds, B=bs.B_DEFAULT, details=None, arms=None, comps=None, actual_keys=None):
    """All of §10.2-§10.4. `details[cand][T][pos]` = the fold driver's details; `arms[(cand, pos, arm)]` = frames (pid, T, total);
    `comps[cand]` = the composed frames with share/games/ppg/kv_*."""
    folds = tuple(folds)
    sf = sf[sf["T"].isin(folds)].reset_index(drop=True)            # rows of any other season are dropped (the 2025 fold is held)
    for col in CANDS:
        if col in sf.columns and sf[col].isna().any():
            raise ValueError("candidate %s has %d null values on universe rows" % (col, int(sf[col].isna().sum())))
    out = {"folds": list(folds), "resamples": B, "seed": bs.SEED, "confirmation": UNCONFIRMED}
    for pos in POSITIONS:
        d = sf[sf["position"] == pos].reset_index(drop=True)
        rs = bs.Resampler(d["pid"], B=B, seed=bs.SEED)
        res = {}
        for cand in CANDS:
            if cand not in d.columns:
                continue
            c = {"labels": {}, "gate": {}, "reportOnly": {}, "sets": {}}
            for bname in ("B2", "B1c"):
                c["labels"][bname] = compare(_rows(d, bname), cand, "b2" if bname == "B2" else "b1c", folds, rs, True)
            for sname in SETS:
                ds = d[season_set_mask(d, sname)]
                c["sets"][sname] = _stats(ds, cand, folds, rs) if len(ds) else None
                c["reportOnly"][sname] = {}
                for bname, col in (("RIDGE", "ridge"), ("B1", "b1"), ("B2", "b2"), ("B1c", "b1c"), ("STD", None)):
                    if col is None:
                        continue
                    rows = ds[ds[col].notna() & ds[cand].notna()]
                    if bname in ("B1", "B1c"):
                        rows = rows[rows["b1_covered"]]
                    if len(rows):
                        c["reportOnly"][sname][bname] = compare(rows, cand, col, folds, rs)
            if comps is not None and cand in comps:
                c["components"] = _components(comps[cand], d, actual_keys, pos)
            if details is not None and cand in details:
                c["chosen"] = {str(T): details[cand][T][pos] for T in folds if T in details[cand]}
            if arms:
                c["arms"] = {}
                h = d[d["headline"]]
                for (ac, apos, an), fr in arms.items():
                    if ac != cand or apos != pos:
                        continue
                    m = h[["pid", "T", "actual", cand]].merge(fr.rename(columns={"total": "arm"}), on=["pid", "T"], how="inner")
                    if len(m):
                        c["arms"][an] = _arm(m, cand, folds, rs)
            res[cand] = c
        if "h" in d.columns and "g" in d.columns:
            h = d[d["headline"]]
            res["H_minus_G"] = compare(h, "h", "g", folds, rs)
        out[pos] = res
    out["gateProvisional"] = {c: M.gate({pos: {"B2": out[pos][c]["labels"]["B2"]["label"], "B1c": out[pos][c]["labels"]["B1c"]["label"]} for pos in POSITIONS})
                              for c in CANDS if all(c in out[pos] for pos in POSITIONS)}
    return out


def _arm(m, cand, folds, rs):
    f = m["T"].map({T: i for i, T in enumerate(folds)}).to_numpy()
    pi = rs.idx(m["pid"])
    dd = np.abs(m["arm"] - m["actual"]).to_numpy() - np.abs(m[cand] - m["actual"]).to_numpy()
    r = M.mae_pooled((m["arm"] - m["actual"]).to_numpy(), f, len(folds), rs, pi)
    pt, boot, _ = rs.pooled_mean(dd, f, len(folds), pi)
    return {"n": int(len(m)), "armMae": _metric(r), "changeVsMain": {"value": _num(pt), "ci": bs.ci95(boot)}}


def _components(frame, d, actual_keys, pos):
    """Headline rows of `pos`: MAE of `games` vs gamesPlayed, of `ppg` on rows with >= 1 game, and per key sum(games x predicted per-game
    value) / sum(actual season sum)."""
    h = d[d["headline"]][["pid", "T", "gamesPlayed", "actual"]]
    m = h.merge(frame, on=["pid", "T"], how="inner")
    out = {"n": int(len(m)), "gamesMae": _num(np.abs(m["games"] - m["gamesPlayed"]).mean())}
    g1 = m[m["gamesPlayed"] >= 1]
    out["ppgMae"] = _num(np.abs(g1["ppg"] - g1["actual"] / g1["gamesPlayed"]).mean())
    out["ppgRows"] = int(len(g1))
    if actual_keys is not None:
        a = m.merge(actual_keys, on=["pid", "T"], how="left", suffixes=("", "_act"))
        ratio = {}
        for col in [c for c in frame.columns if c.startswith("kv_")]:
            k = col[3:]
            if k in actual_keys.columns:
                den = float(a[k].fillna(0).sum())
                ratio[k] = _num((a["games"] * a[col]).sum() / den) if den > 0 else None
        out["keyRatio"] = ratio
    return out
