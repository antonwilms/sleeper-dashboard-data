"""Clustered paired bootstrap (task §5.4): one draw of PLAYERS with replacement from the union of players in the pooled folds;
a drawn player brings all his rows in every fold; fold-equal weighting is recomputed inside each resample. 2,000 resamples,
seed 12345, 95% percentile CI. Resamples are player-multiplicity vectors, so per-player sufficient statistics make every metric
cheap — no (resamples x rows) matrix is ever built outside the tests.
"""
import numpy as np
from scipy.stats import rankdata

B_DEFAULT = 2000
SEED = 12345


class Resampler:
    def __init__(self, player_ids, B=B_DEFAULT, seed=SEED):
        self.players, self.inv = np.unique(np.asarray(player_ids).astype(str), return_inverse=True)
        self.P = len(self.players)
        rng = np.random.RandomState(seed)
        self.C = rng.multinomial(self.P, np.full(self.P, 1.0 / self.P), size=B).astype(float)  # B x P multiplicities
        self.B = B

    def idx(self, pids):
        """Player index of each row's pid (every pid must be in the resampler's player set)."""
        a = np.asarray(pids).astype(str)
        i = np.searchsorted(self.players, a)
        if (i >= self.P).any() or (self.players[np.minimum(i, self.P - 1)] != a).any():
            raise KeyError('pid outside the resampler universe')
        return i

    def row_weights(self):
        """(B x rows) multiplicity of each row's player — small panels / tests only."""
        return self.C[:, self.inv]

    def _sums(self, idx_player, groups, G, values=None):
        out = np.zeros((self.P, G))
        np.add.at(out, (idx_player, groups), 1.0 if values is None else values)
        return out

    def pooled_mean(self, values, folds, n_folds, pidx=None):
        """Equal weight per fold of each fold's mean of `values`. → (point, boot[B])."""
        values, folds = np.asarray(values, float), np.asarray(folds)
        pidx = self.inv if pidx is None else pidx
        S = self._sums(pidx, folds, n_folds, values)
        N = self._sums(pidx, folds, n_folds)
        point = np.mean([values[folds == f].mean() for f in range(n_folds) if (folds == f).any()])
        num, den = self.C @ S, self.C @ N
        with np.errstate(invalid="ignore", divide="ignore"):
            fold_means = num / den
        return point, np.nanmean(fold_means, axis=1), fold_means

    def per_fold_mean(self, values, folds, n_folds, pidx=None):
        values, folds = np.asarray(values, float), np.asarray(folds)
        pidx = self.inv if pidx is None else pidx
        S = self._sums(pidx, folds, n_folds, values)
        N = self._sums(pidx, folds, n_folds)
        with np.errstate(invalid="ignore", divide="ignore"):
            boot = (self.C @ S) / (self.C @ N)
        point = np.array([values[folds == f].mean() if (folds == f).any() else np.nan for f in range(n_folds)])
        return point, boot

    def group_spearman(self, a, b, groups, n_groups, min_rows=8, pidx=None):
        """Weighted Spearman per group (Pearson of the original within-group ranks under player multiplicities).
        → (point[G] with NaN below min_rows, boot[B x G])."""
        a, b, groups = np.asarray(a, float), np.asarray(b, float), np.asarray(groups)
        ra, rb = np.full(len(a), np.nan), np.full(len(a), np.nan)
        point = np.full(n_groups, np.nan)
        for g in range(n_groups):
            m = groups == g
            if m.sum() < min_rows:
                continue
            ra[m], rb[m] = rankdata(a[m]), rankdata(b[m])
            if np.std(a[m]) > 0 and np.std(b[m]) > 0:
                point[g] = np.corrcoef(ra[m], rb[m])[0, 1]
        ok = ~np.isnan(ra)
        pidx = self.inv if pidx is None else pidx
        idx, gg, ra, rb = pidx[ok], groups[ok], ra[ok], rb[ok]
        st = {k: self._sums(idx, gg, n_groups, v) for k, v in
              {"n": None, "a": ra, "b": rb, "aa": ra * ra, "bb": rb * rb, "ab": ra * rb}.items()}
        C = self.C
        n, sa, sb, saa, sbb, sab = (C @ st[k] for k in ("n", "a", "b", "aa", "bb", "ab"))
        with np.errstate(invalid="ignore", divide="ignore"):
            boot = (n * sab - sa * sb) / np.sqrt((n * saa - sa ** 2) * (n * sbb - sb ** 2))
        boot[:, np.isnan(point)] = np.nan
        return point, boot


def ci95(boot):
    return [float(np.nanpercentile(boot, 2.5)), float(np.nanpercentile(boot, 97.5))]


def iid_ci(values, B=B_DEFAULT, seed=SEED):
    """Row-level (non-clustered) bootstrap CI of a mean — the comparator for T-PY-5."""
    values = np.asarray(values, float)
    rng = np.random.RandomState(seed)
    idx = rng.randint(0, len(values), size=(B, len(values)))
    return ci95(values[idx].mean(axis=1))


def slope(x, ys):
    """OLS slope of y on x. ys: (..., k) → (...)."""
    x = np.asarray(x, float)
    xc = x - x.mean()
    return np.nansum(ys * xc, axis=-1) / np.sum(xc ** 2)
