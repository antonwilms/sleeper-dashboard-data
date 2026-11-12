"""Clustered paired bootstrap (task §5.4): one draw of PLAYERS with replacement from the union of players in the pooled folds;
a drawn player brings all his rows in every fold; fold-equal weighting is recomputed inside each resample. 2,000 resamples,
seed 12345, 95% percentile CI. Resamples are player-multiplicity vectors, so per-player sufficient statistics make the mean metrics
cheap; Spearman is re-ranked inside every resample (`group_spearman`), one (resamples x group rows) weight block at a time.
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

    @staticmethod
    def _wmidranks(vals, W):
        """Midranks of `vals` recomputed on the resampled multiset: row i drawn W[b, i] times counts that many times, tied with itself.
        → (B x m) midrank of each row in resample b (meaningful only where W > 0). Sort once; the weights vary per resample."""
        order = np.argsort(vals, kind="stable")
        sv = vals[order]
        newgrp = np.concatenate([[True], sv[1:] != sv[:-1]])
        starts = np.flatnonzero(newgrp)
        gid = np.cumsum(newgrp) - 1
        Ws = W[:, order]
        gs = np.add.reduceat(Ws, starts, axis=1)               # multiplicity of each distinct value
        before = np.cumsum(gs, axis=1) - gs                    # multiset rows strictly below each distinct value
        out_sorted = (before + (gs + 1.0) / 2.0)[:, gid]
        out = np.empty_like(out_sorted)
        out[:, order] = out_sorted
        return out

    def group_spearman(self, a, b, groups, n_groups, min_rows=8, pidx=None):
        """Spearman per group, re-ranked per resample: each resample's value is the Pearson correlation of the midranks recomputed on
        the resampled multiset (a row drawn m times counts m times). A group whose resampled row count (with multiplicity) is below
        `min_rows`, or with zero rank variance on either side, is NaN for that resample. A group with fewer than `min_rows` ORIGINAL
        rows is not in the population (NaN everywhere). Point estimates use the original rows. → (point[G], boot[B x G])."""
        a, b, groups = np.asarray(a, float), np.asarray(b, float), np.asarray(groups)
        pidx = self.inv if pidx is None else np.asarray(pidx)
        point = np.full(n_groups, np.nan)
        boot = np.full((self.B, n_groups), np.nan)
        for g in range(n_groups):
            m = groups == g
            if m.sum() < min_rows:
                continue
            ag, bg = a[m], b[m]
            if np.std(ag) > 0 and np.std(bg) > 0:
                point[g] = np.corrcoef(rankdata(ag), rankdata(bg))[0, 1]
            W = self.C[:, pidx[m]]
            n = W.sum(axis=1)
            ra, rb = self._wmidranks(ag, W), self._wmidranks(bg, W)
            with np.errstate(invalid="ignore", divide="ignore"):
                ma, mb = (W * ra).sum(axis=1) / n, (W * rb).sum(axis=1) / n
                da, db = ra - ma[:, None], rb - mb[:, None]
                saa, sbb, sab = (W * da * da).sum(axis=1), (W * db * db).sum(axis=1), (W * da * db).sum(axis=1)
                v = sab / np.sqrt(saa * sbb)
            v[(n < min_rows) | ~(saa > 1e-12) | ~(sbb > 1e-12)] = np.nan
            boot[:, g] = v
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
