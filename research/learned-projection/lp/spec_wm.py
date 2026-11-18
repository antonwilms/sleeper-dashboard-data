"""LP-2b-1b (§7): the machine-readable weekly spec of a candidate. `default_spec_w(name)` builds it ONCE, to be written into
`candidates/<name>.json` by `--init-weekly`; every other module reads these keys from the candidate file and from nowhere else.
Not hashed (like `spec.py`): the spec is hashed through `specSha256`."""
from . import spec_w, weekly_data

NAMES = ("H", "G")


class NoTrainingRows(RuntimeError):
    """A weekly target has no training row (a §12 stop)."""


GROUPS = ("form", "usage", "avail", "absence", "opp", "team", "game", "gl", "bio", "prior")


def default_spec_w(name):
    if name not in NAMES:
        raise ValueError(name)
    spec = {
        "name": name, "family": name, "trainFrom": 2018, "lastSeason": 2024, "seed": 0,
        "kMultW": [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32], "rhos": [0.6, 0.75, 0.85, 0.92, 1.0],
        "ctxGroups": ["usage", "avail", "absence", "opp", "team", "game", "gl", "bio"], "ctxCols": ["nP", "wk", "noPrior"], "ctxAlphas": [1, 10, 100, 1000, "off"],
        "ctxDefaultAlpha": "off",
        "gGroups": ["form", "usage", "avail", "absence", "opp", "team", "game", "gl", "bio", "prior"],
        "gPoint": {"learning_rate": 0.05, "max_iter": 300, "max_leaf_nodes": 8, "min_samples_leaf": 100, "l2_regularization": 1.0},
        "pplaysCols": spec_w.AVAIL + ["pr_gamesShare", "noPrior", "nP", "wk", "age", "exp"], "pplays": {"C": 1.0, "max_iter": 1000},
        "phis": [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1.0], "rosOrigins": [0, 4, 8, 12], "crossFolds": 4, "calibMinRows": 30,
    }
    if spec["trainFrom"] != spec_w.TRAIN_FROM:
        raise AssertionError("trainFrom differs from spec_w.TRAIN_FROM")
    if spec["lastSeason"] != weekly_data.LAST_SEASON:
        raise AssertionError("lastSeason differs from weekly_data.LAST_SEASON")
    if name == "H":
        spec["gGroups"], spec["gPoint"] = None, None
    else:
        for k in ("kMultW", "rhos", "ctxGroups", "ctxCols", "ctxAlphas", "ctxDefaultAlpha", "pplays"):
            spec[k] = None
    return spec
