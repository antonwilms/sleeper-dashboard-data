"""LP-2b-1a (§9): the within-season era blend — the in-season league level (weeks <= n of season S) against last season's, applied to the prior's
`pg`/`po` weekly targets with weight n / (n + eraN0). Never applied to `pr_gamesShare`."""
import copy

import numpy as np

from . import asof, era, features, weekly_data


def season_only(v):
    """A shallow copy of the view whose `weeks`, `X` and `teams` keep only the season-v.S rows; every other attribute is unchanged."""
    out = copy.copy(v)
    m = (v.weeks["S"] == v.S).to_numpy()
    out.weeks = v.weeks.loc[m]
    out.X = v.X[m]
    out.teams = v.teams.loc[v.teams["S"] == v.S]
    return out


def mu_std(tables, store, S, n):
    """League means of season S read through the view at origin (S, n): era.league_means over season-S player-seasons of weeks <= n only,
    as {(P, q): mean}. Empty at n = 0."""
    weekly_data.guard(S)
    v = asof.view(tables, S, n)
    mu = era.league_means(features.player_seasons(season_only(v), store.keys), store.struct)
    return {k: d[S] for k, d in mu.items() if S in d}


def ratio(mu, store, S, P, q):
    """mu_std / last season's league mean of the same (P, q) when both exist, are finite and positive; else 1."""
    a = mu.get((P, q))
    b = store.mu(S).get((P, q), {}).get(S - 1)
    if a is None or b is None or not np.isfinite(a) or not np.isfinite(b) or a <= 0 or b <= 0:
        return 1.0
    return float(a / b)


def blend(prior, ratio_, n, n0):
    """prior x (1 + omega (ratio - 1)), omega = n / (n + n0): 0 at n = 0 (the prior unchanged), approaching 1 late."""
    omega = n / (n + n0)
    return np.asarray(prior, float) * (1.0 + omega * (ratio_ - 1.0))
