"""Benchmark 4 — Sleeper's weekly projections mapped onto the panel's key vector (task §4.6). REPORT-ONLY (timing unverifiable, F7).

Per (pid, S, w): the projected `stats` mapped onto meta.keys (absent key -> 0), then `bonus_rec_te = rec` for a TE and
`bonus_fd_<pos> = rec_fd + rush_fd + pass_fd` where the projection carries them and the league key exists. Threshold bonuses
(bonus_*_yd_100/200) stay 0 — the projection carries no distribution. b4 = score(x, weights). A (pid, S, w) with no projection
row — or whose `stats` carry none of the panel keys — is uncovered.
"""
import json
import os

import pandas as pd

from .score import score

SKILL = ("QB", "RB", "WR", "TE")


def row_position(row):
    p = row.get("player")
    if isinstance(p, dict) and p.get("position"):
        return p["position"]
    return row.get("position")


def project_row(stats, position, weight_keys, weights):
    """→ b4 (float) or None when the stats carry no panel key."""
    if not any(k in stats for k in weight_keys):
        return None
    x = {k: stats.get(k, 0) or 0 for k in weight_keys}
    if position == "TE" and "bonus_rec_te" in x:
        x["bonus_rec_te"] = stats.get("rec", 0) or 0
    fd_key = "bonus_fd_%s" % position.lower()
    if fd_key in x and any(k in stats for k in ("rec_fd", "rush_fd", "pass_fd")):
        x[fd_key] = (stats.get("rec_fd", 0) or 0) + (stats.get("rush_fd", 0) or 0) + (stats.get("pass_fd", 0) or 0)
    return score([x[k] for k in weight_keys], weights)


def load_projections(proj_dir, weight_keys, weights, seasons=range(2018, 2026)):
    """→ DataFrame(pid, S, w, b4) over every cached file of the given seasons."""
    out = []
    for name in sorted(os.listdir(proj_dir)):
        if not name.endswith(".json") or name == "index.json":
            continue
        season, week = (int(p) for p in name[:-5].split("-"))
        if season not in seasons:
            continue
        with open(os.path.join(proj_dir, name)) as f:
            rows = json.load(f)
        for r in rows:
            pos = row_position(r)
            if pos not in SKILL or not isinstance(r.get("stats"), dict):
                continue
            b4 = project_row(r["stats"], pos, weight_keys, weights)
            if b4 is not None:
                out.append((str(r["player_id"]), season, week, b4))
    df = pd.DataFrame(out, columns=["pid", "S", "w", "b4"])
    return df.drop_duplicates(["pid", "S", "w"])
