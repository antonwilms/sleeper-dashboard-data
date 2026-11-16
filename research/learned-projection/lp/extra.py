"""LP-2a (§5.2): season aggregates from `nflverse/gamelogs/<year>.json` — the only read outside the panel cache. Regular-season games only,
one row per (sleeper id, week); the season layer sums a season's rows, then divides. No team field is read."""
import hashlib
import json
import os

import numpy as np
import pandas as pd

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
MAX_SEASON = 2025
FIRST_SEASON = 2012
GL_COLS = ["gl_att", "gl_passEpa", "gl_cpoeAtt", "gl_cpoeDen", "gl_passAy", "gl_sacks", "gl_rec", "gl_yac", "gl_carries", "gl_tgt",
           "gl_rushFd", "gl_recFd", "gl_rushEpa", "gl_recEpa"]


class LookAheadError(RuntimeError):
    pass


def _path(year, repo):
    return os.path.join(repo, "nflverse", "gamelogs", "%d.json" % year)


def _num(g, k):
    v = g.get(k)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and np.isfinite(v) else 0.0


def load_gamelogs_season(year, repo=REPO):
    """One row per (pid, week) of `seasonType == 'REG'` games; an absent number is 0. `gl_cpoeAtt` = passingCpoe x attempts when
    passingCpoe is finite (else 0), `gl_cpoeDen` = attempts on those games (else 0): the season CPOE is attempt-weighted."""
    if year > MAX_SEASON:
        raise LookAheadError("gamelogs %d is beyond MAX_SEASON %d" % (year, MAX_SEASON))
    with open(_path(year, repo)) as f:
        doc = json.load(f)
    rows = []
    for pid, pl in doc["players"].items():
        for g in pl.get("games", []):
            if g.get("seasonType") != "REG":
                continue
            att = _num(g, "attempts")
            cp = g.get("passingCpoe")
            ok = isinstance(cp, (int, float)) and not isinstance(cp, bool) and np.isfinite(cp)
            rows.append({"pid": str(pid), "w": int(g["week"]), "gl_att": att, "gl_passEpa": _num(g, "passingEpa"),
                         "gl_cpoeAtt": float(cp) * att if ok else 0.0, "gl_cpoeDen": att if ok else 0.0,
                         "gl_passAy": _num(g, "passingAirYards"), "gl_sacks": _num(g, "sacksSuffered"), "gl_rec": _num(g, "receptions"),
                         "gl_yac": _num(g, "receivingYardsAfterCatch"), "gl_carries": _num(g, "carries"), "gl_tgt": _num(g, "targets"),
                         "gl_rushFd": _num(g, "rushingFirstDowns"), "gl_recFd": _num(g, "receivingFirstDowns"),
                         "gl_rushEpa": _num(g, "rushingEpa"), "gl_recEpa": _num(g, "receivingEpa")})
    df = pd.DataFrame(rows, columns=["pid", "w"] + GL_COLS)
    return df.groupby(["pid", "w"], as_index=False)[GL_COLS].sum()


def build_extras(first=FIRST_SEASON, last=MAX_SEASON, repo=REPO):
    """Rows `pid` (str), `S`, `w` + the `gl_*` columns for seasons first..last."""
    parts = []
    for y in range(first, last + 1):
        d = load_gamelogs_season(y, repo)
        d.insert(1, "S", y)
        parts.append(d)
    return pd.concat(parts, ignore_index=True)


def file_hashes(first=FIRST_SEASON, last=MAX_SEASON, repo=REPO):
    """{ year: sha256 } of the gamelogs files first..last — stateless."""
    out = {}
    for y in range(first, last + 1):
        with open(_path(y, repo), "rb") as f:
            out[str(y)] = hashlib.sha256(f.read()).hexdigest()
    return out
