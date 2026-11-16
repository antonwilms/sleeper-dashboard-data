"""LP-2a (§5.3, §6): the era-team copy, league means, E0/E1 units, season weights.

`era_team` is a COPY of lib/nflverse.mjs `eraTeam` (task §15; pinned by T-M-4). A quantity is `pg` (per game, exposure `g`), `po` (per unit of a
denominator, exposure = its season sum) or `raw`; E1 divides `pg`/`po` values only, by `mu(P, q, s)` of the SAME quantity q for position P."""
import numpy as np


def era_team(abbr, season):
    """Copy of lib/nflverse.mjs eraTeam: LA <= 2015 -> STL, LAC <= 2016 -> SD, LV <= 2019 -> OAK, else unchanged."""
    if abbr == "LA" and season <= 2015:
        return "STL"
    if abbr == "LAC" and season <= 2016:
        return "SD"
    if abbr == "LV" and season <= 2019:
        return "OAK"
    return abbr


POSITIONS = ("QB", "RB", "WR", "TE")
FIRST_SEASON = 2012


def target_def(spec, P, q):
    """(numerator column, [denominator columns]) of quantity q for position P — the exposure of a `pg` quantity is `g`."""
    if q == "ppg":
        return "pts", ["g"]
    if q == "oppoPg":
        return "oppo", ["g"]
    for t in spec["targets"][P]:
        if t["name"] == q:
            if t["kind"] == "pg":
                return q, ["g"]
            if t["kind"] == "po":
                return q, list(t["den"])
    raise KeyError("no quantity %s for position %s" % (q, P))


def quantities(spec):
    """Every (P, q) that can need a league mean."""
    out = set()
    for P in POSITIONS:
        for t in spec["targets"][P]:
            if t["kind"] in ("pg", "po"):
                out.add((P, t["name"]))
        out.add((P, "ppg"))
        out.add((P, "oppoPg"))
    return sorted(out)


def _top(ps, P, s, N):
    sub = ps[(ps["s"] == s) & (ps["position"] == P)]
    sub = sub.assign(_k=-sub["oppo"].to_numpy(float)).sort_values(["_k", "pid"], kind="mergesort")
    return sub.head(N)


def league_means(ps, spec):
    """mu[(P, q)][s] = among position P's top-N of season s by sum of `oppo` (ties at the cut by ascending pid), sum of numerators / sum of
    exposures. A season with no rows or a zero exposure is absent (never an average of player rates)."""
    mu = {}
    seasons = sorted(set(int(x) for x in ps["s"].unique()))
    tops = {(P, s): _top(ps, P, s, spec["topN"][P]) for P in POSITIONS for s in seasons}
    for (P, q) in quantities(spec):
        num, den = target_def(spec, P, q)
        d = {}
        for s in seasons:
            t = tops[(P, s)]
            if not len(t):
                continue
            e = float(sum(t[c].sum() for c in den))
            n = float(t[num].sum())
            if e > 0:
                d[s] = n / e
        mu[(P, q)] = d
    return mu


class Units:
    """The era treatment of one fit. era 'E0' divides nothing. 'E1': `div(P, q, s)` = mu[s] — except a (P, q) whose mu is non-finite or <= 0
    in ANY season from 2012 to `last_season` (the predicted season - 1) stays raw for the whole fit (once per fit, never per view)."""

    def __init__(self, mu, era, last_season):
        self.mu, self.era, self.last_season = mu, era, last_season
        self.fallback = set()
        if era == "E1":
            for key, d in mu.items():
                for s in range(FIRST_SEASON, last_season + 1):
                    v = d.get(s)
                    if v is None or not np.isfinite(v) or v <= 0:
                        self.fallback.add(key)
                        break

    def active(self, P, q):
        return self.era == "E1" and (P, q) not in self.fallback

    def div(self, P, q, s):
        """Divisor of season-s values of (P, q): 1.0 when raw, NaN when E1 has no mean for that season."""
        if not self.active(P, q):
            return 1.0
        v = self.mu[(P, q)].get(int(s))
        return float(v) if v is not None else np.nan


def season_weights(seasons, s_max, lam):
    """w(s) = exp(-lam * (s_max - s)); s_max = the last season of the fit's training seasons (also inside every leave-out refit)."""
    return np.exp(-lam * (s_max - np.asarray(seasons, float)))
