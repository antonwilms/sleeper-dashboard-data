"""LP-2a (§8.1): H — partial pooling. For one target: a cohort ridge of the rate on the descriptors plus a per-player deviation built from
the player's own history, shrunk by k and decayed by delta. The cohort mean a history deviation is measured against has never seen the
season being predicted nor the history season itself (R5)."""
import warnings

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from . import baselines


def _fit_ridge(Z, y, w, alpha):
    """Weighted ridge on standardised inputs — module-level so a test can record which rows each cohort model saw."""
    return Ridge(alpha=alpha).fit(Z, y, sample_weight=w)


class Cohort:
    """Median-impute (+ missing-indicator columns), standardise and ridge — medians, scaler and ridge refitted inside every fit."""

    def __init__(self, X, y, w, alpha, seasons=None):
        X = np.asarray(X, float)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)             # an all-NaN column has median 0 (the indicator column carries it)
            med = np.nanmedian(X, axis=0)
        self.med = np.where(np.isnan(med), 0.0, med)
        self.miss = [j for j in range(X.shape[1]) if np.isnan(X[:, j]).any()]
        P = baselines._prep(X, self.med, self.miss)
        self.sc = StandardScaler().fit(P)
        self.seasons = None if seasons is None else tuple(sorted(set(int(s) for s in seasons)))
        self.ridge = _fit_ridge(self.sc.transform(P), np.asarray(y, float), np.asarray(w, float), alpha)

    def predict(self, X):
        X = np.asarray(X, float)
        if len(X) == 0:
            return np.zeros(0)
        return self.ridge.predict(self.sc.transform(baselines._prep(X, self.med, self.miss)))


def _group_idx(keys):
    d = {}
    for i, k in enumerate(keys):
        d.setdefault(k, []).append(i)
    return {k: np.array(v) for k, v in d.items()}


def fit_target(tr, pr, alphas, kmult, deltas, lags=(1, 2, 3)):
    """tr: dict S (n,), X (n,p), r (n,), e (n,), w (n,) — rows with e > 0 only —, hist: {lag: dict X (n,p), r (n,), e (n,)} (the player's own
    descriptors, rate and exposure of season S - lag; e = 0 where unavailable). pr: dict P (m,), X (m,p), hist likewise.
    Returns dict pred (m,), alpha, kmult, delta, k. `S`/`P` are integer seasons; the fit's training seasons are the unique `tr['S']`."""
    S, X, r, e, w = (np.asarray(tr[k]) for k in ("S", "X", "r", "e", "w"))
    S = S.astype(int)
    seasons = sorted(set(S.tolist()))
    sset = set(seasons)
    models = {}

    def get(A):
        A = frozenset(A)
        if A not in models:
            keep = ~np.isin(S, list(A))
            models[A] = Cohort(X[keep], r[keep], w[keep], alpha_cur[0], seasons=[s for s in seasons if s not in A]) if keep.any() else None
        return models[A]

    # 1. alpha: leave-one-season-out
    alpha_cur = [alphas[0]]
    best = None
    for a in alphas:
        alpha_cur[0] = a
        models.clear()
        sse, used = 0.0, 0
        for s in seasons:
            m = get({s})
            if m is None:
                continue
            idx = S == s
            sse += float((w[idx] * (r[idx] - m.predict(X[idx])) ** 2).sum())
            used += 1
        if used and (best is None or sse < best[0] - 1e-12):
            best = (sse, a)
    alpha = best[1] if best else alphas[len(alphas) // 2]
    alpha_cur[0] = alpha
    models.clear()

    def history(rows_S, Xrows, hist, mode):
        """D (n, L), E (n, L): deviation and raw exposure per lag; the cohort model for a row is excluded of A (§8.1 step 2)."""
        n = len(rows_S)
        D = np.zeros((n, len(lags)))
        E = np.zeros((n, len(lags)))
        for li, l in enumerate(lags):
            h = hist[l]
            ok = np.asarray(h["e"], float) > 0
            A_of = {}
            for s in set(int(x) for x in rows_S):
                A_of[s] = ({s, s - l} & sset) if mode == "train" else ({s - l} & sset)
            for s, idx in _group_idx(rows_S).items():
                A = A_of[int(s)]
                m = get(A) if (sset - A) else None
                if m is None:
                    continue
                sel = idx[ok[idx]]
                if not len(sel):
                    continue
                D[sel, li] = np.asarray(h["r"], float)[sel] - m.predict(np.asarray(h["X"], float)[sel])
                E[sel, li] = np.asarray(h["e"], float)[sel]
        return D, E

    D, E = history(S, X, tr["hist"], "train")
    base = np.zeros(len(S))
    for s in seasons:
        idx = S == s
        m = get({s})
        base[idx] = m.predict(X[idx]) if m is not None else float((w * r).sum() / w.sum())
    med_e = float(np.median(e[e > 0])) if (e > 0).any() else 1.0
    best = None
    for km in kmult:
        k = km * med_e
        for dl in deltas:
            dw = np.array([dl ** (l - 1) for l in lags])
            num = (E * D * dw).sum(axis=1)
            den = k + (E * dw).sum(axis=1)
            with np.errstate(all="ignore"):
                dev = np.where(den > 0, num / np.where(den > 0, den, 1.0), 0.0)
            sse = float((w * (r - (base + dev)) ** 2).sum())
            if best is None or sse < best[0] - 1e-12:
                best = (sse, km, dl, k)
    _sse, km, dl, k = best
    # 3. predicted rows
    P = np.asarray(pr["P"]).astype(int)
    Dp, Ep = history(P, pr["X"], pr["hist"], "pred")
    mall = get(set())
    base_p = mall.predict(np.asarray(pr["X"], float))
    dw = np.array([dl ** (l - 1) for l in lags])
    den = k + (Ep * dw).sum(axis=1)
    with np.errstate(all="ignore"):
        dev = np.where(den > 0, (Ep * Dp * dw).sum(axis=1) / np.where(den > 0, den, 1.0), 0.0)
    return {"pred": base_p + dev, "alpha": alpha, "kmult": km, "delta": dl, "k": k}
