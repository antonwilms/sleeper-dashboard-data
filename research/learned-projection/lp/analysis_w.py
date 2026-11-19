"""LP-2b-1c-i (report-only): pure functions behind the weekly-analysis report — grid edges (§5), error surfaces (§6), override speeds (§7), the paired
comparisons and the exploratory H arms (§8), and the mechanical rule outcomes (§9 0a). NEW and UNHASHED: nothing here is registered, labelled or gated, and no
function reads a cache; the runner (`run_weekly_analysis.py`) loads and hands the data in. No function here calls `metrics.label`, fits a G model or reads 2025."""
import copy
import json

import numpy as np
import pandas as pd

from . import bootstrap as bs
from . import metrics as M
from . import registry, weekly_data, weekly_h, weekly_models
from .report import _metric, _num

POSITIONS = ("QB", "RB", "WR", "TE")
OFF = weekly_h.OFF
BANDS = ("0-3", "4-8", "9+")
EDGE_FOLDS = 4                                 # §5.3: "at an edge in >= 4 of 6 folds"
RS_FOLDS = 4                                   # §6.2 R-S: the edge is chosen and drop > 0 in >= 4 of the 6 folds ...
RS_MEAN = 0.005                                # ... and their mean drop is >= 0.5%
RW_MARGIN = 0.01                               # §8.2 R-W: -d / MAE(H) >= 1%
LEAK_GAIN = 0.12                               # §12: a pooled gain above 12% is a suspected leak
KMULT_EXTRA = (48, 64, 96, 128)                # route (b): the stamped kMultW is extended by these
SWEEP = (0.25, 0.5, 2, 4, 8)                   # route (a): the k scales
WIDE, NOCTX = "h_wide", "h_noctx"
LAMBDA_NS = tuple(range(1, 13))
B1_PLAIN_KINDS = (None, "original", "none")    # §7.2: the QB start chain's preseason / starter / backup states are excluded
EXPLORATORY = "exploratory — not a candidate, no label"

# §5.1: the natural limits of each setting's grid, (low, high); None = that end is a real edge.
LIMITS = {("weekly", "kMult"): (None, None), ("weekly", "rho"): (None, 1.0), ("weekly", "alpha"): (None, OFF), ("weekly", "phi"): (0, 1.0),
          ("season", "alpha"): (None, None), ("season", "kmult"): (0, None), ("season", "delta"): (None, 1.0), ("season", "lam"): (0, None)}
EDGE_CLASSES = ("edge-low", "edge-high")
F4_SENTENCE = ("The season layer's α / k-multiple / δ training errors are not recorded (`model_h.fit_target` keeps only the argmin; no season fits cache), so whether error "
               "was still falling at those edges cannot be judged without a refit — open for Anton.")
R3_WAIT = "LP-2b-2 planning waits on Anton's ruling on the unrecorded season α / k-multiple / δ edges (§3.1)"
R4_RULING = ("Gating a third weekly candidate or re-registering needs a ruling by Anton (LP-1a §8: at most two candidates, H and G, may be gated, and there is no re-registration "
             "path), and any setting chosen from these development-fold numbers has been selected on them.")


# ── §5 grid edges ───────────────────────────────────────────────────────────────────────────────────────────
def _pos(v, grid):
    """Index of `v` in the ordered `grid` (numbers compare by value; the string "off" by equality)."""
    for i, g in enumerate(grid):
        if isinstance(v, str) or isinstance(g, str):
            if isinstance(v, str) and isinstance(g, str) and v == g:
                return i
        elif float(v) == float(g):
            return i
    raise ValueError("%r is not in the grid %r" % (v, grid))


def _is(a, b):
    if a is None or b is None:
        return False
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return float(a) == float(b)


def edge_class(v, grid, limits=(None, None)):
    """`interior`, `edge-low` / `edge-high` (the grid's first / last element, not a natural limit) or `limit-low` / `limit-high` (a natural limit)."""
    i = _pos(v, grid)
    if i == 0:
        return "limit-low" if _is(grid[0], limits[0]) else "edge-low"
    if i == len(grid) - 1:
        return "limit-high" if _is(grid[-1], limits[1]) else "edge-high"
    return "interior"


def _row(cand, layer, T, pos, target, setting, value, grid, cls):
    return {"cand": cand, "layer": layer, "T": int(T), "pos": pos, "target": target, "setting": setting, "value": value, "grid": list(grid) if grid is not None else None, "cls": cls}


def _season_rows(art, sspec, cands, folds, positions):
    out = []
    for cand in cands:
        sp = sspec[cand]
        lams = sorted(set(e["lam"] for e in sp["grid"]))
        for P in positions:
            for T in folds:
                ch = art["results"][P][cand]["chosen"][str(T)]
                ent = ch["entry"]
                out.append(_row(cand, "season", T, P, None, "era", ent["era"], None, "n/a"))
                if "g" in ent:
                    out.append(_row(cand, "season", T, P, None, "g", ent["g"], None, "n/a"))
                cls = "two-point" if len(lams) == 2 else edge_class(ent["lam"], lams, LIMITS[("season", "lam")])
                out.append(_row(cand, "season", T, P, None, "lam", ent["lam"], lams, cls))
                if cand == "h":
                    for t, prm in ch["params"].items():
                        for key, gk, sk in (("alpha", "alphas", "alpha"), ("kmult", "kMult", "kmult"), ("delta", "deltas", "delta")):
                            out.append(_row(cand, "season", T, P, t, key, prm[key], sp[gk], edge_class(prm[key], sp[gk], LIMITS[("season", sk)])))
    return out


def _weekly_rows(fits, wspec):
    out = []
    for (cand, T), f in sorted(fits.items()):
        sp = wspec[cand]
        for P in POSITIONS:
            pf = f.pos.get(P)
            if pf is None:
                continue
            out.append(_row(cand, "weekly", T, P, None, "phi", pf.phi, sp["phis"], edge_class(pf.phi, sp["phis"], LIMITS[("weekly", "phi")])))
            if cand != "h":
                continue
            for t, info in pf.targets.items():
                out.append(_row(cand, "weekly", T, P, t, "kMult", info["kMult"], sp["kMultW"], edge_class(info["kMult"], sp["kMultW"], LIMITS[("weekly", "kMult")])))
                out.append(_row(cand, "weekly", T, P, t, "rho", info["rho"], sp["rhos"], edge_class(info["rho"], sp["rhos"], LIMITS[("weekly", "rho")])))
                if info["alpha"] is None:                                   # hContext False: no context term at all
                    continue
                cls = "default" if info.get("alphaSse") is None else edge_class(info["alpha"], sp["ctxAlphas"], LIMITS[("weekly", "alpha")])
                out.append(_row(cand, "weekly", T, P, t, "alpha", info["alpha"], sp["ctxAlphas"], cls))
    return out


def grid_edges(fits, art_2a, wspec, sspec, folds, cands=("h", "g"), positions=POSITIONS, min_folds=EDGE_FOLDS):
    """Every chosen setting with its grid and class, a per-(cand, layer, setting, position) class share, and the targets at an edge in >= `min_folds` folds.
    A weekly alpha that is `default` (a fold with fewer than 2 training seasons) is not a fitted choice: it is left out of the shares and the list."""
    rows = _weekly_rows(fits, wspec) + _season_rows(art_2a, sspec, cands, folds, positions)
    groups = {}
    for r in rows:
        groups.setdefault((r["cand"], r["layer"], r["setting"], r["pos"]), []).append(r)
    shares = []
    for (cand, layer, setting, P), rs in sorted(groups.items()):
        fitted = [r for r in rs if r["cls"] != "default"]
        cnt = {}
        for r in fitted:
            cnt[r["cls"]] = cnt.get(r["cls"], 0) + 1
        shares.append({"cand": cand, "layer": layer, "setting": setting, "pos": P, "cells": len(fitted), "defaultCells": len(rs) - len(fitted), "counts": cnt,
                       "share": {k: v / len(fitted) for k, v in cnt.items()} if fitted else {}})
    byt = {}
    for r in rows:
        if r["cls"] in EDGE_CLASSES:
            byt.setdefault((r["cand"], r["layer"], r["setting"], r["pos"], r["target"]), []).append(r)
    often = [{"cand": c, "layer": l, "setting": s, "pos": P, "target": t, "folds": len(v), "ends": sorted(set(x["cls"] for x in v))}
             for (c, l, s, P, t), v in sorted(byt.items(), key=lambda kv: tuple(str(x) for x in kv[0])) if len(v) >= min_folds]
    return {"rows": rows, "shares": shares, "atEdgeInAtLeast%dFolds" % min_folds: often, "gNote": "G's weekly layer is a fixed point model: no fitted grid (phi only)"}


# ── §6 error surfaces ───────────────────────────────────────────────────────────────────────────────────────
def weekly_surface(fits, spec):
    """For each (T, P, target) of the cached H fits whose kMult or rho is at an EDGE (not a limit): the last-step drop along that axis, the other axis held at
    its chosen index, drop = (SSE[neighbour] - SSE[edge]) / SSE[edge] (kMult rows of `gridSse`, rho columns). Plus the median per (P, axis, end)."""
    kms, rhos = list(spec["kMultW"]), list(spec["rhos"])
    rows = []
    for (cand, T), f in sorted(fits.items()):
        if cand != "h":
            continue
        for P in POSITIONS:
            pf = f.pos.get(P)
            if pf is None:
                continue
            for t, info in pf.targets.items():
                sse = np.asarray(info["gridSse"], float)
                ik, ir = _pos(info["kMult"], kms), int(info["rhoIdx"])
                ck = edge_class(info["kMult"], kms, LIMITS[("weekly", "kMult")])
                cr = edge_class(info["rho"], rhos, LIMITS[("weekly", "rho")])
                if ck in EDGE_CLASSES:
                    nb = ik - 1 if ck == "edge-high" else ik + 1
                    rows.append({"T": int(T), "pos": P, "target": t, "axis": "kMult", "end": ck[5:], "edge": kms[ik], "neighbour": kms[nb], "sseEdge": float(sse[ik, ir]),
                                 "sseNeighbour": float(sse[nb, ir]), "drop": float((sse[nb, ir] - sse[ik, ir]) / sse[ik, ir])})
                if cr in EDGE_CLASSES:
                    nb = ir - 1 if cr == "edge-high" else ir + 1
                    rows.append({"T": int(T), "pos": P, "target": t, "axis": "rho", "end": cr[5:], "edge": rhos[ir], "neighbour": rhos[nb], "sseEdge": float(sse[ik, ir]),
                                 "sseNeighbour": float(sse[ik, nb]), "drop": float((sse[ik, nb] - sse[ik, ir]) / sse[ik, ir])})
    med = {}
    for r in rows:
        med.setdefault((r["pos"], r["axis"], r["end"]), []).append(r["drop"])
    medians = [{"pos": P, "axis": a, "end": e, "n": len(v), "median": float(np.median(v)), "min": float(min(v)), "max": float(max(v))} for (P, a, e), v in sorted(med.items())]
    return {"rows": rows, "medians": medians}


def season_surface(art_2a, sspec, folds, cands=("h", "g"), positions=POSITIONS):
    """From the 2a artifact's `innerMae` (every grid entry's inner-season MAE, in grid order): at the chosen (era, g), the lambda profile; when the chosen
    lambda is the grid's highest, drop = (MAE(next lower lambda) - MAE(edge)) / MAE(edge). Rows for every (cand, P, T)."""
    rows = []
    for cand in cands:
        grid = sspec[cand]["grid"]
        lams = sorted(set(e["lam"] for e in grid))
        for P in positions:
            for T in folds:
                ch = art_2a["results"][P][cand]["chosen"][str(T)]
                ent, inner = ch["entry"], ch["innerMae"]
                if len(inner) != len(grid):
                    raise ValueError("innerMae has %d values, the grid %d entries" % (len(inner), len(grid)))
                if ent not in grid:
                    raise ValueError("the chosen entry %r is not in the grid" % (ent,))

                def mae(lam, ent=ent, grid=grid, inner=inner):
                    probe = {**ent, "lam": lam}
                    return float(inner[grid.index(probe)])
                profile = {str(lam): mae(lam) for lam in lams}
                edge = bool(ent["lam"] == lams[-1])
                drop = float((mae(lams[-2]) - mae(lams[-1])) / mae(lams[-1])) if edge else None
                rows.append({"cand": cand, "pos": P, "T": int(T), "era": ent["era"], "g": ent.get("g"), "lam": ent["lam"], "edgeChosen": edge, "drop": drop, "profile": profile})
    return rows


def season_rs(rows, min_folds=RS_FOLDS, min_mean=RS_MEAN):
    """R-S (stated before the run): "still clearly falling" at (P, cand) = the edge is chosen with drop > 0 in >= `min_folds` folds AND the mean drop over those
    folds is >= `min_mean`."""
    out = {}
    for r in rows:
        out.setdefault((r["pos"], r["cand"]), []).append(r)
    res = []
    for (P, cand), rs in sorted(out.items()):
        q = [r for r in rs if r["edgeChosen"] and r["drop"] is not None and r["drop"] > 0]
        mean = float(np.mean([r["drop"] for r in q])) if q else None
        res.append({"pos": P, "cand": cand, "foldsEdgeAndFalling": len(q), "meanDrop": mean, "folds": len(rs), "holds": bool(len(q) >= min_folds and mean is not None and mean >= min_mean)})
    return res


def rs_stop_lines(rs):
    """The reporting stop: printed when R-S holds at RB or WR for either candidate. The run continues."""
    return ["STOP for Anton before LP-2b-2 is planned: the season λ surface is still falling at the edge (%s, %s)" % (r["pos"], r["cand"].upper())
            for r in rs if r["holds"] and r["pos"] in ("RB", "WR")]


# ── §7 override speeds ──────────────────────────────────────────────────────────────────────────────────────
def target_class(P, name, targets):
    """volume (`pg` with `role` opp), efficiency (`po`), other (any other `pg`); `targets` is the season spec's per-position target list."""
    for t in targets[P]:
        if t["name"] == name:
            if t["kind"] == "pg" and t.get("role") == "opp":
                return "volume"
            return "efficiency" if t["kind"] == "po" else "other"
    raise KeyError("%s %s is not a target" % (P, name))


def override_targets(fits, targets, constants, spec):
    """Per (P, target): H's kGames over the folds (median, range, the share at the grid's top edge) beside the app's K_ROS_POINTS[P] and K_ROS_OPP[P]."""
    top = max(spec["kMultW"])
    byt = {}
    for (cand, T), f in sorted(fits.items()):
        if cand != "h":
            continue
        for P, pf in f.pos.items():
            for t, info in pf.targets.items():
                byt.setdefault((P, t), []).append((int(T), float(info["kGames"]), float(info["kMult"])))
    out = []
    for (P, t), v in sorted(byt.items(), key=lambda kv: (POSITIONS.index(kv[0][0]), kv[0][1])):
        kg = [x[1] for x in v]
        out.append({"pos": P, "target": t, "class": target_class(P, t, targets), "folds": len(v), "median": float(np.median(kg)), "min": float(min(kg)), "max": float(max(kg)),
                    "shareAtTop": float(np.mean([x[2] == top for x in v])), "atTop": int(sum(x[2] == top for x in v)), "top": top,
                    "appKRosPoints": constants["K_ROS_POINTS"][P]["k"], "appKRosOpp": constants["K_ROS_OPP"][P]["k"]})
    return out


def lambda_cells(rows, ppg_col, ppg0_col, min_rows=M.MIN_CELL, ns=LAMBDA_NS):
    """The empirical evidence weight per (P, n): rows = relevant played rows (pid, position, n, sum_pts, c_w, `ppg_col`, `ppg0_col`; `c_w` is the fold's calibration of the
    row's position). m = sum_pts / n, x = m / c_w (`ppg` is pre-calibration); on rows with n >= 1 and |x - ppg0| >= 1, lambda(n) = sum (ppg - ppg0)(x - ppg0) /
    sum (x - ppg0)^2 — the least-squares slope through the origin. Returns {(P, n): {"lambda", "rows", "players", "status", "idx"}} (`idx`: the positions in `rows` of the cell's filtered rows); a cell under `min_rows` rows is
    INSUFFICIENT (no value)."""
    d = rows[rows["n"] >= 1].copy()
    d["_i"] = np.flatnonzero((rows["n"] >= 1).to_numpy(bool))
    d["x"] = (d["sum_pts"].to_numpy(float) / d["n"].to_numpy(float)) / d["c_w"].to_numpy(float)
    d["dx"] = d["x"] - d[ppg0_col]
    d = d[d["dx"].abs() >= 1.0]
    out = {}
    for P in POSITIONS:
        for n in ns:
            c = d[(d["position"] == P) & (d["n"] == n)]
            num = float(((c[ppg_col] - c[ppg0_col]) * c["dx"]).sum())
            den = float((c["dx"] ** 2).sum())
            status = M.cell(len(c))
            out[(P, n)] = {"lambda": (num / den if den > 0 and status == "ok" else None), "rows": int(len(c)), "players": int(c["pid"].nunique()), "status": status,
                         "idx": c["_i"].to_numpy(int)}
    return out


def b1_weight(rows, min_rows=M.MIN_CELL):
    """B1's analytic evidence weight: the median of n_b / (n_b + k_b) over the rows whose `kind` is null, "original" or "none" (the QB start chain's
    preseason / starter / backup states carry a different weight and are excluded whatever `liveChain` is). `rows`: nB, kB, kind, population.
    Returns {"lambda", "rows", "excludedShare", "population"}."""
    kind = rows["kind"].astype(object).where(rows["kind"].notna(), None)
    plain = kind.map(lambda v: v in B1_PLAIN_KINDS).to_numpy(bool)
    nb_all, kb_all = rows["nB"].to_numpy(float), rows["kB"].to_numpy(float)
    ok = np.isfinite(nb_all) & np.isfinite(kb_all) & ((nb_all + kb_all) > 0)
    r = rows[plain & ok]
    missing = int((plain & ~(np.isfinite(nb_all) & np.isfinite(kb_all))).sum())
    nb, kb = r["nB"].to_numpy(float), r["kB"].to_numpy(float)
    lam = float(np.median(nb / (nb + kb))) if len(r) else None
    pop = r["population"].value_counts(normalize=True).to_dict() if len(r) else {}
    return {"lambda": lam, "rows": int(len(r)), "b1Missing": missing, "status": "ok" if len(r) else "no-b1-rows",
            "excludedShare": float(1 - len(r) / len(rows)) if len(rows) else None, "population": {str(k): float(v) for k, v in pop.items()}}


def override_levels(rows, ppg_h, ppg0_h, ppg_nc, ppg0_nc, ns=LAMBDA_NS):
    """§7.2 per (P, n): lambda_H (registered H), lambda_H,nc (the shrinkage path alone), lambda_B1 (analytic) and the row / player counts. `rows`: the relevant played
    rows carrying the columns named above plus pid, position, n, sum_pts, c_w, nB, kB, kind, population."""
    a = lambda_cells(rows, ppg_h, ppg0_h, ns=ns)
    b = lambda_cells(rows, ppg_nc, ppg0_nc, ns=ns)
    out = []
    for P in POSITIONS:
        for n in ns:
            bw = b1_weight(rows.iloc[a[(P, n)]["idx"]])
            out.append({"pos": P, "n": n, "lambdaH": a[(P, n)]["lambda"], "lambdaHnc": b[(P, n)]["lambda"], "rows": a[(P, n)]["rows"], "players": a[(P, n)]["players"],
                        "status": a[(P, n)]["status"], "lambdaB1": bw["lambda"], "b1Rows": bw["rows"], "b1Missing": bw["b1Missing"], "b1Status": bw["status"], "b1ExcludedShare": bw["excludedShare"], "population": bw["population"]})
    return out


# ── §8 comparisons ──────────────────────────────────────────────────────────────────────────────────────────
def band_of(w):
    """The week band by origin n = w - 1: 0-3, 4-8, 9+."""
    n = np.asarray(w, int) - 1
    return np.where(n <= 3, BANDS[0], np.where(n <= 8, BANDS[1], BANDS[2]))


def paired(wk, a, b, rows_mask, folds, B, positions=POSITIONS):
    """COPY of the per-(c, bench) block of `evaluate_w.labels` — without `M.label`. Per position: the resampler is built on ALL rows of the position in `folds`, the group
    ids run over the sorted (T, w) of all those rows; the comparison rows are the relevant played rows where `b` is non-null and `rows_mask(d)` (a boolean over the position
    frame) holds. Returns {P: {n, aMae, bMae, d, pct, dSpearman, perFold, drift}} for column `a` against column `b` (d = MAE(a) - MAE(b))."""
    folds = tuple(folds)
    nf = len(folds)
    wk = wk[wk["T"].isin(folds)].reset_index(drop=True)
    fidx = {T: i for i, T in enumerate(folds)}
    out = {}
    for pos in positions:
        d = wk[wk["position"] == pos].reset_index(drop=True)
        if not len(d):
            continue
        rs = bs.Resampler(d["pid"], B=B, seed=bs.SEED)
        gid = {k: i for i, k in enumerate(sorted(set(zip(d["T"], d["w"]))))}
        d["_g"] = [gid[k] for k in zip(d["T"], d["w"])]
        g_fold = np.zeros(len(gid), int)
        for (T, _w), i in gid.items():
            g_fold[i] = fidx[T]
        keep = d["relevant"].astype(bool) & d["played"].astype(bool) & d[b].notna() & np.asarray(rows_mask(d), bool)
        rows = d[keep]
        if not len(rows):
            continue
        f, pi = rows["T"].map(fidx).to_numpy(), rs.idx(rows["pid"])
        y = rows["pts"].to_numpy(float)
        ea, eb = (rows[a] - rows["pts"]).to_numpy(float), (rows[b] - rows["pts"]).to_numpy(float)
        dd = M.diff_pooled(np.abs(ea), np.abs(eb), f, nf, rs, pi)
        bm = M.mae_pooled(eb, f, nf, rs, pi)
        am = M.mae_pooled(ea, f, nf, rs, pi)
        g = rows["_g"].to_numpy()
        sa = M.spearman_weekly(rows[a].to_numpy(float), y, g, g_fold, nf, rs, pidx=pi)
        sb = M.spearman_weekly(rows[b].to_numpy(float), y, g, g_fold, nf, rs, pidx=pi)
        rank = bs.ci95(sa["boot"] - sb["boot"])
        pf, bf = rs.per_fold_mean(np.abs(ea) - np.abs(eb), f, nf, pi)
        out[pos] = {"n": int(len(rows)), "aMae": _metric(am), "bMae": _metric(bm), "d": _metric(dd), "pct": _num(-dd["value"] / bm["value"]),
                    "dSpearman": {"value": _num(sa["value"] - sb["value"]), "ci": rank},
                    "perFold": {str(T): {"d": _num(pf[i]), "ci": bs.ci95(bf[:, i]) if np.isfinite(bf[:, i]).any() else [None, None]} for i, T in enumerate(folds)},
                    "drift": M.drift(pf, bf, list(folds)) if np.isfinite(pf).all() else None}
    return out


def all_rows(d):
    return np.ones(len(d), bool)


def band_rows(band):
    """A rows_mask restricting the comparison rows to one week band (the resampler universe stays position-wide)."""
    return lambda d: band_of(d["w"]) == band


# ── §8.2 the arms ───────────────────────────────────────────────────────────────────────────────────────────
def fixed_calib(fits):
    """The registered calibration of a cached H `Fits`, as `weekly_models.check_variant` wants it."""
    return {"c_w": {P: fits.pos[P].c_w for P in fits.pos}, "phi": {P: fits.pos[P].phi for P in fits.pos}}


def scale_k(fits, s):
    """Route (a): a `copy.deepcopy` of the H `Fits` with every target's `k` multiplied by `s` at every position; nothing else changes (the cohorts stay as fitted at s = 1)."""
    out = copy.deepcopy(fits)
    for pf in out.pos.values():
        for info in pf.targets.values():
            info["k"] = float(info["k"]) * float(s)
    return out


def widened_spec(spec):
    """Route (b): a deep copy of the stamped H spec with `kMultW` extended by 48, 64, 96 and 128 (ascending); the input is not touched."""
    out = copy.deepcopy(spec)
    out["kMultW"] = list(spec["kMultW"]) + list(KMULT_EXTRA)
    return out


def refit(frame, T, store, spec, rel, hist, fits_cached, extra=None, env=None, env_w=None):
    """H refitted through the REGISTERED fold driver under the cached calibration (`fixedCalib`: no cross-fitting): the held season is guarded first; `extra` adds variant
    keys (e.g. {"hContext": False}). Returns (preds, fits) as `weekly_models.fold_w`."""
    weekly_data.guard(T)
    variant = {**(extra or {}), "fixedCalib": fixed_calib(fits_cached)}
    return weekly_models.fold_w(frame, T, store, "H", spec, rel, hist, variant=variant, env=env, env_w=env_w)


def origin0_ppg(fits, frame_T, hist, store, col="ppg0"):
    """ppg at origin n = 0 for every row of `frame_T`: `origin` must be an array in the frame's row order (a scalar raises at the per-row index)."""
    p = weekly_models.predict_w(fits, frame_T, hist, store, origin=np.zeros(len(frame_T), int))
    return p[["pid", "S", "w", "ppg"]].rename(columns={"ppg": col})


def cohort_counts(fits):
    """Per position: how many targets keep a context cohort."""
    return {P: int(sum(info["cohort"] is not None for info in pf.targets.values())) for P, pf in fits.pos.items()}


def arm_sha(spec_sha, extra):
    """The SHA-256 naming an exploratory arm: json.dumps({"base": specSha256, **extra}, sort_keys=True)."""
    return registry.sha_bytes(json.dumps({"base": spec_sha, **extra}, sort_keys=True).encode("utf-8"))


def sweep_name(s):
    return "h_ks%g" % s


def arm_chosen(fits, top=None):
    """Per (P, target): the chosen kMult, rho, alpha of an H `Fits`, and how many chose a kMult above `top` (default: 32)."""
    top = 32 if top is None else top
    rows = [{"pos": P, "target": t, "kMult": info["kMult"], "rho": info["rho"], "alpha": info["alpha"]} for P, pf in fits.pos.items() for t, info in pf.targets.items()]
    return {"targets": rows, "aboveTop": int(sum(r["kMult"] > top for r in rows))}


def rename_arm(pred, name):
    """The arm's `cond` under its own column name (`predict_w` labels every H arm "h"); a clash with a cached column raises."""
    if name in ("h", "g"):
        raise ValueError("arm name %s clashes with a cached candidate column" % name)
    return pred[["pid", "S", "w", "cond"]].rename(columns={"cond": name})


def r_w(res):
    """R-W: d(arm - H) has its CI entirely below 0 and -d / MAE(H) >= 1% at the position."""
    return bool(res["d"]["ci"][1] < 0 and res["pct"] is not None and res["pct"] >= RW_MARGIN - 1e-12)


def merge_arm(wk, pred, name):
    r = rename_arm(pred, name)
    if name in wk.columns:
        raise ValueError("arm column %s already in the frame" % name)
    return wk.merge(r, on=["pid", "S", "w"], how="left")


def sign_of_ci(ci):
    """'below 0', 'above 0' or 'neither' for a 95% interval."""
    if ci[1] < 0:
        return "below 0"
    if ci[0] > 0:
        return "above 0"
    return "neither"


def leak_check(tables, limit=LEAK_GAIN):
    """§12: every (label, position) whose pooled gain exceeds `limit`. `tables`: {label: {P: paired result}} for the all-folds and the per-band comparisons."""
    return [(lab, P, r["pct"]) for lab, byp in tables.items() for P, r in byp.items() if r["pct"] is not None and r["pct"] > limit]


# ── §9 0a: the mechanical rule outcomes ─────────────────────────────────────────────────────────────────────
def _fmt(r):
    return "d %+.3f [%+.3f, %+.3f], %+.2f%% of MAE(H)" % (r["d"]["value"], r["d"]["ci"][0], r["d"]["ci"][1], -100 * r["pct"] if r["pct"] is not None else float("nan"))


def finding_line(arm, P):
    return "FINDING for Anton: %s beats the registered H at %s on the development folds — exploratory, no substitution, no label" % (arm, P)


def rule_outcomes(arms_vs_h, bands_h_b1c, surf_medians, rs, edge_shares):
    """The §0a lines. `arms_vs_h`: {arm: {P: paired(arm vs H)}} for the sweep arms and route (b); `bands_h_b1c`: {band: {P: paired(h vs b1cw)}};
    `surf_medians`: weekly_surface()["medians"]; `rs`: season_rs(); `edge_shares`: grid_edges()["shares"]."""
    L = []
    below = [sweep_name(s) for s in SWEEP if s < 1]
    above = [sweep_name(s) for s in SWEEP if s > 1] + [WIDE]
    rw = {(a, P): r_w(r) for a, byp in arms_vs_h.items() for P, r in byp.items()}
    L.append("R1 (override speed):")
    for P in POSITIONS:
        said = False
        for a in below:
            if rw.get((a, P)):
                L.append("  %s: slow override costs accuracy at %s (%s: %s)" % (P, P, a, _fmt(arms_vs_h[a][P])))
                said = True
        for a in above:
            if rw.get((a, P)):
                L.append("  %s: override is too fast / the grid too narrow at %s (%s: %s)" % (P, P, a, _fmt(arms_vs_h[a][P])))
                said = True
        if not said:
            L.append("  %s: override speed does not explain the tie at %s" % (P, P))
    for P in POSITIONS:
        cells = [(b, bands_h_b1c[b][P]) for b in BANDS if P in bands_h_b1c.get(b, {})]
        if not cells:
            continue
        big = max(cells, key=lambda c: abs(c[1]["d"]["value"]))[0]
        L.append("  %s H − B1c by band: %s; the largest |d| is in band %s" % (P, "; ".join("%s %s (d %+.3f)" % (b, sign_of_ci(r["d"]["ci"]), r["d"]["value"]) for b, r in cells), big))
    L.append("R2 (edges):")
    for P in POSITIONS:
        r = arms_vs_h.get(WIDE, {}).get(P)
        if r is not None:
            L.append("  route (b), widened k grid, at %s: R-W %s (%s)" % (P, "holds" if r_w(r) else "does not hold", _fmt(r)))
    for m in surf_medians:
        L.append("  weekly H %s %s-edge, last-step SSE drop at %s: median %.4f over %d target-folds" % (m["axis"], m["end"], m["pos"], m["median"], m["n"]))
    for x in rs:
        L.append("  R-S season λ, %s %s: %s (%d of %d folds at the edge and falling; mean drop %s)" % (
            x["pos"], x["cand"].upper(), "holds" if x["holds"] else "does not hold", x["foldsEdgeAndFalling"], x["folds"], "—" if x["meanDrop"] is None else "%.3f%%" % (100 * x["meanDrop"])))
    L += ["  " + s for s in rs_stop_lines(rs)]
    L.append("  " + F4_SENTENCE)
    L.append("R3 (LP-2b-2):")
    L.append("  " + R3_WAIT)
    for s in edge_shares:
        if s["layer"] == "season" and s["pos"] in ("RB", "WR") and s["cand"] == "h" and s["setting"] in ("alpha", "kmult", "delta"):
            edge = sum(v for k, v in s["share"].items() if k in EDGE_CLASSES)
            L.append("  season H %s at %s: %.0f%% of target-folds at an edge (%s)" % (s["setting"], s["pos"], 100 * edge, ", ".join("%s %.0f%%" % (k, 100 * v) for k, v in sorted(s["share"].items()))))
    if rs_stop_lines(rs):
        L.append("  and the season λ surface is still falling at the edge (R-S)")
    L.append("R4 (new candidate):")
    hits = [(a, P) for (a, P), v in sorted(rw.items()) if v and P in ("RB", "WR")]
    if hits:
        for a, P in hits:
            L.append("  a candidate change is indicated at %s: %s" % (P, a))
    else:
        L.append("  no candidate change is indicated")
    L.append("  " + R4_RULING)
    for (a, P), v in sorted(rw.items()):
        if v:
            L.append(finding_line(a, P))
    return L
