"""LP-2b-1b (§6.4): the P(plays) model and the horizon decay. One model per family and position, on every training row of the position
(a bye has no row); target `played`; features `pplays` design columns. H: logistic regression on `baselines._prep` (training medians plus missing
indicators) and a standard scaler. G: gradient-boosted trees (native NaN). The horizon decay phi is used only by LP-2b-1c."""
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from . import baselines


class PPlays:
    """A fitted P(plays) model — a plain picklable object."""

    def __init__(self, family, cols, model, med=None, miss=None, scaler=None):
        self.family, self.cols, self.model, self.med, self.miss, self.scaler = family, list(cols), model, med, miss, scaler


def fit(frame, spec, cols):
    """`frame` holds `played` and every column of `cols` (rows = the position's training rows)."""
    X = frame[list(cols)].to_numpy(float)
    y = frame["played"].astype(int).to_numpy()
    if not len(y) or y.min() == y.max():
        raise ValueError("P(plays) needs both outcomes among the training rows")
    if spec["family"] == "H":
        with np.errstate(all="ignore"):
            med = np.nanmedian(X, axis=0)
        med = np.where(np.isnan(med), 0.0, med)
        miss = [j for j in range(X.shape[1]) if np.isnan(X[:, j]).any()]
        Z = baselines._prep(X, med, miss)
        sc = StandardScaler().fit(Z)
        model = LogisticRegression(C=spec["pplays"]["C"], max_iter=spec["pplays"]["max_iter"])
        model.fit(sc.transform(Z), y)
        return PPlays("H", cols, model, med, miss, sc)
    model = HistGradientBoostingClassifier(early_stopping=False, random_state=spec["seed"], **spec["gPoint"])
    model.fit(X, y)
    return PPlays("G", cols, model)


def predict(pp, frame):
    X = frame[pp.cols].to_numpy(float)
    if pp.family == "H":
        X = pp.scaler.transform(baselines._prep(X, pp.med, pp.miss))
    proba = pp.model.predict_proba(X)
    return proba[:, list(pp.model.classes_).index(1)]


# ── the horizon (flag 11) ───────────────────────────────────────────────────────────────────────────────────
def horizon_pairs(df, origins):
    """Pairs (origin row, a later row of the same pid-season). `df`: columns pid, S, w, played, p (the origin row's out-of-fold P(plays)), gs
    (`pr_gamesShare`). The origin row of origin n has w = n + 1; h = 1 + the number of HIS rows with n + 1 < w' <= the later row's week, so a bye or
    an out-of-universe week (no row) adds nothing. Returns arrays (p0, gs0, h, y) — every h >= 2."""
    d = df.sort_values(["pid", "S", "w"], kind="mergesort")
    p0, g0, hh, yy = [], [], [], []
    for _key, g in d.groupby(["pid", "S"], sort=False):
        wk = g["w"].to_numpy()
        pl = g["played"].astype(float).to_numpy()
        pv = g["p"].to_numpy(float)
        gv = g["gs"].to_numpy(float)
        for n in origins:
            hit = np.flatnonzero(wk == n + 1)
            if not len(hit):
                continue
            i0 = int(hit[0])
            for j in range(i0 + 1, len(wk)):
                p0.append(pv[i0])
                g0.append(gv[i0])
                hh.append(1 + (j - i0))
                yy.append(pl[j])
    return np.array(p0, float), np.array(g0, float), np.array(hh, int), np.array(yy, float)


def p_at_horizon(p, gs, h, phi):
    """p_h = gs + (p - gs) * phi^(h-1)."""
    return np.asarray(gs, float) + (np.asarray(p, float) - np.asarray(gs, float)) * float(phi) ** (np.asarray(h, float) - 1.0)


def fit_phi(pairs, phis):
    """phi in `phis` minimising the Brier score of p_h against `played` over the pairs with h >= 2; the first minimum on ties."""
    p0, g0, h, y = pairs
    m = h >= 2
    if not m.any():
        raise ValueError("no horizon pairs (h >= 2) to fit phi on")
    scores = [float(np.mean((p_at_horizon(p0[m], g0[m], h[m], f) - y[m]) ** 2)) for f in phis]
    return float(phis[int(np.argmin(scores))]), scores
