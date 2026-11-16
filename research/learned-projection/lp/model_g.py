"""LP-2a (§8.2): G — gradient-boosted trees. One `HistGradientBoostingRegressor` per position and target, native NaN handling, weights §7.2."""
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from . import chain


class AllZeroTarget(RuntimeError):
    pass


def loss_for(spec, name):
    if name == "gamesShare":
        return spec["losses"]["gamesShare"]
    return spec["losses"]["yardage"] if chain.is_yardage(name) else spec["losses"]["other"]


def fit_target(spec, name, gname, Xtr, r, e, w, Xpr):
    """Fit on the rows with e > 0 and return the UNCLIPPED prediction for Xpr. Poisson loss clips the target to >= 0; an all-zero Poisson
    target raises AllZeroTarget (a §12 stop)."""
    Xtr, Xpr = np.asarray(Xtr, float), np.asarray(Xpr, float)
    r, e, w = np.asarray(r, float), np.asarray(e, float), np.asarray(w, float)
    m = (e > 0) & np.isfinite(r)
    if not m.any():
        raise AllZeroTarget("target %s has no training rows" % name)
    loss = loss_for(spec, name)
    y = r[m]
    if loss == "poisson":
        y = np.clip(y, 0.0, None)
        if not y.sum() > 0:
            raise AllZeroTarget("target %s is all zero under the Poisson loss" % name)
    lr, mi, ml, ms, l2 = spec["gPoints"][gname]
    model = HistGradientBoostingRegressor(loss=loss, learning_rate=lr, max_iter=int(mi), max_leaf_nodes=int(ml), min_samples_leaf=int(ms),
                                          l2_regularization=l2, early_stopping=False, random_state=spec["seed"])
    model.fit(Xtr[m], y, sample_weight=w[m])
    return model.predict(Xpr)
