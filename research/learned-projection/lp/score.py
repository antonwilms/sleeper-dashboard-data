"""The scoring dot-product (task §6 copy; no cross-repo index entry — ruling 4).

COPY of lib/fantasyPoints.mjs `calculateFantasyPoints` as used through `scoreSeasonStats`: Σ x_k · w_k, then JS
`Math.round(total * 100) / 100`. Weights are summed in the scoring file's own key order (meta.weights keeps it), so the float
sum is the same sequence of additions the Node side performs. Parity with the panel's `pts` is pinned by T-PY-1/T-PY-2 and
checked as a hard stop by run_benchmarks.py.
"""
import math


def js_round2(total):
    """JS Math.round(total * 100) / 100 (ties go up, unlike Python's banker's round)."""
    return math.floor(total * 100 + 0.5) / 100


def score(x, weights):
    """x: sequence aligned to `weights` (a list of weights in key order). Returns the 2-dp league points."""
    total = 0.0
    for xv, wv in zip(x, weights):
        total += xv * wv
    return js_round2(total)


def score_matrix(X, weights):
    """Vectorised `score` over a matrix, same left-to-right accumulation order as the scalar loop."""
    import numpy as np
    total = np.zeros(X.shape[0])
    for j, wv in enumerate(weights):
        total = total + X[:, j] * wv
    return np.floor(total * 100 + 0.5) / 100


def parity(X, pts, weights):
    """→ (rows checked, mismatching row indices): every row with a non-null x must satisfy score(x, weights) == pts."""
    import numpy as np
    played = ~np.isnan(X).any(axis=1)
    got = score_matrix(X[played], weights)
    want = np.asarray(pts, float)[played]
    bad = np.flatnonzero(np.abs(got - want) > 1e-9)
    return int(played.sum()), np.flatnonzero(played)[bad]
