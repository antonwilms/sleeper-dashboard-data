"""LP-2b-1a (§7, §8): the weekly layer's prior. `derive` re-derives a registered candidate's season-layer prediction for a season T through
`season_models.fold` (which calls `registry.require` itself) plus a copy of `refit`'s body that keeps the per-target predictions that
`compose` collapses; a hard check proves the copy composes to `fold`'s own rows. `fallback` gives a player outside the season universe a
prior built from earlier seasons only."""
import json
from collections import namedtuple

import numpy as np
import pandas as pd

from . import asof, era, features, registry, season_models, spec_w, splits, weekly_data

POSITIONS = spec_w.POSITIONS
COMP_COLS = ["share", "games", "ppg", "total", "c"]
Fallback = namedtuple("Fallback", ["val", "cnt"])


class PriorCheckError(RuntimeError):
    """A compose check or a comparison with the season layer's own prediction file failed (a §14 stop)."""


def prior_refit(store, spec, family, pos, T, entry):
    """COPY of `season_models.refit`'s body up to and including the `fit_family` call (`fit_family` is called, never copied — its clip stays in
    it): returns (native-unit predictions per season target, the fit data, the minor constants, the per-target fit info)."""
    mu = store.mu(T)
    tr = list(splits.train_seasons(T))
    u = era.Units(mu, entry["era"], T - 1)
    d = season_models.build_data(store, spec, pos, tr, [T], u, (), False, hist=(family == "H"))
    targets = store.spec_for(False)["targets"][pos]
    preds, info = season_models.fit_family(family, spec, d, pos, entry["lam"], entry.get("g"), u, False, store, targets)
    minor = store.minor(tr, pos)
    return preds, d, minor, info


def compare_compose(name, comp, want):
    """The same-run check: the copy's composed frame `comp` against `fold`'s own rows `want` (same pids, same order) — EXACT for H and for G (every
    composed value bit-equal, NaN equal NaN). G is reproducible only approximately across runs, even on one thread, but within one process the copy
    held exact in both 2b-1a real-data runs, so it stays exact (Anton's second ruling, 2026-11-17). Returns {"maxAbs", "maxRel"} (0 when it passes)."""
    worst_abs = worst_rel = 0.0
    for c in [c for c in comp.columns if c in COMP_COLS or c.startswith("kv_")]:
        if c not in want.columns:
            raise PriorCheckError("%s: composed column %s is missing from fold's rows" % (name, c))
        a, b = comp[c].to_numpy(float), want[c].to_numpy(float)
        if (np.isnan(a) != np.isnan(b)).any():
            raise PriorCheckError("%s: composed column %s has a different NaN pattern" % (name, c))
        d = np.where(np.isnan(a), 0.0, np.abs(a - b))
        rel = d / (1.0 + np.abs(np.where(np.isnan(b), 0.0, b)))
        if len(d):
            worst_abs, worst_rel = max(worst_abs, float(d.max())), max(worst_rel, float(rel.max()))
        if (d > 0).any():
            raise PriorCheckError("%s: composed column %s differs from fold's (the same-run check is exact; max abs %.3g, max relative %.3g)" % (name, c, d.max(), rel.max()))
    return {"maxAbs": worst_abs, "maxRel": worst_rel}


def derive(store, name, spec, T, env=None, confirm=False, gaps=None):
    """The candidate's season prior for season T, one row per (pid, T, position): `pr_<t>` per weekly target (NaN where the position has no such
    target), `pr_gamesShare` (native, unblended), the composed values (`share`, `games`, `ppg`, `total`, `c`, `kv_*`), `cand`, `era`, `lam`,
    `g` (G), and `alpha_<t>` per season target (H). Raises PriorCheckError when the copy does not compose to `fold`'s own rows (`compare_compose`:
    exact for H and G); with a `gaps` dict, fills {(cand, T, position): {"maxAbs", "maxRel"}}."""
    weekly_data.guard(T, confirm)
    main, out = season_models.fold(store, name, spec, T, env)
    sp = spec_w.inputs_spec()
    season_targets = sp["targets"] + ["gamesShare"]
    frames = []
    for pos in POSITIONS:
        det = out["details"][pos]
        preds, d, minor, info = prior_refit(store, spec, name, pos, T, det["entry"])
        comp = season_models.compose(store, spec, pos, d, preds, minor, det["c"])
        want = main[main["position"] == pos].reset_index(drop=True)
        if list(comp["pid"]) != list(want["pid"]):
            raise PriorCheckError("%s T=%d %s: the re-derived pids differ from fold's" % (name, T, pos))
        try:
            gap = compare_compose(name, comp, want)
        except PriorCheckError as e:
            raise PriorCheckError("T=%d %s: %s" % (T, pos, e))
        if gaps is not None:
            gaps[(name.lower(), T, pos)] = gap
        fr = comp.copy()
        fr.insert(2, "position", pos)
        fr.insert(3, "cand", name.lower())
        N = len(fr)
        for t in sp["targets"]:
            fr["pr_" + t] = np.asarray(preds[t], float) if t in preds else np.full(N, np.nan)
        fr["pr_gamesShare"] = np.asarray(preds["gamesShare"], float)
        fr["era"], fr["lam"], fr["g"] = det["entry"]["era"], float(det["entry"]["lam"]), det["entry"].get("g")
        for t in season_targets:
            fr["alpha_" + t] = float(info[t]["alpha"]) if (name == "H" and t in info) else np.nan
        frames.append(fr)
    return pd.concat(frames, ignore_index=True)


G_REL_LIMIT = 0.05


def _entry_of(row):
    e = {"era": row["era"], "lam": float(row["lam"])}
    if isinstance(row.get("g"), str):
        e["g"] = row["g"]
    return e


def check_against_file(derived, path, sha, entries=None, g_rel_limit=G_REL_LIMIT):
    """The prediction file's SHA-256 equals `sha`; for candidates h/g and every development season in `weekly_data.seasons()` the file's composed
    rows (no `arm` key) have the derived pid set and the same NaN pattern. **H is exact**: equal values (|d| <= 1e-9 (1 + |x|)). **G** (whose
    LP-2a dev predictions came from an unrecorded thread count and are not bit-reproducible by a one-thread refit): the chosen entry per position
    and fold equals the registered dev run's (`entries` = {(cand, T, pos): {era, lam[, g]}}, exact), and each numeric field's relative difference
    |d| / (1 + |x|) must not exceed `g_rel_limit` (a stop). Returns {(cand, T, position): {"maxAbs", "maxRel"}} over share, games, ppg, total, c, kv_*."""
    got = registry.sha_file(path)
    if got != sha:
        raise PriorCheckError("%s SHA-256 %s differs from the anchor %s" % (path, got, sha))
    rows = {"h": {}, "g": {}}
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            if "arm" in r or r.get("cand") not in rows:
                continue
            rows[r["cand"]].setdefault(int(r["T"]), {})[r["pid"]] = r
    kv = [c for c in derived.columns if c.startswith("kv_")]
    out = {}
    for cand in ("h", "g"):
        for T in [T for T in splits.DEV_FOLDS if T in weekly_data.seasons()]:
            dr = derived[(derived["cand"] == cand) & (derived["T"] == T)]
            fr = rows[cand].get(T, {})
            if set(dr["pid"]) != set(fr):
                raise PriorCheckError("%s T=%d: pid sets differ (derived %d, file %d)" % (cand, T, len(set(dr["pid"])), len(fr)))
            if cand == "g" and entries is not None:
                for pos in POSITIONS:
                    sub = dr[dr["position"] == pos]
                    if len(sub) and _entry_of(sub.iloc[0]) != entries[(cand, T, pos)]:
                        raise PriorCheckError("g T=%d %s: chosen entry %s differs from the dev run's %s" % (T, pos, _entry_of(sub.iloc[0]), entries[(cand, T, pos)]))
            worst_abs, worst_rel = np.zeros(len(dr)), np.zeros(len(dr))
            for c in COMP_COLS + kv:
                a = dr[c].to_numpy(float)
                b = np.array([np.nan if fr[p].get(c) is None else float(fr[p][c]) for p in dr["pid"]])
                same_nan = np.isnan(a) & np.isnan(b)
                if (np.isnan(a) != np.isnan(b)).any():
                    raise PriorCheckError("%s T=%d column %s: NaN pattern differs" % (cand, T, c))
                d = np.where(same_nan, 0.0, np.abs(a - b))
                rel = d / (1.0 + np.abs(np.where(same_nan, 0.0, b)))
                limit = 1e-9 if cand == "h" else g_rel_limit
                bad = rel > limit
                if bad.any():
                    raise PriorCheckError("%s T=%d column %s differs on %d rows (max relative %.3g > %g; first pid %s)" % (cand, T, c, int(bad.sum()), rel.max(), limit, dr["pid"].to_numpy()[bad][0]))
                worst_abs, worst_rel = np.maximum(worst_abs, d), np.maximum(worst_rel, rel)
            for pos in POSITIONS:
                m = (dr["position"] == pos).to_numpy()
                if m.any():
                    out[(cand, T, pos)] = {"maxAbs": float(worst_abs[m].max()), "maxRel": float(worst_rel[m].max())}
    return out


def dev_entries(path):
    """{(cand, T, position): entry} from the registered LP-2a dev run's aggregate (`backtests/<date>-learned-s2a-dev-panel.json`, results[pos][cand].chosen)."""
    with open(path) as f:
        res = json.load(f)["results"]
    return {(cand, int(T), pos): {k: v for k, v in c["entry"].items()} for pos in POSITIONS for cand in ("h", "g") for T, c in res[pos][cand]["chosen"].items()}


def fallback(tables, store, S):
    """Prior for a player outside the season universe: per position and weekly target, sum of numerators over sum of exposures among the played
    weekly-universe rows of seasons 2014 .. S - 1 whose (pid, season) is NOT in that season's universe; `gamesShare` = played / rows over all
    weekly-universe rows of those (pid, season) pairs. Reads only seasons before S (membership of `features.universe` is the 2a exception).
    Returns Fallback(val, cnt): frames indexed by position, columns the weekly targets plus `gamesShare`; an empty pool is NaN / 0."""
    weekly_data.guard(S)
    v = asof.view(tables, S, 0)
    sp = spec_w.inputs_spec()
    tdefs = weekly_data._tdefs(store)
    first = splits.FIRST_TRAIN_SEASON
    inu = v.weeks["inUniverse"].astype(bool).to_numpy()
    sel = ((v.weeks["S"] >= first) & (v.weeks["S"] < S)).to_numpy() & inu
    wk = v.weeks.loc[sel].reset_index(drop=True)
    X = v.X[sel]
    uni = {s: set(features.universe(tables, s)) for s in range(first, S)}
    in_uni = np.array([p in uni[int(s)] for p, s in zip(wk["pid"], wk["S"])], bool)
    played = wk["played"].astype(bool).to_numpy()
    pool = played & ~in_uni
    posv = np.array([store.pos.get(p) for p in wk["pid"]], dtype=object)
    cols = sp["targets"] + ["gamesShare"]
    val = pd.DataFrame(np.nan, index=list(POSITIONS), columns=cols)
    cnt = pd.DataFrame(0, index=list(POSITIONS), columns=cols)
    pairs = set(zip(wk["pid"][pool], wk["S"][pool]))
    in_pair = np.array([(p, s) in pairs for p, s in zip(wk["pid"], wk["S"])], bool)
    for P in POSITIONS:
        m = pool & (posv == P)
        if m.any():
            raw = wk.loc[m]
            for t in tdefs[P]:
                num, exp = weekly_data._num_exp(raw, X[m], store.keys, t)
                ok = np.isfinite(num) & np.isfinite(exp) & (exp > 0)
                if ok.any():
                    val.loc[P, t["name"]] = float(num[ok].sum() / exp[ok].sum())
                cnt.loc[P, t["name"]] = int(ok.sum())
        g = in_pair & (posv == P)
        if g.any():
            val.loc[P, "gamesShare"] = float(played[g].sum() / g.sum())
            cnt.loc[P, "gamesShare"] = int(g.sum())
    return Fallback(val, cnt)
