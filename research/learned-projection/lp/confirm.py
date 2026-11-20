"""LP-2b-2a (§4-§7, §11): the held-season confirmation path, rehearsed on 2024. The held season is a setting (`boundary`), never an option of a runner.

`run_held` builds every held-season product from the registered code only: the season prior, the weekly inputs, the weekly fit and the two evaluations. It
reads no cache of the held season and writes no file. The `compare_*` helpers prove, on a rehearsal (held = the last development season), that the path
reproduces the locked development outputs: H exactly, G within 5% (R1-R3). R4 for G is report-only: G's weekly forecasts inherit its season-forecast variation (up to
16.6% at RB in the rehearsal); a same-input re-fit is exact (Anton, 2026-11-20) — R4c re-fits G on the CACHED season inputs (`refit_cached`) and must match exactly.
Nothing here writes a marker or a verdict (LP-2b-2b)."""
import contextlib
import time

import numpy as np
import pandas as pd

from . import asof, baselines, era_w, evaluate, evaluate_w, registry, season_prior, spec_w, splits, weekly_data, weekly_h, weekly_models
from . import score

TOL = 1e-9                      # "exact": |a - b| <= TOL (1 + |b|), NaN equal NaN (run_weekly_models.TOL)
G_LIMIT = season_prior.G_REL_LIMIT
POSITIONS = spec_w.POSITIONS
BENCH_S = (("B2", "B2"), ("B1c", "B1c"))          # season benches compared in R6
BENCH_W = ("STD", "B1c")                           # weekly benches compared in R7


class CheckError(RuntimeError):
    """A runtime check on the new held-season rows missed its tolerance (raised before any weekly fit)."""


class RehearsalMismatch(RuntimeError):
    """A rehearsal comparison (R1-R7) missed its tolerance; `.results` holds every maximum seen."""

    def __init__(self, msg, results=None):
        super().__init__(msg)
        self.results = results


# ── §5 the held-season boundary ─────────────────────────────────────────────────────────────────────────────
_ACTIVE = []


@contextlib.contextmanager
def boundary(held):
    """The only place in this slice that writes `weekly_data.LAST_SEASON`. Inside, `LAST_SEASON == held`; it is restored on every exit. `held` is the
    current boundary (a rehearsal) or one season past it (a stand-in; the real held season of LP-2b-2b). No call in this slice switches the guard off."""
    if _ACTIVE:
        raise RuntimeError("boundary is not re-entrant")
    base = weekly_data.LAST_SEASON
    if held not in (base, base + 1):
        raise ValueError("held season %s is neither the boundary %s nor the next season" % (held, base))
    _ACTIVE.append(held)
    weekly_data.LAST_SEASON = held
    try:
        yield held
    finally:
        weekly_data.LAST_SEASON = base
        _ACTIVE.clear()


# ── §6.3 held_inputs: a COPY of run_weekly_inputs.main step 6's loop body ──────────────────────────────────
def held_inputs(tables, store, S, derived):
    """COPY (§11, test T-R-2) of `run_weekly_inputs.main` step 6 (`fallback` line to `append`) for ONE season S, with `T` -> `tables`, `seas` -> [S] and
    the `mu_range` bookkeeping dropped. Returns {name: frame}, in the 2b-1a cache's row order."""
    spec_w_ = spec_w.inputs_spec()
    outs = {nme: [] for nme in derived}
    fb = season_prior.fallback(tables, store, S)
    sc = asof.view(tables, S, 0).schedule
    sc = sc[sc["inUniverse"].astype(bool)]
    bio = weekly_data.bio_block(tables, store, S, sorted(set(sc["pid"])))
    for w in sorted(int(x) for x in sc["w"].unique()):
        n = w - 1
        mu = era_w.mu_std(tables, store, S, n)
        fr = weekly_data.inputs_at(tables, store, S, n, spec_w_, bio)
        tg = weekly_data.targets_at(tables, fr[["pid", "S", "w", "position"]], store)
        for nme in derived:
            fp = weekly_data.attach_prior(fr, derived[nme], fb, mu, store, spec_w_)
            outs[nme].append(pd.concat([fp, tg.drop(columns=["pid", "S", "w"])], axis=1))
    return {nme: pd.concat(parts, ignore_index=True) for nme, parts in outs.items()}


# ── §11 copies of two runner steps ──────────────────────────────────────────────────────────────────────────
def parity(T_trim, pmeta):
    """COPY (§11, test T-R-9) of `run_weekly_models.py:256-260`: scoring parity on the trimmed tables. Returns (rows checked, mismatching row indices)."""
    order = [pmeta["keys"].index(k) for k in pmeta["weights"]]
    n_par, bad = score.parity(T_trim.X[T_trim.weeks["rid"].to_numpy()][:, order], T_trim.weeks["pts"].to_numpy(), [pmeta["weights"][k] for k in pmeta["weights"]])
    return n_par, bad


def merge_preds(wk, preds):
    """COPY (§11, test T-R-9) of `run_weekly_models.py:329-331`: each candidate's `cond` / `p` merged onto the weekly forecast frame as `h`/`g`, `h_p`/`g_p`.
    `preds[n]` is ONE frame per name (`fold_w` returns one; the original concatenates a list of folds)."""
    names = registry.NAMES
    for n in names:
        d = preds[n][["pid", "S", "w", "cond", "p"]].rename(columns={"cond": n.lower(), "p": n.lower() + "_p"})
        wk = wk.merge(d, on=["pid", "S", "w"], how="left")
    return wk


# ── §6 the path ─────────────────────────────────────────────────────────────────────────────────────────────
class Held:
    """The products of one held-season run."""

    def __init__(self):
        self.derived, self.rows, self.preds, self.fits = {}, {}, {}, {}
        self.season = self.weekly = self.wk = self.wk_base = None
        self.gaps, self.seconds = {}, {}
        self.cache_held = {}
        self.rel = self.hist = None


def run_held(tables, store, cache, specs_s, specs_w, held, benchw, env, env_w, B, log=lambda m: None):
    """§6.2, steps 1-11. `tables`: built by the caller with `extra.build_extras(last=held)` and `weekly_data.trim(..., last=held)`-ed. `cache`: {name: frame}
    from `weekly-inputs.pkl`. `benchw`: already trimmed. Writes no file."""
    names = registry.NAMES
    held_ = Held()
    secs = held_.seconds
    t_all = time.time()
    # (1) before anything: nothing past the held season, and both locks for both candidates (through the module, so a raise propagates)
    weekly_data.assert_trimmed(tables, last=held, frames=[benchw, *cache.values()])
    for n in names:
        registry.require(n, held, "season", env)
        registry.require(n, held, "weekly", env_w)
    with boundary(held):                                                                    # (2)
        # (3) season prior and totals
        t0 = time.time()
        for n in names:
            held_.derived[n] = season_prior.derive(store, n, specs_s[n], held, env=env, gaps=held_.gaps)
        secs["prior"] = round(time.time() - t0, 1)
        log("held season %d: season prior done in %.0fs" % (held, secs["prior"]))
        # (4) the weekly inputs of S = held
        t0 = time.time()
        held_.rows = held_inputs(tables, store, held, held_.derived)
        secs["inputs"] = round(time.time() - t0, 1)
        # (5) frames: the cache's seasons before held, then the new rows
        frame, kept = {}, {}
        for n in names:
            old = cache[n]
            if list(old.columns) != list(held_.rows[n].columns):
                raise AssertionError("%s: the cache's columns differ from the new rows'" % n)
            if not (old.dtypes.astype(str).to_numpy() == held_.rows[n].dtypes.astype(str).to_numpy()).all():
                bad = [c for c in old.columns if str(old[c].dtype) != str(held_.rows[n][c].dtype)]
                raise AssertionError("%s: dtype differs between the cache and the new rows: %s" % (n, bad[:5]))
            frame[n] = pd.concat([old[old["S"] < held], held_.rows[n]], ignore_index=True)
            kept[n] = old[old["S"] >= held]
        held_.cache_held = kept
        # (6) history and benchmarks
        t0 = time.time()
        hist = weekly_h.history(tables, store, range(spec_w.TRAIN_FROM, held + 1))
        wf = baselines.build_weekly_frame(tables, seasons=range(splits.FIRST_TRAIN_SEASON, held + 1))
        held_.wk_base = baselines.weekly_forecasts(wf, held, None, benchw)
        rel = weekly_models.train_relevant(wf, held)
        held_.rel, held_.hist = rel, hist
        secs["build"] = round(time.time() - t0, 1)
        # (7) runtime checks on the new rows, before any weekly fit
        for n in names:
            v = weekly_models.n0_check(held_.rows[n], held_.derived[n], store, TOL)
            if not v <= TOL:
                raise CheckError("check (a): the n = 0 identity differs for %s (max relative %.3g > %g)" % (n, v, TOL))
            cross = weekly_h.crosscheck(held_.rows[n], hist)
            if not max(cross.values()) <= TOL:
                raise CheckError("check (b): the form-sum cross-check differs for %s (%s)" % (n, cross))
        # (8) the weekly fold
        for n in names:
            t1 = time.time()
            held_.preds[n], held_.fits[n] = weekly_models.fold_w(frame[n], held, store, n, specs_w[n], rel, hist, env=env, env_w=env_w)
            secs["fit " + n] = round(time.time() - t1, 1)
            log("held season %d: weekly fold %s done in %.0fs" % (held, n, secs["fit " + n]))
        # (9) season evaluation
        sf = evaluate.build_frame(tables, [held], {"h": held_.derived["H"], "g": held_.derived["G"]})
        held_.season = evaluate.evaluate(sf, (held,), B)
        # (10) weekly evaluation
        held_.wk = merge_preds(held_.wk_base, held_.preds)
        held_.weekly = evaluate_w.labels(held_.wk, (held,), B)
    secs["total"] = round(time.time() - t_all, 1)                                           # (11)
    return held_


# ── §7 comparison helpers ───────────────────────────────────────────────────────────────────────────────────
class Checker:
    """Accumulates the maxima of every comparison per (check, cand, position) and every miss; `finish` raises when any check missed."""

    def __init__(self):
        self.res, self.misses = {}, []

    def _slot(self, r, cand, pos):
        s = self.res.setdefault((r, cand, pos), {"maxAbs": 0.0, "maxRel": 0.0, "worstCol": None, "pass": True, "n": 0})
        return s

    def arrays(self, r, cand, pos, col, a, b, limit, keys=None, report_only=False, allowed=None):
        """Compare numeric arrays `a` (this run) against `b` (the reference): NaN patterns must be identical; |a - b| / (1 + |b|) <= limit.
        `allowed` (optional per-row absolute allowance) replaces the relative test: |a - b| <= allowed + TOL (1 + |b|)."""
        a, b = np.asarray(a, float), np.asarray(b, float)
        s = self._slot(r, cand, pos)
        s["n"] += 1
        if a.shape != b.shape:
            self._miss(s, r, cand, pos, col, float("inf"), float("inf"), None, "shape %s vs %s" % (a.shape, b.shape), report_only)
            return
        nan_a, nan_b = np.isnan(a), np.isnan(b)
        if (nan_a != nan_b).any():
            i = int(np.flatnonzero(nan_a != nan_b)[0])
            self._miss(s, r, cand, pos, col, float("inf"), float("inf"), None if keys is None else keys[i], "NaN pattern differs", report_only)
            return
        d = np.where(nan_a, 0.0, np.abs(a - b))
        rel = d / (1.0 + np.abs(np.where(nan_b, 0.0, b)))
        mabs, mrel = (float(d.max()), float(rel.max())) if len(d) else (0.0, 0.0)
        if allowed is not None:
            bad = d > (np.asarray(allowed, float) + TOL * (1.0 + np.abs(np.where(nan_b, 0.0, b))))
        else:
            bad = rel > limit
        if mrel >= s["maxRel"]:
            s["worstCol"] = col
        s["maxAbs"], s["maxRel"] = max(s["maxAbs"], mabs), max(s["maxRel"], mrel)
        if bad.any():
            i = int(np.flatnonzero(bad)[0])
            self._miss(s, r, cand, pos, col, mabs, mrel, None if keys is None else keys[i], "max relative %.3g > %g" % (mrel, limit), report_only)

    def exact_other(self, r, cand, pos, col, a, b, keys=None):
        """Non-numeric columns: equality."""
        s = self._slot(r, cand, pos)
        s["n"] += 1
        a, b = np.asarray(a, object), np.asarray(b, object)
        ne = np.array([not (x == y or (x != x and y != y)) for x, y in zip(a, b)], bool) if a.shape == b.shape else np.ones(1, bool)
        if ne.any():
            i = int(np.flatnonzero(ne)[0])
            self._miss(s, r, cand, pos, col, 1.0, 1.0, None if keys is None else keys[min(i, len(keys) - 1)], "values differ", False)

    def _miss(self, s, r, cand, pos, col, mabs, mrel, key, why, report_only):
        s["maxAbs"], s["maxRel"] = max(s["maxAbs"], mabs), max(s["maxRel"], mrel)
        if report_only:
            return
        s["pass"] = False
        self.misses.append("%s %s %s %s%s: %s" % (r, cand, pos, col, "" if key is None else " first key %s" % (key,), why))

    def fail(self, r, cand, pos, col, why, key=None):
        self._miss(self._slot(r, cand, pos), r, cand, pos, col, float("inf"), float("inf"), key, why, False)

    def summary(self):
        out = {}
        for (r, cand, pos), s in sorted(self.res.items()):
            out.setdefault(r, {}).setdefault(cand, {})[pos] = dict(s, maxAbs=_fin(s["maxAbs"]), maxRel=_fin(s["maxRel"]))
        return out

    def finish(self):
        if self.misses:
            raise RehearsalMismatch("%d miss(es): %s%s" % (len(self.misses), "; ".join(self.misses[:12]), " …" if len(self.misses) > 12 else ""), self.summary())


def _fin(x):
    return x if np.isfinite(x) else None


def _limit(cand):
    return TOL if cand == "h" else G_LIMIT


def _rows_by_pid(df, cand, T):
    d = df[(df["cand"] == cand) & (df["T"] == T)]
    if "arm" in d.columns:
        d = d[d["arm"].isna()]
    return d.drop_duplicates("pid").set_index("pid")


def compare_season(ck, derived, season_preds, prior_file, entries, held):
    """R1 (composed values vs `season-preds.jsonl`) and R2 (`pr_*` vs `season-prior.jsonl`) for every derived candidate at T = held. `season_preds` /
    `prior_file`: frames read by the caller (jsonl rows). `entries`: `season_prior.dev_entries(<s2a dev panel>)`; G's chosen entry per position must equal it."""
    for n, dr in derived.items():
        cand = n.lower()
        lim = _limit(cand)
        sp = _rows_by_pid(season_preds, cand, held)
        pf = _rows_by_pid(prior_file, cand, held)
        for pos in POSITIONS:
            sub = dr[dr["position"] == pos]
            if not len(sub):
                continue
            pids = sub["pid"].tolist()
            if cand == "g":
                e = season_prior._entry_of(sub.iloc[0])
                want = entries.get((cand, held, pos))
                if e != want:
                    ck.fail("R1", cand, pos, "chosen entry", "chosen entry %s differs from the dev run's %s" % (e, want))
            for r, ref, cols in (("R1", sp, [c for c in dr.columns if c in season_prior.COMP_COLS or c.startswith("kv_")]),
                                 ("R2", pf, [c for c in dr.columns if c.startswith("pr_")])):
                psub = ref.reindex(pids)
                file_pos = ref[ref["position"] == pos] if "position" in ref.columns else ref.loc[ref.index.isin(pids)]
                if set(file_pos.index) != set(pids):
                    ck.fail(r, cand, pos, "pid set", "pid sets differ (this run %d, file %d)" % (len(pids), len(file_pos)))
                    continue
                for c in cols:
                    ck.arrays(r, cand, pos, c, sub[c].to_numpy(float), psub[c].astype(float).to_numpy(), lim, keys=pids)


def compare_inputs(ck, rows, cache_held, spec_w_):
    """R3: the new held-season rows against the cache's rows of the same season. Same identity columns in the same order; H every column exact; G every
    column outside `priorCols` exact, `pr_*` within 5%, `noPrior` exact, `dstd_*`/`drec_*` within the matching `pr_*`'s absolute gap on the same row (F12)."""
    prior_cols = set(spec_w_["priorCols"])
    for n, new in rows.items():
        cand = n.lower()
        old = cache_held[n].reset_index(drop=True)
        new = new.reset_index(drop=True)
        ident = spec_w_["identity"]
        for pos in POSITIONS:
            mn, mo = (new["position"] == pos).to_numpy(), (old["position"] == pos).to_numpy() if len(old) else np.zeros(0, bool)
            if mn.sum() != mo.sum():
                ck.fail("R3", cand, pos, "rows", "row counts differ (this run %d, cache %d)" % (mn.sum(), mo.sum()))
                continue
            a, b = new[mn].reset_index(drop=True), old[mo].reset_index(drop=True)
            keys = list(zip(a["pid"], a["S"], a["w"]))
            if not all((a[c].astype(str).to_numpy() == b[c].astype(str).to_numpy()).all() for c in ident[:3]):
                ck.fail("R3", cand, pos, "identity", "identity columns (pid, S, w) differ in order")
                continue
            gaps = {}
            if cand == "g":
                for t in spec_w_["targets"]:
                    gaps[t] = np.abs(a["pr_" + t].to_numpy(float) - b["pr_" + t].to_numpy(float))
            for c in new.columns:
                x, y = a[c], b[c]
                if not (pd.api.types.is_numeric_dtype(x) and pd.api.types.is_numeric_dtype(y)) or x.dtype == bool:
                    ck.exact_other("R3", cand, pos, c, x.to_numpy(), y.to_numpy(), keys)
                    continue
                xa, ya = x.to_numpy(float), y.to_numpy(float)
                if cand == "g" and c in prior_cols and c != "noPrior":
                    if c.startswith(("dstd_", "drec_")):
                        t = c.split("_", 1)[1]
                        # a NaN gap (the matching pr_ is NaN for the position) leaves the NaN-pattern rule in force
                        ck.arrays("R3", cand, pos, c, xa, ya, G_LIMIT, keys, allowed=np.where(np.isnan(gaps[t]), 0.0, gaps[t]))
                    else:
                        ck.arrays("R3", cand, pos, c, xa, ya, G_LIMIT, keys)
                else:
                    ck.arrays("R3", cand, pos, c, xa, ya, TOL, keys)


def _pred_check(ck, r, cand, p, preds_file, held, limit, report_only=False):
    ref = preds_file[(preds_file["cand"] == cand) & (preds_file["T"] == held)]
    k_new = list(zip(p["pid"], p["S"].astype(int), p["w"].astype(int)))
    ref = ref.assign(_k=list(zip(ref["pid"], ref["S"].astype(int), ref["w"].astype(int)))).set_index("_k")
    if set(k_new) != set(ref.index) or len(set(k_new)) != len(k_new):
        ck.fail(r, cand, "all", "keys", "(pid, S, w) sets differ (this run %d, file %d)" % (len(k_new), len(ref)))
        return
    ref = ref.loc[k_new]
    for pos in POSITIONS:
        m = (p["position"] == pos).to_numpy()
        if not m.any():
            continue
        keys = [k for k, f in zip(k_new, m) if f]
        for c in ("cond", "ppg", "p", "uncond", "c_w", "noPrior"):
            ck.arrays(r, cand, pos, c, p[c].to_numpy(float)[m], ref[c].astype(float).to_numpy()[m], limit, keys, report_only=report_only)
        if report_only:
            ck._slot(r, cand, pos)["reportOnly"] = True


def compare_preds(ck, preds, preds_file, held):
    """R4: `fold_w`'s predictions against `weekly-preds.jsonl` rows (cand, T = held): the same (pid, S, w) set; H exact; G REPORT-ONLY (Anton, 2026-11-20 — the
    end-to-end gap is the season-forecast variation; the exact G check is R4c)."""
    for n, p in preds.items():
        cand = n.lower()
        _pred_check(ck, "R4", cand, p, preds_file, held, _limit(cand), report_only=(cand == "g"))


def refit_cached(cache_frame, held, store, spec, rel, hist, env, env_w):
    """R4c's re-fit (rehearsal only): G's weekly fold at T = held on the CACHED 2b-1a frame (its season-prior columns as locked), default masks — the diagnostic's
    call. Returns (preds, fits)."""
    with boundary(held):
        if int(cache_frame["S"].max()) != held:
            raise AssertionError("the cached frame's last season %s is not the held season %s" % (cache_frame["S"].max(), held))
        return weekly_models.fold_w(cache_frame, held, store, "G", spec, rel, hist, env=env, env_w=env_w)


def compare_cached_refit(ck, preds, preds_file, held):
    """R4c: the cached-input G re-fit's predictions against `weekly-preds.jsonl` (cand g, T = held): the same (pid, S, w) set; `cond`, `ppg`, `p`, `uncond`,
    `c_w`, `noPrior` exact (`TOL`), never report-only."""
    _pred_check(ck, "R4c", "g", preds, preds_file, held, TOL)


_FACT_KEYS = ("k", "kGames", "rho", "alpha", "kMult", "medE")


def _same(a, b):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) <= TOL * (1.0 + abs(float(b)))


def compare_fits(ck, fits_facts, dev_fit, held):
    """R5: the fitted facts (`_clean`-ed `Fits.pos[P].facts` of `fits_facts[name]`) against the s2b1b dev panel's `fit[cand][held][P]`. H: per target `k`, `kGames`,
    `rho`, `alpha` (`"off"` as a string), `kMult`, `medE`, and `cW`, `phi` equal; G: `phi` equal, `cW` within 5%."""
    for n, facts in fits_facts.items():
        cand = n.lower()
        for pos, f in facts.items():
            ref = dev_fit[cand][str(held)][pos]
            s = ck._slot("R5", cand, pos)
            if cand == "h":
                for t, info in f["targets"].items():
                    for k in _FACT_KEYS:
                        s["n"] += 1
                        if not _same(info.get(k), ref["targets"][t].get(k)):
                            ck._miss(s, "R5", cand, pos, "%s.%s" % (t, k), 1.0, 1.0, None, "%r vs %r" % (info.get(k), ref["targets"][t].get(k)), False)
                s["n"] += 1
                if not _same(f["cW"], ref["cW"]):
                    ck._miss(s, "R5", cand, pos, "cW", 1.0, 1.0, None, "%r vs %r" % (f["cW"], ref["cW"]), False)
            else:
                rel = abs(float(f["cW"]) - float(ref["cW"])) / (1.0 + abs(float(ref["cW"])))
                s["maxRel"] = max(s["maxRel"], rel)
                s["maxAbs"] = max(s["maxAbs"], abs(float(f["cW"]) - float(ref["cW"])))
                if rel > G_LIMIT:
                    ck._miss(s, "R5", cand, pos, "cW", 0.0, rel, None, "%r vs %r" % (f["cW"], ref["cW"]), False)
            s["n"] += 1
            if not _same(f["phi"], ref["phi"]):
                ck._miss(s, "R5", cand, pos, "phi", 1.0, 1.0, None, "%r vs %r (a different phi is a stop; report both Brier rows)" % (f["phi"], ref["phi"]), False)


def compare_season_labels(ck, season, dev_results, held):
    """R6: `season[pos][cand]["labels"][bench]["d"]["value"]` for B2 and B1c against the s2a dev panel's `dByFold[held]`; H exact, G reported only."""
    for pos in POSITIONS:
        for cand in ("h", "g"):
            for bname, _ in BENCH_S:
                got = season[pos][cand]["labels"][bname]["d"]["value"]
                ref = dev_results[pos][cand]["labels"][bname]["dByFold"][str(held)]
                ck.arrays("R6", cand, pos, bname, [np.nan if got is None else got], [np.nan if ref is None else ref], TOL if cand == "h" else G_LIMIT, report_only=(cand == "g"))


def compare_weekly_labels(ck, weekly, weekly_dev, held):
    """R7: `weekly[cand][pos][bench]` `n`, `candMae`, `benchMae`, `d` values for STD and B1c against `evaluate_w.labels` on the same frame with the
    `weekly-preds.jsonl` predictions merged instead; H equal, G reported only."""
    for cand in ("h", "g"):
        for pos in POSITIONS:
            if pos not in weekly[cand]:
                continue
            for b in BENCH_W:
                x, y = weekly[cand][pos].get(b), weekly_dev[cand][pos].get(b)
                if x is None or y is None:
                    if (x is None) != (y is None):
                        ck.fail("R7", cand, pos, b, "one side has no %s row" % b)
                    continue
                vals = {"n": (x["n"], y["n"]), "candMae": (x["candMae"]["value"], y["candMae"]["value"]), "benchMae": (x["benchMae"]["value"], y["benchMae"]["value"]),
                        "d": (x["d"]["value"], y["d"]["value"])}
                for k, (u, v) in vals.items():
                    ck.arrays("R7", cand, pos, "%s.%s" % (b, k), [np.nan if u is None else u], [np.nan if v is None else v], TOL if cand == "h" else G_LIMIT, report_only=(cand == "g"))
