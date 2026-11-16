"""LP-2a (§7, §9): the fold driver — the store of as-of tables, inner selection, per-position median calibration, the ablation arms.

`fold(store, name, spec, T, env)` calls `registry.require(name, T)` itself, before any fit, whenever T >= 2019."""
import time

import numpy as np
import pandas as pd

from . import asof, baselines, chain, era, features, model_g, model_h, registry, splits

POSITIONS = era.POSITIONS
EVAL_START = 2019


class Store:
    """The as-of tables plus memoised per-season products (all fold-independent: season s products read only seasons < s plus season-s ex-ante)."""

    def __init__(self, tables, keys, weights, spec, positions=None):
        self.tables, self.keys, self.weights = tables, list(keys), dict(weights)
        self.struct = {k: spec[k] for k in ("features", "targets", "topN", "desc")}
        self.pos = positions if positions is not None else features.position_map(tables)
        self.max_season = int(tables.seasons["S"].max())
        self._u, self._ps, self._f, self._mu, self._tr, self._tv = {}, {}, {}, {}, {}, {}

    def check(self, spec):
        for k, v in self.struct.items():
            if spec[k] != v:
                raise AssertionError("spec key %s differs from the store's" % k)

    def universe(self, S):
        if S not in self._u:
            self._u[S] = features.universe(self.tables, S)
        return self._u[S]

    def view(self, S):
        return asof.view(self.tables, S, 0)

    def ps(self, S):
        """Player-seasons of every season < S, read through view(S, 0)."""
        if S not in self._ps:
            self._ps[S] = features.player_seasons(self.view(S), self.keys, self.weights)
        return self._ps[S]

    def subjects(self, S):
        out, seen = [], set()
        for s in range(S, S + 4):
            for p in self.universe(s):
                if p not in seen:
                    seen.add(p)
                    out.append(p)
        return out

    def feats(self, S):
        """E0 features at origin (S, 0) for the universe of S and of the three following seasons (history descriptors need them)."""
        if S not in self._f:
            v = self.view(S)
            F = features.season_features(v, self.subjects(S), self.universe(S), {**self.struct, "desc": self.struct["desc"]}, self.pos, self.keys, ps=self.ps(S))
            self._f[S] = F.set_index("pid", drop=False)
        return self._f[S]

    def mu(self, T):
        """League means of every season < T (each season's mean reads that season's rows only)."""
        if T not in self._mu:
            self._mu[T] = era.league_means(self.ps(T), self.struct)
        return self._mu[T]

    def target_rows(self, S, pos, direct=False):
        """E0 (pids, {name: (r, e)}) of season S for the position's rows — read through view(S + 1, 0)."""
        key = (S, pos, direct)
        if key not in self._tr:
            ps = self.ps(S + 1)
            ps_s = ps[(ps["s"] == S) & (ps["position"] == pos)].drop_duplicates("pid").set_index("pid")
            v = self.view(S + 1)
            sea = v.seasons[v.seasons["S"] == S].drop_duplicates("pid").set_index("pid")
            sea = sea[[self.pos.get(p) == pos for p in sea.index]]
            pids = sorted(set(ps_s.index) | set(sea.index))
            ps_s = ps_s.reindex(pids)
            self._tr[key] = (pd.Index(pids), chain.season_target_frame(ps_s, sea, self.spec_for(direct), pos, pids))
        return self._tr[key]

    def spec_for(self, direct):
        t = {p: list(self.struct["targets"][p]) for p in POSITIONS}
        if direct:
            for p in POSITIONS:
                t[p] = [{"name": "ppg", "kind": "pg", "num": "pts"}] + [x for x in t[p] if x["name"] == "gamesShare"]
        return {"targets": t}

    def minor(self, train_S, pos):
        parts = []
        for S in train_S:
            ps = self.ps(S + 1)
            u = set(self.universe(S))
            parts.append(ps[(ps["s"] == S) & (ps["position"] == pos) & ps["pid"].isin(u)])
        rows = pd.concat(parts, ignore_index=True)
        return chain.minor_constants(rows, self.struct, pos, self.keys)


def _targets(store, pos, direct):
    return store.spec_for(direct)["targets"][pos]


def _take(arr, j, fill):
    """arr[j] with `fill` where j < 0 (pid not in the index) — also when arr is empty."""
    j = np.asarray(j)
    if len(arr) == 0:
        return np.full(len(j), fill, dtype=float)
    return np.where(j >= 0, np.asarray(arr, float)[np.maximum(j, 0)], fill)


def build_data(store, spec, pos, train_S, pred_S, units, drop=(), direct=False, hist=True):
    names_full = list(features.fmeta(spec, pos, drop))
    names_desc = features.desc_names(spec, pos, drop)
    tdefs = _targets(store, pos, direct)
    uf = {}

    def U(s):
        if s not in uf:
            uf[s] = features.apply_units(store.feats(s), s, spec, units)
        return uf[s]

    def div(name, kind, s):
        return units.div(pos, name if name != "ppg" else "ppg", s - 1) if kind in ("pg", "po") else 1.0

    out = {}
    for part, Slist in (("train", train_S), ("pred", pred_S)):
        pids, Sarr = [], []
        for S in Slist:
            p = [x for x in store.universe(S) if store.pos.get(x) == pos]
            pids += p
            Sarr += [S] * len(p)
        pids = np.array(pids, dtype=object)
        Sarr = np.array(Sarr, dtype=int)
        Xf = np.full((len(pids), len(names_full)), np.nan)
        Xd = np.full((len(pids), len(names_desc)), np.nan)
        tm = np.full(len(pids), np.nan)
        for S in Slist:
            m = Sarr == S
            Fs = U(S)
            Xf[m] = Fs.loc[list(pids[m]), names_full].to_numpy(float)
            Xd[m] = Fs.loc[list(pids[m]), names_desc].to_numpy(float)
            tm[m] = store.feats(S).loc[list(pids[m]), "teamGames_k"].to_numpy(float)
        d = {"pids": pids, "S": Sarr, "Xf": Xf, "Xd": Xd, "teamGames": tm}
        if part == "train" or True:
            tg = {}
            for t in tdefs:
                r = np.full(len(pids), np.nan)
                e = np.zeros(len(pids))
                for S in Slist:
                    m = Sarr == S
                    idx, fr = store.target_rows(S, pos, direct)
                    rr, ee = fr[t["name"]]
                    j = idx.get_indexer(list(pids[m]))
                    ok = j >= 0
                    rv = _take(rr, j, np.nan)
                    ev = _take(ee, j, 0.0)
                    dv = div(t["name"], t["kind"], S)
                    rv = rv / dv
                    ev = np.where(np.isfinite(rv), ev, 0.0)
                    r[m], e[m] = rv, ev
                tg[t["name"]] = (r, e)
            d["targets"] = tg
        if hist and (part == "pred" or part == "train"):
            H = {}
            hx = {}
            for l in features.LAGS:
                Xl = np.full((len(pids), len(names_desc)), np.nan)
                present = np.zeros(len(pids), bool)
                for S in Slist:
                    s = S - l
                    m = Sarr == S
                    if s < era.FIRST_SEASON:
                        continue
                    Fs = U(s)
                    j = Fs.index.get_indexer(list(pids[m]))
                    ok = j >= 0
                    sub = Fs[names_desc].to_numpy(float)
                    blk = np.where(ok[:, None], sub[np.maximum(j, 0)], np.nan)
                    Xl[m] = blk
                    present[m] = ok
                hx[l] = (Xl, present)
            for t in tdefs:
                H[t["name"]] = {}
                for l in features.LAGS:
                    r = np.full(len(pids), np.nan)
                    e = np.zeros(len(pids))
                    for S in Slist:
                        s = S - l
                        if s < era.FIRST_SEASON:
                            continue
                        m = Sarr == S
                        idx, fr = store.target_rows(s, pos, direct)
                        rr, ee = fr[t["name"]]
                        j = idx.get_indexer(list(pids[m]))
                        ok = j >= 0
                        rv = _take(rr, j, np.nan) / div(t["name"], t["kind"], s)
                        ev = np.where(ok & np.isfinite(rv), _take(ee, j, 0.0), 0.0)
                        r[m], e[m] = rv, ev
                    e = np.where(hx[l][1], e, 0.0)
                    H[t["name"]][l] = {"X": hx[l][0], "r": r, "e": e}
            d["hist"] = H
        out[part] = d
    out["names_full"], out["names_desc"] = names_full, names_desc
    return out


def fit_family(family, spec, data, pos, lam, gname, units, direct=False, store=None, targets=None):
    """Fit every target of a position; returns (preds in NATIVE units {name: array}, info {name: ...}, clip bounds)."""
    tr, pr = data["train"], data["pred"]
    s_max = int(tr["S"].max())
    wseason = era.season_weights(tr["S"], s_max, lam)
    preds, info = {}, {}
    for t in targets:
        nme = t["name"]
        r, e = tr["targets"][nme]
        w = e * wseason
        m = (e > 0) & np.isfinite(r)
        if family == "H":
            trd = {"S": tr["S"][m], "X": tr["Xd"][m], "r": r[m], "e": e[m], "w": w[m],
                   "hist": {l: {"X": tr["hist"][nme][l]["X"][m], "r": tr["hist"][nme][l]["r"][m], "e": tr["hist"][nme][l]["e"][m]} for l in features.LAGS}}
            prd = {"P": pr["S"], "X": pr["Xd"], "hist": {l: pr["hist"][nme][l] for l in features.LAGS}}
            res = model_h.fit_target(trd, prd, spec["alphas"], spec["kMult"], spec["deltas"])
            p = res["pred"]
            info[nme] = {k: res[k] for k in ("alpha", "kmult", "delta")}
        else:
            p = model_g.fit_target(spec, nme, gname, tr["Xf"], r, e, w, pr["Xf"])
        lo, hi = chain.clip_bounds(r[m], e[m], nme)
        p = np.clip(p, lo, hi)
        div = np.array([units.div(pos, nme, int(P) - 1) if t["kind"] in ("pg", "po") else 1.0 for P in pr["S"]])
        preds[nme] = p * div
    return preds, info


def compose(store, spec, pos, data, preds, minor, c=1.0, direct=False):
    pr = data["pred"]
    if direct:
        share = preds["gamesShare"]
        games = share * pr["teamGames"]
        ppg = preds["ppg"]
        df = pd.DataFrame({"share": share, "games": games, "ppg": ppg, "total": c * games * ppg, "c": float(c)})
    else:
        df = chain.season_points(preds, store.struct, pos, minor, store.weights, pr["teamGames"], c)
    df.insert(0, "pid", pr["pids"])
    df.insert(1, "T", pr["S"])
    return df


def _inner_scores(store, T, pos, frame):
    rows = []
    for s in (T - 2, T - 1):
        st = baselines.season_targets(store.tables, s)
        st = st[(st["position"] == pos) & st["headline"]][["pid", "actual"]]
        st["S"] = s
        rows.append(st)
    st = pd.concat(rows)
    f = frame.rename(columns={"T": "S"}).merge(st, on=["pid", "S"])
    return f


def run_entry(store, spec, family, pos, T, entry, drop=(), direct=False, need_c=True):
    """One (era, lambda[, g]) entry: inner fit for the validation frame, then (optionally) the refit on 2014..T-1 predicting T."""
    mu = store.mu(T)
    tdefs = _targets(store, pos, direct)
    ti, tv = splits.inner_split(T)
    ui = era.Units(mu, entry["era"], T - 2)
    di = build_data(store, spec, pos, list(ti), list(tv), ui, drop, direct, hist=(family == "H"))
    pi_, info_i = fit_family(family, spec, di, pos, entry["lam"], entry.get("g"), ui, direct, store, tdefs)
    mi = store.minor(ti, pos)
    fi = compose(store, spec, pos, di, pi_, mi, 1.0, direct)
    return di, fi, info_i, ui


def refit(store, spec, family, pos, T, entry, c, drop=(), direct=False):
    mu = store.mu(T)
    tdefs = _targets(store, pos, direct)
    tr = list(splits.train_seasons(T))
    u = era.Units(mu, entry["era"], T - 1)
    d = build_data(store, spec, pos, tr, [T], u, drop, direct, hist=(family == "H"))
    p, info = fit_family(family, spec, d, pos, entry["lam"], entry.get("g"), u, direct, store, tdefs)
    minor = store.minor(tr, pos)
    return compose(store, spec, pos, d, p, minor, c, direct), info, u


def calibrate(frame_inner, min_rows):
    ok = frame_inner[(frame_inner["actual"] > 0) & (frame_inner["total"] > 0)]
    if len(ok) < min_rows:
        return 1.0, int(len(ok))
    return float(np.median(ok["actual"] / ok["total"])), int(len(ok))


def run_position(store, spec, family, pos, T, grid=None, forced=None, drop=(), direct=False, log=lambda m: None):
    """(frame for T, details) for one position. With `forced` (an entry) there is no selection — only the inner fit that recomputes c."""
    grid = spec["grid"] if grid is None else grid
    t0 = time.time()
    scores = []
    keep = {}
    if forced is None:
        for entry in grid:
            di, fi, info_i, ui = run_entry(store, spec, family, pos, T, entry, drop, direct)
            f = _inner_scores(store, T, pos, fi)
            mae = float(np.abs(f["total"] - f["actual"]).mean())
            scores.append(mae)
            keep[len(scores) - 1] = (f, info_i, ui)
        best = int(np.argmin(scores))                     # a tie goes to the earlier entry
        entry = grid[best]
        f, info_i, ui = keep[best]
    else:
        entry = forced
        di, fi, info_i, ui = run_entry(store, spec, family, pos, T, entry, drop, direct)
        f = _inner_scores(store, T, pos, fi)
        best, scores = None, []
    c, nc = calibrate(f, spec["calibMinRows"])
    frame, info, u = refit(store, spec, family, pos, T, entry, c, drop, direct)
    details = {"entry": entry, "index": best, "innerMae": scores, "c": c, "cRows": nc, "params": info, "fallback": sorted("%s:%s" % k for k in u.fallback),
               "seconds": round(time.time() - t0, 1)}
    return frame, details


def fold(store, name, spec, T, env=None, arms=False, log=lambda m: None):
    """Fit candidate `name` for test season T (all four positions). Calls require() itself, before any fit, when T >= 2019.
    Returns (frame of totals with the components, {pos: details}); with `arms` also the §10.4 ablation arms."""
    if T >= EVAL_START:
        registry.require(name, T, "season", env)
    store.check(spec)
    frames, det = [], {}
    for pos in POSITIONS:
        fr, d = run_position(store, spec, name, pos, T, log=log)
        fr["position"] = pos
        frames.append(fr)
        det[pos] = d
        log("%s T=%d %s entry=%s c=%.3f (%ss)" % (name, T, pos, d["entry"], d["c"], d["seconds"]))
    main = pd.concat(frames, ignore_index=True)
    out = {"main": main, "details": det}
    if arms:
        out["arms"] = run_arms(store, name, spec, T, det, main, log)
    return out["main"], out


def run_arms(store, family, spec, T, det, main, log):
    """§10.4 — each arm is the chosen entry of the fold and position with ONE change and c recomputed by one inner fit; unlabelled."""
    res = {}
    lams = sorted(set(e["lam"] for e in spec["grid"]))
    for pos in POSITIONS:
        entry = det[pos]["entry"]
        m = main[main["position"] == pos]
        variants = {"c=1": None}
        for g in ("gl", "team", "role", "dur"):
            variants["drop_" + g] = {"drop": (g,)}
        for e in ("E0", "E1"):
            if e != entry["era"]:
                variants["era_" + e] = {"entry": {**entry, "era": e}}
        for lam in lams:
            if lam != entry["lam"]:
                variants["lam_%g" % lam] = {"entry": {**entry, "lam": lam}}
        variants["direct"] = {"direct": True}
        for vn, kw in variants.items():
            if kw is None:
                fr = m[["pid", "T"]].copy()
                fr["total"] = (m["games"] * m["ppg"]).to_numpy()
            else:
                fr, _d = run_position(store, spec, family, pos, T, forced=kw.get("entry", entry), drop=kw.get("drop", ()), direct=kw.get("direct", False))
            res[(pos, vn)] = fr[["pid", "T", "total"]]
        log("%s T=%d %s arms done" % (family, T, pos))
    return res
