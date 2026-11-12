"""Metrics, cohorts and the §8 gate arithmetic (task §5.4, §5.5, §8)."""
import numpy as np

from . import bootstrap as bs

MIN_CELL = 30
BEAT_MARGIN = 0.03


def mae_pooled(err, folds, n_folds, rs, pidx=None):
    point, boot, _ = rs.pooled_mean(np.abs(err), folds, n_folds, pidx)
    return {"value": float(point), "ci": bs.ci95(boot)}


def signed_pooled(err, folds, n_folds, rs, pidx=None):
    point, boot, _ = rs.pooled_mean(err, folds, n_folds, pidx)
    return {"value": float(point), "ci": bs.ci95(boot)}


def diff_pooled(abs_err_model, abs_err_bench, folds, n_folds, rs, pidx=None):
    """d = MAE(model) - MAE(benchmark) on identical rows, pooled equal weight per fold."""
    point, boot, _ = rs.pooled_mean(np.asarray(abs_err_model, float) - np.asarray(abs_err_bench, float), folds, n_folds, pidx)
    return {"value": float(point), "ci": bs.ci95(boot), "boot": boot}


def spearman_pooled(pred, actual, folds, n_folds, rs, min_rows=8, pidx=None):
    """Season layer: Spearman per fold, equal weight across folds."""
    point, boot = rs.group_spearman(pred, actual, folds, n_folds, min_rows, pidx)
    return {"value": float(np.nanmean(point)), "ci": bs.ci95(np.nanmean(boot, axis=1)), "boot": np.nanmean(boot, axis=1)}


def spearman_weekly(pred, actual, group_ids, group_fold, n_folds, rs, min_rows=8, pidx=None):
    """Weekly layer: Spearman per (S, w, position) group with >= min_rows rows, averaged within each fold, then across folds."""
    G = int(np.max(group_ids)) + 1 if len(group_ids) else 0
    point, boot = rs.group_spearman(pred, actual, group_ids, G, min_rows, pidx)
    group_fold = np.asarray(group_fold)

    def pooled(mat):
        per_fold = []
        for f in range(n_folds):
            cols = [g for g in range(G) if group_fold[g] == f]
            if cols:
                per_fold.append(np.nanmean(mat[..., cols], axis=-1))
        return np.nanmean(np.stack(per_fold, axis=-1), axis=-1)

    value = pooled(point[None, :])[0]
    bootv = pooled(boot)
    return {"value": float(value), "ci": bs.ci95(bootv), "boot": bootv}


def drift(err_by_fold_point, boot_by_fold, seasons):
    """Slope of per-season MAE on T with a bootstrap CI. err_by_fold_*: per-fold mean abs error."""
    sl = bs.slope(seasons, np.asarray(err_by_fold_point))
    sb = bs.slope(seasons, boot_by_fold)
    return {"slope": float(sl), "ci": bs.ci95(sb)}


# ── §8 gate arithmetic (T-PY-8) ────────────────────────────────────────────────────────────────────────────
def label(d, ci, bench_mae, rank_ci=None, margin=BEAT_MARGIN):
    """beats / loses / no-difference for one position vs one benchmark (paired difference d = MAE(candidate) - MAE(benchmark)).
    beats: CI entirely below 0 AND -d / MAE(benchmark) >= margin (both pooled point estimates). loses: CI entirely above 0.
    Rank guard: a beats becomes no-difference when the CI of the Spearman difference (candidate - benchmark) lies entirely below 0."""
    lo, hi = ci
    if lo > 0:
        return "loses"
    if hi < 0 and (-d / bench_mae) >= margin - 1e-12:
        if rank_ci is not None and rank_ci[1] < 0:
            return "no-difference"
        return "beats"
    return "no-difference"


def confirm(lbl, d_2025):
    """Confirmation: a beats stands only if d on the 2025 fold is below 0."""
    if lbl == "beats" and not (d_2025 < 0):
        return "no-difference"
    return lbl


def rows_for_benchmark(df, bench):
    """Rows a benchmark is judged on: B2 → stratum V (b2 non-null); B1c → B1-covered rows; STD → all rows of the population."""
    if bench == "B2":
        return df[df["stratum"] == "V"]
    if bench in ("B1c", "B1"):
        return df[df["b1_covered"]]
    return df


def gate(labels_by_position, need=3):
    """The candidate passes if at least `need` of 4 positions pass (beat every required benchmark) and none `loses` to any."""
    passes = 0
    for pos, labs in labels_by_position.items():
        if any(v == "loses" for v in labs.values()):
            return False
        if all(v == "beats" for v in labs.values()):
            passes += 1
    return passes >= need


# ── cohorts (§5.5) ─────────────────────────────────────────────────────────────────────────────────────────
def catch_up_lag(proj_by_week, w0, L, cap=6):
    """Smallest k >= 1 for which the projection for week w0+k has closed >= 50% of the gap between the projection for w0 and L.
    A week in w0+1..w0+cap with no projection is SKIPPED (k still counts calendar weeks) — never the end of the search; censored at
    `cap` (returns (cap, True)) only when no week up to w0+cap closes the gap. proj_by_week: {week: projection}."""
    p0 = proj_by_week.get(w0)
    if p0 is None or L is None or np.isnan(L):
        return None, None
    gap = L - p0
    for k in range(1, cap + 1):
        pk = proj_by_week.get(w0 + k)
        if pk is None:
            continue
        if gap == 0 or (pk - p0) / gap >= 0.5:
            return k, False
    return cap, True


def cell(n):
    return "INSUFFICIENT" if n < MIN_CELL else "ok"
