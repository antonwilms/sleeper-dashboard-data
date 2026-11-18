"""LP-2b-1b synthetic weekly-model fixtures: a frame with the 2b-1a pkl schema (identity, every feature group, the prior group, the target columns) built
from a STATED data-generating process, plus the `hist` rows behind its form columns, `rel` flags and a stand-in store. No cache, no panel.

DGP. Every player has a skill s_p (and a season wobble); a player plays a row with probability p_pid and has no row in his team's bye week. For a played
row each weekly target t of his position has a rate: opportunities (`pg`: pass_att, rush_att, rec_tgt) around BASE[t] x s; other `pg` keys around BASE[t];
`po` targets rate = BASE[t] x (1 + 0.3 (s - 1)) with noise shrinking in sqrt(opportunities) and exposure = the sum of the denominators' values.
`pr_<t>` is the player-season's true level times a 10% wobble. `pts` = 1.2 x the composed realised line + noise (so a calibration factor is needed).
Form columns come from `weekly_h.evidence` on `hist`, so the 2b-1a cross-checks hold on the fixture by construction."""
import copy

import numpy as np
import pandas as pd

from lp import chain, spec as spec_mod, spec_w, spec_wm, weekly_h
from tests import synth_season as ss

POS_N = {"QB": 6, "RB": 8, "WR": 10, "TE": 6}
BASE = {"pass_att": 30.0, "rush_att": None, "rec_tgt": None, "pass_yd": 7.0, "pass_td": 0.05, "pass_int": 0.025, "rush_yd": 4.2, "rush_td": 0.03, "rec": 0.65, "rec_yd": 9.0,
        "rec_td": 0.05, "bonus_fd_rb": 0.2, "bonus_fd_wr": 0.2, "bonus_rec_te": 0.65, "bonus_fd_te": 0.2, "fum_lost": 0.2, "kr_yd": 2.0, "bonus_rush_yd_100": 0.2, "pr_yd": 1.0,
        "bonus_rec_yd_100": 0.2}
OPP_BASE = {("QB", "rush_att"): 3.0, ("RB", "rush_att"): 12.0, ("RB", "rec_tgt"): 3.0, ("WR", "rec_tgt"): 7.0, ("TE", "rec_tgt"): 5.0}
SMALL_G = {"learning_rate": 0.1, "max_iter": 15, "max_leaf_nodes": 4, "min_samples_leaf": 8, "l2_regularization": 1.0}
TEST_SEED = 7


_DEFAULT = {n: spec_wm.default_spec_w(n) for n in spec_wm.NAMES}          # built once, unpatched (default_spec_w asserts LAST_SEASON)


def small_spec_w(name):
    """The registered spec with the test overrides: seed 7, a small `gPoint` (G), `calibMinRows` 5."""
    s = copy.deepcopy(_DEFAULT[name])
    s["seed"], s["calibMinRows"] = TEST_SEED, 5
    if name == "G":
        s["gPoint"] = dict(SMALL_G)
    return s


class FakeStore:
    """The slice of `season_models.Store` that the weekly models use: `struct`, `weights`, `pos`, `keys`, `minor`."""

    def __init__(self, pos=None):
        self.struct = {"targets": spec_mod.targets_spec()}
        self.weights, self.keys, self.pos = dict(ss.WEIGHTS), list(ss.KEYS), dict(pos or {})

    def minor(self, train_S, pos):
        return {k: 0.05 for k in chain.minor_keys(self.struct, pos, self.keys)}


def _tdefs(P):
    return [t for t in spec_mod.targets_spec()[P] if t["name"] != "gamesShare"]


class World:
    pass


def make_frame(seed=0, seasons=(2018, 2019, 2020, 2021), W=8, pos_n=None):
    """-> World with .frame (2b-1a schema), .hist, .rel, .store, .spec_w (inputs_spec), .p (pid -> play probability)."""
    rng = np.random.RandomState(seed)
    sp = spec_w.inputs_spec()
    ts = sp["targets"]
    pos_n = pos_n or POS_N
    players, pos_of = [], {}
    k = 0
    for P, n in pos_n.items():
        for _ in range(n):
            pid = "%s%02d" % (P[0], k)
            players.append(dict(pid=pid, P=P, skill=float(rng.uniform(0.6, 1.5)), p=float(rng.uniform(0.55, 0.95)), bye=int(rng.randint(2, W)), team="TM%d" % (k % 4), age0=int(rng.randint(22, 30))))
            pos_of[pid] = P
            k += 1
    rows, hist_rows = [], []
    for S in seasons:
        for pl in players:
            P, s = pl["P"], pl["skill"] * float(np.exp(rng.normal(0, 0.1)))
            lvl = {}
            for t in _tdefs(P):
                nme = t["name"]
                if t["kind"] == "pg" and t.get("role") == "opp":
                    lvl[nme] = OPP_BASE[(P, nme)] * s if (P, nme) in OPP_BASE else BASE[nme] * s
                elif t["kind"] == "pg":
                    lvl[nme] = BASE[nme]
                else:
                    lvl[nme] = BASE[nme] * (1.0 + 0.3 * (s - 1.0))
            prior = {t: lvl[t] * float(np.exp(rng.normal(0, 0.1))) for t in lvl}
            no_prior = bool(rng.rand() < 0.05)
            gs = float(np.clip(pl["p"] + rng.normal(0, 0.05), 0.05, 0.99))
            prev = np.nan
            for w in range(1, W + 1):
                if w == pl["bye"]:
                    continue
                played = bool(rng.rand() < pl["p"])
                row = dict(pid=pl["pid"], S=S, w=w, position=P, team=pl["team"], opp="OP%d" % (w % 3), played=played, playedPrev=prev, gs=gs, noPrior=float(no_prior), prior=prior,
                           age=float(pl["age0"] + S - seasons[0]))
                prev = float(played)
                r, e = {t: np.nan for t in ts}, {t: np.nan for t in ts}
                for t in _tdefs(P):
                    e[t["name"]] = 0.0
                if played:
                    val = {}
                    for t in _tdefs(P):                                                  # opportunities and plain per-game keys first
                        if t["kind"] == "pg":
                            val[t["name"]] = max(0.0, float(lvl[t["name"]] * (1.0 + rng.normal(0, 0.25))))
                    for t in _tdefs(P):
                        nme = t["name"]
                        if t["kind"] == "pg":
                            r[nme], e[nme] = val[nme], 1.0
                        else:
                            ex = float(sum(val[d] for d in t["den"]))
                            if ex > 0:
                                r[nme] = float(lvl[nme] * (1.0 + rng.normal(0, 0.5) / np.sqrt(max(ex, 1.0))))
                                e[nme] = ex
                    h = {"pid": pl["pid"], "S": S, "w": w}
                    for t in ts:
                        h["num_" + t] = h["exp_" + t] = np.nan
                    for t in _tdefs(P):
                        nme = t["name"]
                        ok = np.isfinite(r[nme]) and e[nme] > 0
                        h["num_" + nme] = r[nme] * e[nme] if ok else 0.0
                        h["exp_" + nme] = e[nme] if ok else 0.0
                    hist_rows.append(h)
                row["r"], row["e"] = r, e
                row["ppg_true"] = _ppg(P, {t["name"]: (r[t["name"]] if np.isfinite(r[t["name"]]) else 0.0) for t in _tdefs(P)})
                rows.append(row)
    hist = pd.DataFrame(hist_rows).sort_values(["pid", "S", "w"], kind="mergesort").reset_index(drop=True)
    fr = pd.DataFrame({"pid": [r["pid"] for r in rows], "S": [r["S"] for r in rows], "w": [r["w"] for r in rows], "position": [r["position"] for r in rows],
                       "team": [r["team"] for r in rows], "opp": [r["opp"] for r in rows]})
    N = len(fr)
    E, Nn = weekly_h.evidence(hist, fr["pid"].to_numpy(object), fr["S"].to_numpy(int), fr["w"].to_numpy(int) - 1, [1.0, sp["gRecDecay"]])
    N_ = Nn
    cols = {}
    posv = fr["position"].to_numpy(object)
    for t in ts:
        j = ts.index(t)
        for pre, a, b in (("ex_", E[0], None), ("std_", N_[0], E[0]), ("rec_", N_[1], E[1])):
            v = np.full(N, np.nan)
            for P in sp["targetsByPos"]:
                if t in sp["targetsByPos"][P]:
                    m = posv == P
                    v[m] = a[m, j] if b is None else np.where(b[m, j] > 0, a[m, j] / np.where(b[m, j] > 0, b[m, j], 1.0), np.nan)
            cols[pre + t] = v
    nP = np.array([int(((hist["pid"] == p) & (hist["S"] == S) & (hist["w"] < w)).sum()) for p, S, w in zip(fr["pid"], fr["S"], fr["w"])], float)
    cols["nP"], cols["wk"] = nP, fr["w"].to_numpy(float)
    for g in ("usage", "avail", "absence", "opp", "team", "game", "gl", "bio"):
        for c in sp["groups"][g]:
            cols[c] = rng.normal(0, 1, N)
            cols[c][rng.rand(N) < 0.05] = np.nan
    cols["playedPrev"] = np.array([r["playedPrev"] for r in rows], float)
    cols["first"] = (np.isnan(cols["playedPrev"])).astype(float)
    cols["age"] = np.array([r["age"] for r in rows], float)
    cols["exp"] = np.maximum(0.0, cols["age"] - 22.0)
    cols["isRookie"] = (cols["exp"] == 0).astype(float)
    for t in ts:
        v = np.full(N, np.nan)
        for i, r in enumerate(rows):
            if t in r["prior"]:
                v[i] = r["prior"][t]
        cols["pr_" + t] = v
    cols["pr_gamesShare"] = np.array([r["gs"] for r in rows], float)
    cols["noPrior"] = np.array([r["noPrior"] for r in rows], float)
    for t in ts:
        cols["dstd_" + t] = cols["std_" + t] - cols["pr_" + t]
        cols["drec_" + t] = cols["rec_" + t] - cols["pr_" + t]
    for t in ts:
        cols["r_" + t] = np.array([r["r"][t] for r in rows], float)
    for t in ts:
        cols["e_" + t] = np.array([r["e"][t] for r in rows], float)
    cols["played"] = np.array([r["played"] for r in rows], bool)
    ppg = np.array([r["ppg_true"] for r in rows], float)
    cols["pts"] = np.where(cols["played"], 1.2 * ppg + rng.normal(0, 2.0, N), np.nan)
    order = sp["identity"] + spec_w.feature_names(sp) + sp["priorCols"] + sp["targetCols"]
    frame = pd.concat([fr, pd.DataFrame(cols)], axis=1)[order].copy()
    rel = frame[["pid", "S", "w"]].copy()
    rel["relevant"] = rng.rand(N) < 0.8
    out = World()
    out.frame, out.hist, out.rel, out.spec_w, out.pos = frame, hist, rel, sp, pos_of
    out.store = FakeStore(pos_of)
    out.p = {pl["pid"]: pl["p"] for pl in players}
    return out


def _ppg(P, vals):
    """The composed ppg of realised per-target values (rate x opportunities for `po`), with the fake store's minor constants — the DGP's own `pts` source."""
    st = FakeStore()
    q = {k: np.array([v]) for k, v in vals.items()}
    q["gamesShare"] = np.ones(1)
    return float(chain.season_points(q, st.struct, P, st.minor([], P), st.weights, np.ones(1), 1.0)["ppg"].iloc[0])
