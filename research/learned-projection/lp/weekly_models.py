"""LP-2b-1b (§6): the weekly candidates — composition, cross-fitting and calibration, the fold driver and the two hooks LP-2b-1c depends on
(fits persistence, the variant switch).

A weekly candidate predicts, per row (pid, S, w), `cond` (points if he plays) and `p` (the chance he plays): q_t per weekly target (H: the
partial-pooled evidence plus a context ridge; G: prior + gradient-boosted residual), clipped, composed to points by `chain.season_points`
(ppg), scaled by `c_w` (the median of pts / out-of-fold ppg), and `uncond = p x cond`. Every fit reads only its training rows; `predict_w` reads
only the `Fits`, the frame (never an outcome column), `hist` and `store`."""
import numpy as np
import pandas as pd

from . import baselines, chain, pplays, registry, registry_w, spec_w, spec_wm, splits, weekly_data, weekly_g, weekly_h

POSITIONS = spec_w.POSITIONS
REGISTERED = {}                                   # the registered variant: none
VARIANT_KEYS = ("dropGroups", "addCols", "hContext", "gPrior", "fixedCalib")
OUT_COLS = ["pid", "S", "w", "position", "T", "cand", "cond", "ppg", "p", "uncond", "c_w", "noPrior"]


# ── variants (hook 2) ───────────────────────────────────────────────────────────────────────────────────────
def check_variant(variant, family):
    """`None` and `{}` are the registered path. An unknown key, or a key of the other family, raises."""
    var = dict(variant or {})
    bad = [k for k in var if k not in VARIANT_KEYS]
    if bad:
        raise ValueError("unknown variant key(s) %s" % bad)
    if family == "G" and "hContext" in var:
        raise ValueError("variant key hContext belongs to H")
    if family == "H" and "gPrior" in var:
        raise ValueError("variant key gPrior belongs to G")
    groups = spec_w.inputs_spec()["groups"]
    for g in var.get("dropGroups", []):
        if g not in groups:
            raise ValueError("unknown group %s" % g)
    fc = var.get("fixedCalib")
    if fc is not None and not (isinstance(fc, dict) and set(fc) == {"c_w", "phi"} and all(set(fc[k]) >= set(POSITIONS) for k in fc)):
        raise ValueError("fixedCalib needs {'c_w': {P: x}, 'phi': {P: x}} for every position")
    return var


def design(spec, var, frame_cols):
    """The column lists of the three designs for one fit: {"ctx": H's context ridge, "g": G's features, "pplays": the P(plays) design}. `dropGroups`
    removes every column of those groups from all of them; `addCols` appends frame columns to all of them."""
    groups = spec_w.inputs_spec()["groups"]
    drop = set(c for g in var.get("dropGroups", []) for c in groups[g])
    out = {}
    if spec["family"] == "H":
        cols = [c for g in spec["ctxGroups"] for c in groups[g]] + list(spec["ctxCols"])
        out["ctx"] = [c for c in cols if c not in drop]
    else:
        names = [g for g in spec["gGroups"] if not (g == "prior" and var.get("gPrior", True) is False)]
        out["g"] = [c for g in names for c in groups[g] if c not in drop]
    out["pplays"] = [c for c in spec["pplaysCols"] if c not in drop]
    for c in var.get("addCols", []):
        if c not in frame_cols:
            raise ValueError("addCols: column %s is not in the frame" % c)
        for k in out:
            if c not in out[k]:
                out[k].append(c)
    return out


# ── composition ─────────────────────────────────────────────────────────────────────────────────────────────
def season_minor(store, S, P):
    """The minor constants of season S's prior (F2): `store.minor(train_seasons(S), P)`, memoised on the store."""
    cache = store.__dict__.setdefault("_minor_w", {})
    key = (int(S), P)
    if key not in cache:
        cache[key] = store.minor(list(splits.train_seasons(int(S))), P)
    return cache[key]


def compose(q, P, store, minor):
    """ppg (points per game if he plays) of the rows: `chain.season_points` on per-target values q (NATIVE units, arrays) with games share 1."""
    n = len(next(iter(q.values())))
    ones = np.ones(n)
    return chain.season_points({**q, "gamesShare": ones}, store.struct, P, minor, store.weights, ones, 1.0)["ppg"].to_numpy(float)


def _ppg_rows(q, S, P, store):
    S = np.asarray(S).astype(int)
    out = np.full(len(S), np.nan)
    for s in sorted(set(S.tolist())):
        m = S == s
        out[m] = compose({k: v[m] for k, v in q.items()}, P, store, season_minor(store, s, P))
    return out


# ── cross-fitting and calibration (§6.5) ────────────────────────────────────────────────────────────────────
def xfit_groups(pids, K):
    """{pid: group}: the sorted unique pids, index mod K — independent of the row order."""
    return {p: i % K for i, p in enumerate(sorted(set(pids)))}


def train_relevant(wf, T):
    """COPY of `baselines.weekly_forecasts`' internal training frame (2014 <= S < T, played-row `pos_mean`, `add_std`, `mark_relevant`): the
    `relevant` flag of every training row, ranked on that fold's own training STD. Returns pid, S, w, relevant."""
    train = wf[(wf["S"] < T) & (wf["S"] >= splits.FIRST_TRAIN_SEASON)].copy()
    splits.assert_train_only(train, T)
    pos_mean = train[train["played"] == True].groupby("position")["pts"].mean().to_dict()  # noqa: E712
    train = baselines.add_std(train, pos_mean)
    train = baselines.mark_relevant(train)
    return train[["pid", "S", "w", "relevant"]].reset_index(drop=True)


# ── fits (hook 1) ───────────────────────────────────────────────────────────────────────────────────────────
class PosFit:
    """One position's fitted state — plain, picklable."""

    def __init__(self):
        self.design, self.bounds, self.targets, self.pplays = {}, {}, {}, None
        self.c_w, self.phi, self.facts = 1.0, None, {}


class Fits:
    """Everything `predict_w` needs: per position the design columns, clip bounds, per-target models, the P(plays) model, `c_w` and phi; plus the
    variant and the spec's SHA-256. A plain picklable class."""

    def __init__(self, spec, variant, T=None):
        self.name, self.family, self.T = spec["name"], spec["family"], T
        self.spec, self.variant = spec, dict(variant or {})
        self.specSha256 = registry.spec_sha(spec)
        self.pos = {}


def _slice_ev(ev, idx):
    return {rho: (E[idx], N[idx]) for rho, (E, N) in ev.items()}


def _ev_for(hist_ix, df, ns, rhos):
    E, N = weekly_h.evidence(hist_ix, df["pid"].to_numpy(object), df["S"].to_numpy(int), ns, rhos)
    return {rho: (E[i], N[i]) for i, rho in enumerate(rhos)}


def _fit_core(sub, ev, spec, dsg, P, tdefs, var, ts):
    """The per-target models, clip bounds and P(plays) model of one position fitted on the rows `sub` (DataFrame). `ev`: {rho: (E, N)} aligned with
    `sub` (H only)."""
    core = {"targets": {}, "bounds": {}}
    for t in tdefs:
        nme = t["name"]
        r, e, pr = (sub[c + nme].to_numpy(float) for c in ("r_", "e_", "pr_"))
        m = (e > 0) & np.isfinite(r)
        if not m.any():
            raise spec_wm.NoTrainingRows("%s %s has no training row" % (P, nme))
        core["bounds"][nme] = chain.clip_bounds(r[m], e[m], nme)
        if spec["family"] == "H":
            j = ts.index(nme)
            E = np.stack([ev[rho][0][:, j] for rho in spec["rhos"]])
            N = np.stack([ev[rho][1][:, j] for rho in spec["rhos"]])
            core["targets"][nme] = weekly_h.fit_target(spec, r, e, pr, E, N, sub[dsg["ctx"]].to_numpy(float), sub["S"].to_numpy(), var.get("hContext", True))
        else:
            core["targets"][nme] = weekly_g.fit_target(spec, sub[dsg["g"]].to_numpy(float), r, e, pr, var.get("gPrior", True))
    core["pplays"] = pplays.fit(sub, spec, dsg["pplays"])
    return core


def _predict_core(core, df, ev, spec, dsg, tdefs, var, ts):
    """(q per target — clipped, native units; p) for the rows `df` from a `_fit_core` result. `ev`: {rho: (E, N)} aligned with `df` (H only)."""
    q = {}
    for t in tdefs:
        nme = t["name"]
        pr = df["pr_" + nme].to_numpy(float)
        info = core["targets"][nme]
        if spec["family"] == "H":
            j = ts.index(nme)
            E, N = ev[info["rho"]][0][:, j], ev[info["rho"]][1][:, j]
            raw = weekly_h.predict_target(info, pr, E, N, df[dsg["ctx"]].to_numpy(float) if info["cohort"] is not None else None)
        else:
            raw = weekly_g.predict_target(info, df[dsg["g"]].to_numpy(float), pr, var.get("gPrior", True))
        lo, hi = core["bounds"][nme]
        q[nme] = np.clip(raw, lo, hi)
    return q, pplays.predict(core["pplays"], df)


def _core_facts(core, spec):
    out = {}
    for nme, info in core["targets"].items():
        if spec["family"] == "H":
            out[nme] = {"k": info["k"], "kGames": info["kGames"], "rho": info["rho"], "alpha": info["alpha"], "medE": info["medE"], "kMult": info["kMult"]}
        else:
            out[nme] = {"iter": int(getattr(info, "n_iter_", 0))}
    return out


def fit_w(frame_tr, rel_tr, hist, store, spec, variant=None, T=None):
    """Fit the weekly candidate of `spec` on the training rows `frame_tr` (the 2b-1a frame, outcome columns included) and return its `Fits`.
    `rel_tr`: pid, S, w, relevant (`train_relevant`). `hist`: `weekly_h.history` (H only). Cross-fitting (§6.5) gives the out-of-fold ppg and P(plays)
    behind `c_w` and phi, unless the variant supplies `fixedCalib`."""
    family = spec["family"]
    var = check_variant(variant, family)
    fits = Fits(spec, var, T)
    frame_tr = frame_tr.reset_index(drop=True)
    if not len(frame_tr):
        raise spec_wm.NoTrainingRows("an empty training set")
    frame_cols = set(frame_tr.columns)
    ts = spec_w.union_targets()
    ix = weekly_h.index(hist) if family == "H" else None
    rel = rel_tr[["pid", "S", "w", "relevant"]].drop_duplicates(["pid", "S", "w"]) if rel_tr is not None else None
    sw = store.struct["targets"]
    for P in POSITIONS:
        sub = frame_tr[frame_tr["position"] == P].reset_index(drop=True)
        if not len(sub):
            raise spec_wm.NoTrainingRows("position %s has no training row" % P)
        dsg = design(spec, var, frame_cols)
        tdefs = [t for t in sw[P] if t["name"] != "gamesShare"]
        ev = _ev_for(ix, sub, sub["w"].to_numpy(int) - 1, list(spec["rhos"])) if family == "H" else None
        pf = PosFit()
        pf.design = dsg
        fc = var.get("fixedCalib")
        if fc is not None:
            pf.c_w, pf.phi = float(fc["c_w"][P]), float(fc["phi"][P])
        else:
            grp = xfit_groups(sub["pid"].tolist(), spec["crossFolds"])
            gid = np.array([grp[p] for p in sub["pid"]])
            ppg_oof, p_oof = np.full(len(sub), np.nan), np.full(len(sub), np.nan)
            for g in range(spec["crossFolds"]):
                tr, ho = np.flatnonzero(gid != g), np.flatnonzero(gid == g)
                if not len(ho):
                    continue
                if not len(tr):
                    raise spec_wm.NoTrainingRows("a cross-fitting group has no training row")
                core_g = _fit_core(sub.iloc[tr].reset_index(drop=True), _slice_ev(ev, tr) if ev is not None else None, spec, dsg, P, tdefs, var, ts)
                dh = sub.iloc[ho].reset_index(drop=True)
                q, p = _predict_core(core_g, dh, _slice_ev(ev, ho) if ev is not None else None, spec, dsg, tdefs, var, ts)
                ppg_oof[ho] = _ppg_rows(q, dh["S"], P, store)
                p_oof[ho] = p
            pf.c_w = _calibrate(sub, rel, ppg_oof, spec["calibMinRows"])
            pairs = pplays.horizon_pairs(pd.DataFrame({"pid": sub["pid"], "S": sub["S"], "w": sub["w"], "played": sub["played"].astype(bool), "p": p_oof,
                                                       "gs": sub["pr_gamesShare"]}), spec["rosOrigins"])
            pf.phi, pf.facts["phiBrier"] = pplays.fit_phi(pairs, spec["phis"])
            pf.facts["phiPairs"] = int(len(pairs[2]))
        core = _fit_core(sub, ev, spec, dsg, P, tdefs, var, ts)
        pf.bounds, pf.targets, pf.pplays = core["bounds"], core["targets"], core["pplays"]
        pf.facts.update({"rows": int(len(sub)), "noPriorRows": int((sub["noPrior"] == 1).sum()), "playedRows": int(sub["played"].astype(bool).sum()),
                         "targets": _core_facts(core, spec), "cW": pf.c_w, "phi": pf.phi})
        fits.pos[P] = pf
    return fits


def _calibrate(sub, rel, ppg_oof, min_rows):
    """`c_w[P]`: the median of pts / out-of-fold ppg over the position's relevant, played training rows with both values > 0; 1 with fewer than
    `calibMinRows` such rows."""
    if rel is None:
        relevant = np.zeros(len(sub), bool)
    else:
        mg = sub[["pid", "S", "w"]].merge(rel, on=["pid", "S", "w"], how="left")
        relevant = mg["relevant"].fillna(False).astype(bool).to_numpy()
    pts = sub["pts"].to_numpy(float)
    ok = relevant & sub["played"].astype(bool).to_numpy() & np.isfinite(pts) & np.isfinite(ppg_oof) & (pts > 0) & (ppg_oof > 0)
    if int(ok.sum()) < min_rows:
        return 1.0
    return float(np.median(pts[ok] / ppg_oof[ok]))


def predict_w(fits, frame_pr, hist, store, origin=None):
    """Predictions for the rows `frame_pr` — reads only `fits`, the frame's input columns (never `r_*`, `e_*`, `played`, `pts`), `hist` and `store`.
    `origin`: a per-row n (default w - 1); H reads only the `hist` weeks <= n. Returns pid, S, w, position, T, cand, cond, ppg, p, uncond, c_w, noPrior."""
    spec, family = fits.spec, fits.family
    var = fits.variant
    fr = frame_pr.reset_index(drop=True)
    N = len(fr)
    ns = fr["w"].to_numpy(int) - 1 if origin is None else np.asarray(origin, int)
    ts = spec_w.union_targets()
    ix = weekly_h.index(hist) if family == "H" else None
    out = {c: np.full(N, np.nan) for c in ("cond", "ppg", "p", "c_w")}
    sw = store.struct["targets"]
    for P in sorted(set(fr["position"])):
        if P not in fits.pos:
            raise KeyError("no fit for position %s" % P)
        idx = np.flatnonzero((fr["position"] == P).to_numpy())
        df = fr.iloc[idx].reset_index(drop=True)
        pf = fits.pos[P]
        tdefs = [t for t in sw[P] if t["name"] != "gamesShare"]
        core = {"targets": pf.targets, "bounds": pf.bounds, "pplays": pf.pplays}
        rhos = sorted(set(info["rho"] for info in pf.targets.values())) if family == "H" else []
        ev = _ev_for(ix, df, ns[idx], rhos) if family == "H" else None
        q, p = _predict_core(core, df, ev, spec, pf.design, tdefs, var, ts)
        ppg = _ppg_rows(q, df["S"], P, store)
        out["ppg"][idx], out["p"][idx], out["c_w"][idx] = ppg, p, pf.c_w
        out["cond"][idx] = pf.c_w * ppg
    res = fr[["pid", "S", "w", "position"]].copy()
    res["T"] = fits.T if fits.T is not None else fr["S"].to_numpy()
    res["cand"] = fits.name.lower()
    res["cond"], res["ppg"], res["p"] = out["cond"], out["ppg"], out["p"]
    res["uncond"] = out["p"] * out["cond"]
    res["c_w"] = out["c_w"]
    res["noPrior"] = fr["noPrior"].to_numpy(float)
    if not np.isfinite(res["cond"].to_numpy(float)).all() or not np.isfinite(res["p"].to_numpy(float)).all():
        raise ValueError("a non-finite cond or p")
    return res[OUT_COLS]


# ── the fold driver (§6.6) ──────────────────────────────────────────────────────────────────────────────────
def fold_w(frame, T, store, name, spec, rel, hist=None, train=None, pred=None, variant=None, confirm=False, env=None, env_w=None):
    """Fit candidate `name` for test season T and predict it: returns (preds, fits). The held season is guarded first; for T >= `registry.EVAL_START` both
    the season and the weekly layer of `name` are required (through the module, so a test can patch it); no selected row is above `LAST_SEASON`."""
    weekly_data.guard(T, confirm)
    if T >= registry.EVAL_START:
        registry.require(name, T, "season", env)
        registry.require(name, T, "weekly", env_w if env_w is not None else registry_w.weekly_env())
    S = frame["S"].to_numpy()
    tr = ((S >= spec["trainFrom"]) & (S < T)) if train is None else np.asarray(train, bool)
    pr = (S == T) if pred is None else np.asarray(pred, bool)
    for m in (tr, pr):
        if m.any() and int(S[m].max()) > weekly_data.LAST_SEASON:
            raise AssertionError("a selected row is in season %d, beyond LAST_SEASON %d" % (int(S[m].max()), weekly_data.LAST_SEASON))
    if not tr.any():
        raise spec_wm.NoTrainingRows("an empty training set")
    fits = fit_w(frame[tr], rel, hist, store, spec, variant, T=T)
    return predict_w(fits, frame[pr], hist, store), fits


# ── runtime check (§10 step 7a) ─────────────────────────────────────────────────────────────────────────────
def n0_check(frame, prior, store, tol=1e-9):
    """At w = 1 with `noPrior` = 0 the UNCLIPPED composition of q = `pr` equals the season prior's `ppg` (F2) on every row. `prior`: the season-prior
    rows (columns cand, pid, T, position, ppg) of this frame's candidate. Returns the largest |d| / (1 + |x|) (a miss is above `tol`)."""
    sp = spec_w.inputs_spec()
    pr = prior.drop_duplicates(["pid", "T", "position"]).set_index(["pid", "T", "position"])["ppg"]
    worst = 0.0
    w1 = frame[(frame["w"] == 1) & (frame["noPrior"] == 0)]
    for P in POSITIONS:
        d = w1[w1["position"] == P]
        if not len(d):
            continue
        q = {t: d["pr_" + t].to_numpy(float) for t in sp["targetsByPos"][P]}
        ppg = _ppg_rows(q, d["S"], P, store)
        want = pr.reindex(pd.MultiIndex.from_arrays([d["pid"], d["S"], d["position"]])).to_numpy(float)
        if (np.isnan(want) != np.isnan(ppg)).any():
            return float("inf")
        rel = np.where(np.isnan(want), 0.0, np.abs(ppg - want) / (1.0 + np.abs(np.where(np.isnan(want), 0.0, want))))
        worst = max(worst, float(rel.max()) if len(rel) else 0.0)
    return worst
