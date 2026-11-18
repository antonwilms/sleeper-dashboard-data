"""LP-2b-1b (§6.3): G's weekly point model — one `HistGradientBoostingRegressor` per position and target on the `gGroups` columns, target
r - pr (r under the `gPrior: False` variant), weight e, rows with e > 0 and finite r. Everything it needs comes from the spec."""
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from . import spec_wm


def fit_target(spec, X, r, e, pr, g_prior=True):
    """Returns the fitted regressor. `X` (n, p), `r`, `e`, `pr` (n,)."""
    X, r, e, pr = (np.asarray(a, float) for a in (X, r, e, pr))
    m = (e > 0) & np.isfinite(r)
    if not m.any():
        raise spec_wm.NoTrainingRows("a weekly target has no training row")
    y = r[m] - pr[m] if g_prior else r[m]
    model = HistGradientBoostingRegressor(loss="squared_error", early_stopping=False, random_state=spec["seed"], **spec["gPoint"])
    model.fit(X[m], y, sample_weight=e[m])
    return model


def predict_target(model, X, pr, g_prior=True):
    out = model.predict(np.asarray(X, float))
    return np.asarray(pr, float) + out if g_prior else out
