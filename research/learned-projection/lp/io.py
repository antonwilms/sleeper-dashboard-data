"""Reads the Node exporter's cache (research/learned-projection/.cache/panel/): meta.json + four JSON-Lines tables."""
import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_ROOT = os.path.join(HERE, ".cache")
PANEL_DIR = os.path.join(CACHE_ROOT, "panel")
RAW_COLS = ["pass_att", "pass_cmp", "rush_att", "rec_tgt", "rec_air_yd", "rec_rz_tgt", "rush_rz_att", "pass_rz_att", "pass_sack"]
TEAM_SUM_COLS = ["rec_tgt", "rush_att", "pass_att", "rec_rz_tgt", "rush_rz_att"]
POSITIONS = ("QB", "RB", "WR", "TE")


def _jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


class Panel:
    """meta, weights (DataFrame, no x), X (n_rows x n_keys, NaN when not played), teams, seasons, bench."""

    def __init__(self, meta, weeks, X, teams, seasons, bench):
        self.meta, self.weeks, self.X, self.teams, self.seasons, self.bench = meta, weeks, X, teams, seasons, bench

    @property
    def Xw(self):
        """X with its columns in `weight_keys` order (the scoring file's key order) — the order `weights` sums in."""
        order = [self.meta["keys"].index(k) for k in self.meta["weights"]]
        return self.X[:, order]

    @property
    def keys(self):
        return self.meta["keys"]

    @property
    def weights(self):
        return [self.meta["weights"][k] for k in self.meta["weights"]]

    @property
    def weight_keys(self):
        return list(self.meta["weights"].keys())


def load_cache(panel_dir=PANEL_DIR):
    with open(os.path.join(panel_dir, "meta.json")) as f:
        meta = json.load(f)
    rows = _jsonl(os.path.join(panel_dir, "weeks.jsonl"))
    keys = meta["keys"]
    X = np.full((len(rows), len(keys)), np.nan)
    for i, r in enumerate(rows):
        if r["x"] is not None:
            X[i, :] = r["x"]
    for r in rows:
        raw = r.pop("raw")
        r.pop("x")
        for k in RAW_COLS:
            r[k] = (raw.get(k, 0) if raw is not None else np.nan)
    weeks = pd.DataFrame(rows)
    weeks["pid"] = weeks["pid"].astype(str)
    weeks["pts"] = weeks["pts"].astype(float)
    weeks["depthOrder"] = weeks["depthOrder"].astype(float)
    weeks["rid"] = np.arange(len(weeks))
    teams_rows = _jsonl(os.path.join(panel_dir, "teams.jsonl"))
    teams = pd.DataFrame([{"team": t["team"], "S": t["S"], "w": t["w"], "opp": t["opp"],
                           **{"sum_" + k: t["sums"][k] for k in TEAM_SUM_COLS}} for t in teams_rows])
    seasons = pd.DataFrame(_jsonl(os.path.join(panel_dir, "seasons.jsonl")))
    seasons["pid"] = seasons["pid"].astype(str)
    b = []
    for r in _jsonl(os.path.join(panel_dir, "bench.jsonl")):
        d = {"pid": str(r["pid"]), "S": r["S"], "position": r["position"]}
        for k, v in r["b1"].items():
            d["b1_" + k] = v
        d["b2_ppg"], d["b2_total"] = r["b2"]["ppg"], r["b2"]["total"]
        b.append(d)
    bench = pd.DataFrame(b)
    return Panel(meta, weeks, X, teams, seasons, bench)


def load_benchw(panel_dir=PANEL_DIR):
    """LP-1b: `benchw.jsonl` + `benchw.meta.json` (written by `node bin/learned.mjs export-weekly`) → (DataFrame, meta).
    Raises FileNotFoundError when either file is absent. `pid` is a str."""
    mp = os.path.join(panel_dir, "benchw.meta.json")
    jp = os.path.join(panel_dir, "benchw.jsonl")
    if not (os.path.exists(mp) and os.path.exists(jp)):
        raise FileNotFoundError("benchw.jsonl / benchw.meta.json absent in %s — run `node bin/learned.mjs export-weekly` first" % panel_dir)
    with open(mp) as f:
        meta = json.load(f)
    df = pd.DataFrame(_jsonl(jp))
    df["pid"] = df["pid"].astype(str)
    return df, meta
