"""LP-2b-1b (§5, §6.2): H's weekly point model — partial pooling of the season-S evidence toward the (era-blended) prior, then a context ridge.

For a row (pid, S, week w, origin n = w - 1 by default) and a weekly target t with prior pr:
    E = sum_j rho^(a_j) exp_j,  N = sum_j rho^(a_j) num_j      over his season-S PLAYED rows j with week <= n, a_j = the number of his later such rows
    b = pr + (N - pr E) / (k + E)                                 (E = N = 0 -> b = pr exactly)
(k, rho) minimise the exposure-weighted squared error on the training rows; the context ridge `model_h.Cohort` is fitted to r - b unless the leave-one-season-out rule (or the
one-season default) picks "off" (alpha = infinity: no context term, q = b).
`history` mirrors the form block of `weekly_data.inputs_at` (F4) — a COPY, pinned by `crosscheck` (tests T-B-2 / T-B-4 and the runner's step 7(b))."""
import numpy as np
import pandas as pd

from . import features, model_h, spec_w, spec_wm, weekly_data

OFF = "off"                      # the context grid's last entry: alpha = infinity (Anton, 2026-11-18, §17)


# ── history: every played to-date row, with its numerator / exposure per target ─────────────────────────────
def history(tables, store, seasons):
    """`pid, S, w, num_<t>, exp_<t>` for every PLAYED `weeks` row of the given seasons (including rows outside the weekly universe), for the weekly
    targets of the pid's position (`store.pos`); every other target column is NaN. A row with a non-finite numerator or exposure contributes 0 to both
    (`inputs_at`'s rule); a `po` numerator is kept even when its denominator is 0."""
    ts = spec_w.union_targets()
    spec = spec_w.inputs_spec()
    weekly_data._check_targets(store, spec)
    for S in sorted(set(int(s) for s in seasons)):
        weekly_data.guard(S)
    w = tables.weeks
    keep = (w["played"].astype(bool) & w["S"].isin(list(seasons))).to_numpy()
    wk = w.loc[keep].reset_index(drop=True)
    X = tables.X[wk["rid"].to_numpy().astype(int)]
    pos = np.array([store.pos.get(p) for p in wk["pid"]], dtype=object)
    tdefs = weekly_data._tdefs(store)
    out = wk[["pid", "S", "w"]].copy()
    num = {t: np.full(len(wk), np.nan) for t in ts}
    exp = {t: np.full(len(wk), np.nan) for t in ts}
    for P in spec_w.POSITIONS:
        sel = np.flatnonzero(pos == P)
        if not len(sel):
            continue
        raw = wk.iloc[sel]
        for t in tdefs[P]:
            n_, e_ = weekly_data._num_exp(raw, X[sel], store.keys, t)
            ok = np.isfinite(n_) & np.isfinite(e_)
            num[t["name"]][sel] = np.where(ok, n_, 0.0)
            exp[t["name"]][sel] = np.where(ok, e_, 0.0)
    cols = {("num_" + t): num[t] for t in ts}
    cols.update({("exp_" + t): exp[t] for t in ts})
    out = pd.concat([out.reset_index(drop=True), pd.DataFrame(cols)], axis=1)
    return out.sort_values(["pid", "S", "w"], kind="mergesort").reset_index(drop=True)


class HistIndex:
    """`history`'s rows grouped by (pid, season): weeks (sorted) and the matrix of numerators then exposures, in `spec_w.union_targets()` order."""

    def __init__(self, df):
        self.ts = spec_w.union_targets()
        d = df.sort_values(["pid", "S", "w"], kind="mergesort").reset_index(drop=True)
        self.V = np.hstack([d[["num_" + t for t in self.ts]].to_numpy(float), d[["exp_" + t for t in self.ts]].to_numpy(float)]) if len(d) else np.zeros((0, 2 * len(self.ts)))
        self.W = d["w"].to_numpy(int)
        keys = list(zip(d["pid"], d["S"].astype(int)))
        self.g = {}
        i = 0
        while i < len(keys):
            j = i
            while j < len(keys) and keys[j] == keys[i]:
                j += 1
            self.g[keys[i]] = (i, j)
            i = j


def index(hist):
    return hist if isinstance(hist, HistIndex) else HistIndex(hist)


def evidence(hist, pids, Ss, ns, rhos):
    """(E, N), each (len(rhos), rows, targets) in `union_targets()` order: the decayed exposure and numerator sums of each row's season-S played rows
    with week <= its origin n (the latest row gets weight rho^0; a_j counts HIS rows, not weeks). Rows without evidence give 0."""
    ix = index(hist)
    nt = len(ix.ts)
    R, N = len(rhos), len(pids)
    E, Nn = np.zeros((R, N, nt)), np.zeros((R, N, nt))
    rh = np.asarray(rhos, float)[:, None]
    for i, (p, S, n) in enumerate(zip(pids, Ss, ns)):
        g = ix.g.get((p, int(S)))
        if g is None:
            continue
        a, b = g
        m = int(np.searchsorted(ix.W[a:b], n, side="right"))
        if m == 0:
            continue
        wts = rh ** np.arange(m - 1, -1, -1)[None, :]
        s = wts @ ix.V[a:a + m]
        Nn[:, i, :], E[:, i, :] = s[:, :nt], s[:, nt:]
    return E, Nn


def crosscheck(frame, hist, spec_w_=None):
    """The §6.2 exact cross-checks against the 2b-1a inputs: at rho = 1 E = `ex_t` and N/E = `std_t`; at rho = `gRecDecay` N/E = `rec_t`, for every row and
    every target of the row's position (NaN equals NaN). Returns {"ex", "std", "rec"} = the largest |d| / (1 + |x|)."""
    sp = spec_w_ or spec_w.inputs_spec()
    ix = index(hist)
    ts = ix.ts
    E, N = evidence(ix, frame["pid"].to_numpy(object), frame["S"].to_numpy(int), frame["w"].to_numpy(int) - 1, [1.0, sp["gRecDecay"]])
    pos = frame["position"].to_numpy(object)
    worst = {"ex": 0.0, "std": 0.0, "rec": 0.0}

    def rel(a, b):
        a, b = np.asarray(a, float), np.asarray(b, float)
        if (np.isnan(a) != np.isnan(b)).any():
            return float("inf")
        d = np.where(np.isnan(a), 0.0, np.abs(a - b) / (1.0 + np.abs(np.where(np.isnan(b), 0.0, b))))
        return float(d.max()) if len(d) else 0.0
    for P in spec_w.POSITIONS:
        m = pos == P
        if not m.any():
            continue
        for t in sp["targetsByPos"][P]:
            j = ts.index(t)
            worst["ex"] = max(worst["ex"], rel(E[0][m, j], frame["ex_" + t].to_numpy(float)[m]))
            worst["std"] = max(worst["std"], rel(features._ratio(N[0][m, j], E[0][m, j]), frame["std_" + t].to_numpy(float)[m]))
            worst["rec"] = max(worst["rec"], rel(features._ratio(N[1][m, j], E[1][m, j]), frame["rec_" + t].to_numpy(float)[m]))
    return worst


# ── the fit ─────────────────────────────────────────────────────────────────────────────────────────────────
def fit_target(spec, r, e, pr, E, N, X, S, context=True):
    """Fit one (position, target). r, e, pr, S: (n,) training rows; E, N: (len(rhos), n) the decayed sums for each rho of the grid; X: (n, p) context.
    Rows with e > 0 and finite r are used. Returns {"k", "kGames", "rho", "rhoIdx", "alpha", "alphaSse", "medE", "cohort", "gridSse"}."""
    r, e, pr, S = np.asarray(r, float), np.asarray(e, float), np.asarray(pr, float), np.asarray(S)
    m = (e > 0) & np.isfinite(r)
    if not m.any():
        raise spec_wm.NoTrainingRows("a weekly target has no training row")
    r_, e_, pr_, S_, X_ = r[m], e[m], pr[m], S[m].astype(int), np.asarray(X, float)[m]
    E_, N_ = np.asarray(E, float)[:, m], np.asarray(N, float)[:, m]
    med = float(np.median(e_))
    kms, rhos = spec["kMultW"], spec["rhos"]
    grid = np.empty((len(kms), len(rhos)))
    for i, km in enumerate(kms):
        k = km * med
        for j in range(len(rhos)):
            b = pr_ + (N_[j] - pr_ * E_[j]) / (k + E_[j])
            grid[i, j] = float((e_ * (r_ - b) ** 2).sum())
    i, j = np.unravel_index(int(np.argmin(grid)), grid.shape)            # first minimum: kMultW outer, rhos inner
    k, rho = kms[i] * med, rhos[j]
    b = pr_ + (N_[j] - pr_ * E_[j]) / (k + E_[j])
    out = {"k": float(k), "kGames": float(k / med), "rho": float(rho), "rhoIdx": int(j), "kMult": float(kms[i]), "medE": med, "alpha": None, "alphaSse": None,
           "cohort": None, "gridSse": grid.tolist()}
    if context:
        seasons = sorted(set(S_.tolist()))
        if len(seasons) >= 2:
            sse = []
            for a in spec["ctxAlphas"]:
                tot = 0.0
                for s in seasons:
                    te = S_ == s
                    if a == OFF:                                          # alpha = infinity: no context term, the held-out SSE is that of b itself
                        tot += float((e_[te] * (r_ - b)[te] ** 2).sum())
                    else:
                        c = model_h.Cohort(X_[~te], (r_ - b)[~te], e_[~te], a)
                        tot += float((e_[te] * ((r_ - b)[te] - c.predict(X_[te])) ** 2).sum())
                sse.append(tot)
            alpha = spec["ctxAlphas"][int(np.argmin(sse))]               # first minimum: "off" is last, so a tie keeps a finite alpha
            out["alphaSse"] = sse
        else:
            alpha = spec["ctxDefaultAlpha"]                                # fewer than 2 training seasons: the adjustment cannot be validated
        if alpha == OFF:
            out["alpha"] = OFF
        else:
            out["alpha"] = float(alpha)
            out["cohort"] = model_h.Cohort(X_, r_ - b, e_, alpha)
    return out


def predict_target(info, pr, E, N, X):
    """q = b (+ the context ridge). E, N: (n,) at the fitted rho."""
    pr, E, N = np.asarray(pr, float), np.asarray(E, float), np.asarray(N, float)
    q = pr + (N - pr * E) / (info["k"] + E)
    if info["cohort"] is not None:
        q = q + info["cohort"].predict(np.asarray(X, float))
    return q
