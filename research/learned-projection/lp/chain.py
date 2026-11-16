"""LP-2a (§7.1, §7.2, §7.4): targets, clip bounds, minor constants and the composition of season points.

A target is (r, e): a rate in target units and its exposure. `pg`: r = sum(key) / g, e = g. `po`: r = sum(key) / sum(den), e = sum(den).
`gamesShare`: r = gamesPlayed / teamGames of the season (0 with no `hasRow`), e = 1 when a `seasons` row exists (else 0)."""
import numpy as np
import pandas as pd

from . import features


def target_names(spec, pos):
    return [t["name"] for t in spec["targets"][pos]]


def is_yardage(name):
    return name.endswith("_yd")


def season_target_frame(ps_s, seasons_s, spec, pos, pids):
    """E0 (r, e) per target of `pos` for `pids`: ps_s = player-season rows of one season indexed by pid; seasons_s = `seasons` rows of that
    season indexed by pid. Returns {name: (r, e)} as float arrays aligned with `pids`."""
    L = ps_s.reindex(pids)
    g = L["g"].to_numpy(float)
    out = {}
    for t in spec["targets"][pos]:
        nme = t["name"]
        if t["kind"] == "pg":
            r = features._ratio(L[t.get("num", nme)], g)
            e = np.where(g > 0, g, 0.0)
        elif t["kind"] == "po":
            den = sum(L[d].to_numpy(float) for d in t["den"])
            r = features._ratio(L[nme], den)
            e = np.where(np.nan_to_num(den) > 0, den, 0.0)
        else:
            sl = seasons_s.reindex(pids)
            gp, tg = sl["gamesPlayed"].to_numpy(float), sl["teamGames"].to_numpy(float)
            ok = np.isfinite(gp) & np.isfinite(tg) & (tg > 0)
            r = np.where(ok, gp / np.where(tg > 0, tg, 1.0), np.nan)
            e = ok.astype(float)
        e = np.where(np.isfinite(r), e, 0.0)
        out[nme] = (r, e)
    return out


def minor_keys(spec, pos, keys):
    cov = {t["name"] for t in spec["targets"][pos] if t["kind"] in ("po", "pg")}
    return [k for k in keys if k not in cov]


def minor_constants(ps_rows, spec, pos, keys):
    """Sum of key / sum of `g` over the fit's training rows at the position (raw)."""
    g = float(ps_rows["g"].sum())
    return {k: (float(ps_rows[k].sum()) / g if g > 0 else 0.0) for k in minor_keys(spec, pos, keys)}


def clip_bounds(r, e, name):
    """[min, max] of the target among rows at or above the median exposure (median over rows with exposure > 0); >= 0 for every
    non-yardage target; games share in [0, 1]. Training targets are never winsorised."""
    r, e = np.asarray(r, float), np.asarray(e, float)
    pos_e = e[e > 0]
    if not len(pos_e):
        return (-np.inf, np.inf)
    sel = (e >= np.median(pos_e)) & np.isfinite(r)
    lo, hi = (float(np.min(r[sel])), float(np.max(r[sel]))) if sel.any() else (-np.inf, np.inf)
    if name == "gamesShare":
        return (0.0, 1.0)
    if not is_yardage(name):
        lo = max(lo, 0.0)
    return (lo, hi)


def season_points(pred, spec, pos, minor, weights, team_games, c=1.0):
    """Composition (§7.4). `pred` = {target: array in NATIVE units} for the rows. Per-game key value = opportunity per game x rate
    (`bonus_fd_rb`: x the sum of both predicted opportunities), or the direct per-game prediction, or the minor constant.
    ppg = sum_k weights[k] x value_k, unrounded; games = share x teamGames_k; total = c x games x ppg."""
    n = len(team_games)
    vals = {}
    for t in spec["targets"][pos]:
        nme = t["name"]
        if t["kind"] == "po":
            vals[nme] = pred[nme] * sum(pred[d] for d in t["den"])
        elif t["kind"] == "pg" and t.get("role") != "opp":
            vals[nme] = np.asarray(pred[nme], float)
    for k, m in minor.items():
        vals[k] = np.full(n, float(m))
    ppg = np.zeros(n)
    for k, wt in weights.items():
        if k in vals:
            ppg = ppg + wt * vals[k]
    share = np.asarray(pred["gamesShare"], float)
    games = share * np.asarray(team_games, float)
    df = pd.DataFrame({"share": share, "games": games, "ppg": ppg, "total": c * games * ppg, "c": float(c)})
    for k, v in vals.items():
        df["kv_" + k] = v
    return df
