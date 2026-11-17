"""LP-2b-1a: T-W-1 (as-of), T-W-2 (held season), T-W-6 (teammate absence), T-W-7 (opponent and era), T-W-16 (copies and reuse), T-W-17 (targets).
Every test that reaches `season_models.fold` patches `registry.require` (`mock.patch.object`); none reaches the real lock."""
import glob
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
import pandas as pd

import run_weekly_inputs as rwi
from lp import asof, baselines, era, era_w, features, registry, season_models as sm, season_prior as sp, spec_w, splits, weekly_data as wd
from tests import synth_season as ss
from tests import synth_weekly as sw

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_W = spec_w.inputs_spec()
POS = ("QB", "RB", "WR", "TE")


def _pass(*a, **k):
    return None


def _store(tables, name="H"):
    spec = sw.small_spec(name)
    return sm.Store(tables, ss.KEYS, ss.WEIGHTS, spec), spec


def _bio(pids):
    return pd.DataFrame({"pid": list(pids), "age": 25.0, "exp": 3.0, "isRookie": 0.0})


def _row(frame, pid):
    return frame[frame["pid"] == pid].iloc[0]


def _frame(tables, S, n, spec_w_=SPEC_W, name="H"):
    """Everything rebuilt from `tables`: Store, derive (T = S), fallback, bio_block, mu_std, inputs_at, attach_prior."""
    store, spec = _store(tables, name)
    with mock.patch.object(registry, "require", _pass):
        derived = sp.derive(store, name, spec, S)
    fb = sp.fallback(tables, store, S)
    sc = asof.view(tables, S, 0).schedule
    bio = wd.bio_block(tables, store, S, sorted(set(sc.loc[sc["inUniverse"].astype(bool), "pid"])))
    mu = era_w.mu_std(tables, store, S, n)
    fr = wd.inputs_at(tables, store, S, n, spec_w_, bio)
    return wd.attach_prior(fr, derived, fb, mu, store, spec_w_), fb, derived, store, bio, mu


class TestAsOf(unittest.TestCase):
    """T-W-1. Fails if any weekly input reads week w or later, a later season, or (fallback) season S, by value or by row presence."""

    S = 2018

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = sw.make_weekly_panel()
        byes = sorted(set(cls.R.info["byes"][cls.S].values()))
        cls.n = byes[0]                                                    # some team's bye is week n (n >= 2): its w' is n - 1
        assert cls.n >= 2

    def _mates_flip(self, base, other, S, n):
        """Some row of week n + 1 has a mate of its position, with a positive to-date share on its team, whose week-w `played` differs."""
        v = asof.view(base, S, n)
        rows = wd.rows_at(v)
        w = n + 1
        pb = {r.pid: bool(r.played) for r in base.weeks[(base.weeks["S"] == S) & (base.weeks["w"] == w)].itertuples()}
        po = {r.pid: bool(r.played) for r in other.weeks[(other.weeks["S"] == S) & (other.weeks["w"] == w)].itertuples()}
        cur = v.weeks[(v.weeks["S"] == S) & v.weeks["played"].astype(bool)]
        for r in rows.itertuples():
            mates = cur[(cur["team"] == r.team) & (cur["position"] == r.position) & (cur["pid"] != r.pid) & ((cur["rec_tgt"] + cur["rush_att"] + cur["pass_att"]) > 0)]["pid"].unique()
            if any(m in pb and m in po and pb[m] != po[m] for m in mates):
                return True
        return False

    def test_inputs_identical_under_scramble_and_delete(self):
        S, n, t = self.S, self.n, self.t
        sc = next((s for s in (scr for scr in (sw.scrambled_full(t, S, n, seed) for seed in range(99, 140))) if self._mates_flip(t, s, S, n)), None)
        self.assertIsNotNone(sc, "fixture: the scramble flips the week-w `played` of a same-position mate with a positive share")
        rows = wd.rows_at(asof.view(t, S, n))
        late = set(self.R.info["late"].values())
        self.assertTrue(late & set(rows["pid"]), "fixture: a pid outside the S universe but inside the S + 1 universe has a row at week n + 1")
        self.assertTrue(late.isdisjoint(features.universe(t, S)) and late & set(features.universe(t, S + 1)))
        base, fb, *_ = _frame(t, S, n)
        for name, variant in (("scramble", sc), ("delete", sw.deleted_full(t, S, n))):
            got, fb2, *_ = _frame(variant, S, n)
            pd.testing.assert_frame_equal(base, got, obj="inputs (%s)" % name, check_exact=True)
            pd.testing.assert_frame_equal(fb.val, fb2.val)
            pd.testing.assert_frame_equal(fb.cnt, fb2.cnt)
        # the fallback reads no season-S row at all
        store, _spec = _store(t)
        allS = sw.scrambled_full(t, S, 0)
        store2, _spec = _store(allS)
        fa, fb_ = sp.fallback(t, store, S), sp.fallback(allS, store2, S)
        pd.testing.assert_frame_equal(fa.val, fb_.val)
        pd.testing.assert_frame_equal(fa.cnt, fb_.cnt)
        # the origin really matters: a week <= n changes the inputs
        w2 = t.weeks.copy()
        m = (w2["S"] == S) & (w2["w"] <= n) & w2["played"] & (w2["position"] == "WR")
        self.assertTrue(m.any())
        w2.loc[m, "rec_tgt"] = w2.loc[m, "rec_tgt"] + 7
        t2 = asof.Tables(w2, t.teams, t.seasons, t.bench, X=t.X, teamctx=t.teamctx, extras=t.extras)
        store0, _ = _store(t)
        self.assertFalse(wd.inputs_at(t2, store0, S, n, SPEC_W, _bio(set(rows["pid"]))).equals(wd.inputs_at(t, store0, S, n, SPEC_W, _bio(set(rows["pid"])))))

    def test_fallback_pool(self):
        """Fixture: every position has a finite fallback with exposure for each of its weekly targets; the pool is played weekly-universe rows of
        non-universe (pid, season) pairs only (hand computation for one target)."""
        t, S = self.t, self.S
        store, _ = _store(t)
        fb = sp.fallback(t, store, S)
        for pos in POS:
            for tg in spec_w.targets_by_pos()[pos]:
                self.assertTrue(np.isfinite(fb.val.loc[pos, tg]) and fb.cnt.loc[pos, tg] > 0, (pos, tg))
            self.assertTrue(0 < fb.val.loc[pos, "gamesShare"] <= 1)
        w = t.weeks
        pool = []
        for s in range(2014, S):
            uni = set(features.universe(t, s))
            pool.append(w[(w["S"] == s) & w["inUniverse"] & w["played"] & (w["position"] == "WR") & ~w["pid"].isin(uni)])
        pool = pd.concat(pool)
        self.assertEqual(set(pool["pid"]) & set(self.R.info["callups"].values()), set())
        self.assertAlmostEqual(fb.val.loc["WR", "rec_tgt"], pool["rec_tgt"].mean(), places=9)
        self.assertAlmostEqual(fb.val.loc["WR", "rec_yd"], t.X[pool["rid"].to_numpy(), ss.KEYS.index("rec_yd")].sum() / pool["rec_tgt"].sum(), places=9)


class _Rec:
    """Records, per call, the max season of every table reachable from the `tables` / `store` a function receives."""

    def __init__(self, late_rids):
        self.calls, self.late_rids = [], late_rids

    def wrap(self, name, fn):
        def inner(*a, **k):
            for x in list(a) + list(k.values()):
                tb = x if isinstance(x, asof.Tables) else (x.tables if isinstance(x, sm.Store) else None)
                if tb is not None:
                    mx = max(int(getattr(tb, n)["S"].max()) for n in wd.TABLE_NAMES if getattr(tb, n) is not None and len(getattr(tb, n)))
                    self.calls.append((name, mx, bool(np.isfinite(tb.X[self.late_rids]).any())))
            return fn(*a, **k)
        return inner


class TestHeldSeason(unittest.TestCase):
    """T-W-2. Fails if a held-season row or value is reachable from any input builder."""

    L = 2020

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = sw.make_weekly_panel()
        cls.late_rids = cls.t.weeks.loc[cls.t.weeks["S"] > cls.L, "rid"].to_numpy()

    def test_trim_and_assert_trimmed(self):
        L, t = self.L, self.t
        with mock.patch("builtins.open", side_effect=RuntimeError("trim reads nothing from disk")):
            tt = wd.trim(t, L)
        for n in wd.TABLE_NAMES:
            self.assertLessEqual(int(getattr(tt, n)["S"].max()), L, n)
        self.assertTrue(np.isnan(tt.X[self.late_rids]).all())
        self.assertTrue(np.isfinite(t.X[self.late_rids]).any(), "the input X was copied, not mutated")
        kept = tt.weeks["rid"].to_numpy()
        np.testing.assert_array_equal(tt.X[kept], t.X[kept])
        wd.assert_trimmed(tt, L)
        with self.assertRaises(AssertionError):
            wd.assert_trimmed(t, L)
        late = pd.DataFrame({"pid": ["a"], "S": [L + 1], "w": [1]})
        with self.assertRaises(AssertionError):
            wd.assert_trimmed(tt, L, frames=[late])
        wd.assert_trimmed(tt, L, frames=[wd.trim_frame(late, L)])
        X = tt.X.copy()
        X[self.late_rids[0]] = 1.0
        with self.assertRaises(AssertionError):
            wd.assert_trimmed(asof.Tables(tt.weeks, tt.teams, tt.seasons, tt.bench, X=X, teamctx=tt.teamctx, extras=tt.extras), L)
        benchw = pd.DataFrame({"pid": ["a", "b", "c"], "S": [L, L + 1, L + 2], "w": [1, 1, 1], "cond": [1.0, 2.0, 3.0], "uncond": [1.0, 2.0, 3.0]})
        b4 = pd.DataFrame({"pid": ["a", "b"], "S": [L - 1, L + 1], "w": [2, 2], "b4": [5.0, 6.0]})
        self.assertEqual(list(wd.trim_frame(benchw, L)["S"]), [L])
        self.assertEqual(list(wd.trim_frame(b4, L)["S"]), [L - 1])

    def test_nothing_held_reaches_a_builder(self):
        L = self.L
        rec = _Rec(self.late_rids)
        d = tempfile.mkdtemp()
        deps = rwi.Deps(load_cache=lambda: self.panel, load_teamctx=lambda: self.t.teamctx, load_extras=lambda: self.t.extras, load_spec=sw.small_spec, anchor=ss.ANCHOR,
                        season_preds_sha=None, section_sha=None, entries_path=None, cache_dir=d, out_dir=d)
        patches = [mock.patch.object(registry, "require", _pass), mock.patch.object(wd, "LAST_SEASON", L)]
        for mod, name in ((sp, "derive"), (sp, "fallback"), (era_w, "mu_std"), (wd, "bio_block"), (wd, "inputs_at"), (wd, "targets_at")):
            patches.append(mock.patch.object(mod, name, rec.wrap(name, getattr(mod, name))))
        logged = []
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], mock.patch.object(registry, "runlog_append", lambda env, e: logged.append(e)):
            rc = rwi.main(["--check", "--write", "--date", "2026-01-01"], deps=deps)
        called = {c[0] for c in rec.calls}
        self.assertEqual(called, {"derive", "fallback", "mu_std", "bio_block", "inputs_at", "targets_at"})
        self.assertLessEqual(max(c[1] for c in rec.calls), L)
        self.assertFalse(any(c[2] for c in rec.calls))
        self.assertEqual(rc, 0)
        with open(os.path.join(d, "2026-01-01-learned-s2b1a-inputs.json")) as f:
            art = json.load(f)
        self.assertTrue(all(art["threads"][v] == "1" for v in rwi.THREAD_VARS))
        self.assertIn("composeGap", art["priors"]["H"]["2018"]["WR"])
        self.assertIn("H is exact", art["statedLimits"][0])
        self.assertTrue(art["statedLimits"] and "unrecorded thread count" in art["statedLimits"][0])
        self.assertEqual(len(logged), 1)
        self.assertEqual((logged[0]["mode"], tuple(logged[0]["threads"][v] for v in rwi.THREAD_VARS)), ("weekly-inputs-check", ("1",) * 4))

    def test_guard_at_the_held_season(self):
        L = self.L
        t = self.t
        store, spec = _store(t)
        rows = pd.DataFrame({"pid": ["a"], "S": [L + 1], "w": [1], "position": ["WR"]})
        with mock.patch.object(wd, "LAST_SEASON", L), mock.patch.object(registry, "require", _pass):
            calls = [lambda: sp.derive(store, "H", spec, L + 1), lambda: sp.fallback(t, store, L + 1), lambda: era_w.mu_std(t, store, L + 1, 3),
                     lambda: wd.bio_block(t, store, L + 1, ["a"]), lambda: wd.inputs_at(t, store, L + 1, 3, SPEC_W, _bio(["a"])), lambda: wd.targets_at(t, rows, store)]
            for f in calls:
                with self.assertRaises(registry.ConfirmationHeld):
                    f()

            class Sentinel(Exception):
                pass
            with mock.patch.object(sm, "fold", side_effect=Sentinel):
                with self.assertRaises(Sentinel):
                    sp.derive(store, "H", spec, L + 1, confirm=True)             # it passed the guard and reached fold

    def test_boundary_and_static(self):
        self.assertEqual(wd.LAST_SEASON, splits.CONFIRM_FOLD - 1)
        self.assertNotIn("lastSeason", spec_w.inputs_spec())
        files = glob.glob(os.path.join(HERE, "lp", "*.py")) + glob.glob(os.path.join(HERE, "run_*.py"))
        self.assertTrue(files)
        for f in files:
            with open(f) as fh:
                self.assertNotIn("confirm" + "=True", fh.read(), f)


class TestThreadPin(unittest.TestCase):
    """Anton's ruling 2026-11-17: every G fit of the new runner is one-threaded. Fails if the runner stops setting OMP_NUM_THREADS before sklearn."""

    def test_runner_pins_every_thread_pool_before_sklearn(self):
        env = {**os.environ, **{v: "8" for v in rwi.THREAD_VARS}}
        code = ("import os, run_weekly_inputs as r; from threadpoolctl import threadpool_info; "
                "print(*[os.environ[v] for v in r.THREAD_VARS], r._SKLEARN_PRELOADED); print(*[i['num_threads'] for i in threadpool_info()])")
        r = subprocess.run([sys.executable, "-c", code], cwd=HERE, env=env, capture_output=True, text=True)
        lines = r.stdout.strip().splitlines()
        self.assertEqual(lines[0].split(), ["1", "1", "1", "1", "False"], r.stderr[-500:])
        self.assertTrue(len(lines) > 1 and lines[1].split(), "threadpoolctl reports at least one loaded pool")
        self.assertEqual(set(lines[1].split()), {"1"}, "every loaded thread pool runs one thread: " + lines[1])
        self.assertEqual(set(rwi.THREAD_VARS), {"OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"})


class TestHashSeedPin(unittest.TestCase):
    """A G fit varies across processes with PYTHONHASHSEED; the CLI re-executes itself with seed 0. Fails if the re-exec is dropped or keeps another seed."""

    def test_reexec_with_seed_zero(self):
        calls = []
        with mock.patch.dict(os.environ, {"PYTHONHASHSEED": "random"}):
            rwi._ensure_hash_seed(execv=lambda exe, argv: calls.append((exe, argv, os.environ["PYTHONHASHSEED"])))
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][2], "0")
            rwi._ensure_hash_seed(execv=lambda *a: calls.append("again"))            # already seed 0: no second re-exec
        self.assertEqual(len(calls), 1)


# ── T-W-6 ───────────────────────────────────────────────────────────────────────────────────────────────────
def _inputs(mini, n, pids=None):
    t = mini.tables()
    store, _ = _store(t)
    return wd.inputs_at(t, store, mini.S, n, SPEC_W, _bio(sorted(mini.pos)))


def _wr_case(S=2018, w3_status="D", w3_rw="ACT", w2_third=False):
    """AAA weeks 1-3 sum to 16 targets + 4 rushes per game; W2 (a WR mate) has 6 of 20 in each of weeks 1-2 → share 0.3."""
    m = sw.Mini(S=S, W=4)
    for w in (1, 2, 3):
        m.sums[("AAA", w)] = dict(rec_tgt=16, rush_att=4, pass_att=30)
        m.play("W1", "WR", w, raw=dict(rec_tgt=5))
    m.miss("W1", "WR", 4)
    for w in (1, 2):
        m.play("W2", "WR", w, raw=dict(rec_tgt=6))
        m.play("R1", "RB", w, raw=dict(rush_att=4))
    if w2_third:
        m.play("W2", "WR", 3, raw=dict(rec_tgt=6))
    else:
        m.miss("W2", "WR", 3, status=w3_status, rwst=w3_rw)
        m.miss("R1", "RB", 3)
    m.miss("W2", "WR", 4)
    return m


class TestAbsence(unittest.TestCase):
    """T-W-6. Fails on a same-week read or mismatched share components."""

    def test_wr_mate_out_at_w_prime(self):
        r = _row(_inputs(_wr_case(), 3), "W1")
        self.assertAlmostEqual(r["vacShare"], 0.3)                       # the RB mate (0.2) is not a mate of a WR row
        self.assertAlmostEqual(r["retShare"], 0.3)                       # his week-3 `rw` lists AAA with ACT
        self.assertTrue(np.isnan(r["qbOut"]), "no QB mate")
        self.assertEqual((r["first"], r["playedPrev"]), (0.0, 1.0))
        r = _row(_inputs(_wr_case(w3_rw="INA"), 3), "W1")
        self.assertAlmostEqual(r["vacShare"], 0.3)
        self.assertEqual(r["retShare"], 0.0)
        r = _row(_inputs(_wr_case(S=2015), 3), "W1")                     # historic rosters: rw is masked
        self.assertAlmostEqual(r["vacShare"], 0.3)
        self.assertTrue(np.isnan(r["retShare"]))

    def test_mate_who_misses_only_week_w(self):
        r = _row(_inputs(_wr_case(w2_third=True), 3), "W1")
        self.assertEqual(r["vacShare"], 0.0)

    def test_qb_out(self):
        def qbs(q1_weeks, q2_weeks, q1_pa, q2_pa):
            m = sw.Mini(W=4)
            for w in (1, 2, 3):
                m.sums[("AAA", w)] = dict(rec_tgt=16, rush_att=4, pass_att=30)
                m.play("W1", "WR", w, raw=dict(rec_tgt=5))
            m.miss("W1", "WR", 4)
            for pid, weeks, pa in (("Q1", q1_weeks, q1_pa), ("Q2", q2_weeks, q2_pa)):
                for w in (1, 2, 3):
                    (m.play(pid, "QB", w, raw=dict(pass_att=pa)) if w in weeks else m.miss(pid, "QB", w))
                m.miss(pid, "QB", 4)
            return _inputs(m, 3)
        f = qbs((1, 2), (1, 2, 3), 30, 10)                                # Q1 (60 attempts) is the top passer and missed week 3
        self.assertEqual(_row(f, "W1")["qbOut"], 1.0)
        self.assertTrue(np.isnan(_row(f, "Q2")["qbOut"]), "NaN on a QB row")
        self.assertAlmostEqual(_row(f, "Q2")["vacShare"], 60 / 60)         # a QB mate's share: pass_att over the team's pass_att
        f = qbs((1, 2, 3), (1, 2), 20, 30)                                # tied on 60: the lower pid (Q1, who played) decides, not Q2 (out)
        self.assertEqual(_row(f, "W1")["qbOut"], 0.0)

    def test_qb_share_stays_at_most_one(self):
        m = sw.Mini(W=4)
        for w in (1, 2, 3):
            m.sums[("AAA", w)] = dict(rec_tgt=30, rush_att=10, pass_att=30)
            m.play("Q9", "QB", w, raw=dict(pass_att=1))
        m.miss("Q9", "QB", 4)
        for w in (1, 2):
            m.play("Q1", "QB", w, raw=dict(pass_att=30, rush_att=5))
        m.miss("Q1", "QB", 3)
        m.miss("Q1", "QB", 4)
        r = _row(_inputs(m, 3), "Q9")
        self.assertAlmostEqual(r["vacShare"], 1.0)                        # 60 / 60, never (60 + 10) / 60

    def test_traded_player_keeps_his_own_status(self):
        m = sw.Mini(W=4)
        for w in (1, 2, 3):
            m.sums[("AAA", w)] = dict(rec_tgt=16, rush_att=4, pass_att=30)
        m.play("W1", "WR", 1, team="BBB", raw=dict(rec_tgt=5))
        m.play("W1", "WR", 2, team="AAA", raw=dict(rec_tgt=5))
        m.miss("W1", "WR", 3, team="BBB", status="X", rwst="RES")        # his row at w' is on his old team, with his own status
        m.miss("W1", "WR", 4, team="AAA")
        r = _row(_inputs(m, 3), "W1")
        self.assertEqual((r["team"], r["prevX"], r["prevD"], r["prevNone"], r["playedPrev"]), ("AAA", 1.0, 0.0, 0.0, 0.0))
        self.assertEqual((r["runN"], r["runP"], r["wkSince"], r["rwPrev_RES"], r["rwPrev_ACT"]), (1.0, 0.0, 1.0, 1.0, 0.0))

    def test_first(self):
        f = _inputs(_wr_case(), 0)
        r = _row(f, "W1")
        self.assertEqual((r["first"], r["vacShare"], r["retShare"]), (1.0, 0.0, 0.0))
        self.assertTrue(np.isnan(r["qbOut"]))
        for c in ("playedPrev", "prevD", "prevX", "prevNone", "rwPrev_ACT", "depthPrev", "depthChg", "wkSince"):
            self.assertTrue(np.isnan(r[c]), c)


# ── T-W-7 ───────────────────────────────────────────────────────────────────────────────────────────────────
class TestOpponentAndEra(unittest.TestCase):
    """T-W-7. Fails on averaged rates, an unmapped relocation or a full-season mean."""

    S, n = 2018, 5

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = sw.make_weekly_panel()
        cls.fr, cls.fb, cls.derived, cls.store, cls.bio, cls.mu = _frame(cls.t, cls.S, cls.n)

    def test_opponent_sums_and_era_team(self):
        m = sw.Mini(S=2020, W=4)
        for w in (1, 2, 3):
            m.play("W1", "WR", w, raw=dict(rec_tgt=5), opp="LV")
        m.miss("W1", "WR", 4, opp="LV")
        for w, (es, ep, pa, ts, tt) in enumerate([(3, 10, 10, 2, 1), (8, 20, 20, 3, 1), (6, 30, 30, 1, 0)], start=1):
            m.extra_ctx.append(("LV", 2020, w, dict(def_epaSum=float(es), def_epaPlays=float(ep), def_pointsAllowed=float(pa), def_rzTripsAllowed=float(ts), def_rzTdTripsAllowed=float(tt))))
        m.extra_ctx.append(("LV", 2019, 1, dict(def_epaSum=99.0, def_epaPlays=1.0)))                      # the unmapped relocation would read this
        for w, (es, ep) in enumerate([(4, 8), (6, 12)], start=1):
            m.extra_ctx.append(("OAK", 2019, w, dict(def_epaSum=float(es), def_epaPlays=float(ep))))
        r = _row(_inputs(m, 3), "W1")
        self.assertAlmostEqual(r["oEpa"], 17 / 60)                        # not the mean of the weekly rates (0.3, 0.4, 0.2 → 0.3)
        self.assertAlmostEqual(r["oPtsPg"], 60 / 3)
        self.assertAlmostEqual(r["oRzTd"], 2 / 6)
        self.assertEqual(r["oG"], 3.0)
        self.assertAlmostEqual(r["oEpa1"], 10 / 20)                        # 2020 LV reads 2019 OAK

    def test_mu_std_weeks_up_to_n_only(self):
        S, n, t, store = self.S, self.n, self.t, self.store
        mu = era_w.mu_std(t, store, S, n)
        w = t.weeks
        cur = w[(w["S"] == S) & (w["w"] <= n) & w["played"]]
        for pos, q in (("WR", "rec_tgt"), ("RB", "rush_att")):
            g = cur[cur["position"] == pos].groupby("pid").agg(g=("w", "size"), q=(q, "sum"), oppo=("rec_tgt", "sum"), ra=("rush_att", "sum")).reset_index()
            g["oppo"] = g["oppo"] + g["ra"]
            top = g.sort_values(["oppo", "pid"], ascending=[False, True]).head(store.struct["topN"][pos])
            self.assertAlmostEqual(mu[(pos, q)], top["q"].sum() / top["g"].sum(), places=9)
        self.assertEqual(era_w.mu_std(t, store, S, 0), {})
        pd.testing.assert_series_equal(pd.Series(mu).sort_index(), pd.Series(era_w.mu_std(sw.scrambled_full(t, S, n), store, S, n)).sort_index())

    def test_blend(self):
        np.testing.assert_array_equal(era_w.blend(np.array([2.0, 3.0]), 2.0, 0, 4), [2.0, 3.0])        # omega(0) = 0
        np.testing.assert_allclose(era_w.blend(np.array([2.0]), 2.0, 4, 4), [3.0])
        S, store, derived = self.S, self.store, self.derived
        fr0 = _frame(self.t, S, 0)[0]
        d = derived[derived["T"] == S].set_index("pid")
        for P in POS:
            m = fr0[(fr0["position"] == P) & (fr0["noPrior"] == 0)]
            for tg in spec_w.targets_by_pos()[P]:
                np.testing.assert_array_equal(m["pr_" + tg].to_numpy(), d.loc[m["pid"], "pr_" + tg].to_numpy())

    def test_attach_prior_blends_with_the_spec_n0(self):
        S, n, fr, store, mu, derived, fb = self.S, self.n, self.fr, self.store, self.mu, self.derived, self.fb
        d = derived[derived["T"] == S].set_index("pid")
        ratios = {(P, tg): era_w.ratio(mu, store, S, P, tg) for P in POS for tg in spec_w.targets_by_pos()[P]}
        self.assertTrue(any(abs(r - 1) > 1e-6 for r in ratios.values()), "fixture: some in-season league mean differs from last season's")
        inputs = wd.inputs_at(self.t, store, S, n, SPEC_W, self.bio)
        for n0 in (4, 1):
            sp_ = {**SPEC_W, "eraN0": n0}
            out = wd.attach_prior(inputs, derived, fb, mu, store, sp_)
            self.assertEqual(sp_["eraN0"], n0)
            for _i, r in out.iterrows():
                P = r["position"]
                for tg in spec_w.targets_by_pos()[P]:
                    base = d.loc[r["pid"], "pr_" + tg] if r["pid"] in d.index else fb.val.loc[P, tg]
                    want = base * (1 + n / (n + n0) * (ratios[(P, tg)] - 1))
                    self.assertAlmostEqual(r["pr_" + tg], want, places=9)
                    self.assertAlmostEqual(r["dstd_" + tg], r["std_" + tg] - r["pr_" + tg], places=9) if np.isfinite(r["std_" + tg]) else self.assertTrue(np.isnan(r["dstd_" + tg]))
                    self.assertAlmostEqual(r["drec_" + tg], r["rec_" + tg] - r["pr_" + tg], places=9) if np.isfinite(r["rec_" + tg]) else self.assertTrue(np.isnan(r["drec_" + tg]))
                gs = d.loc[r["pid"], "pr_gamesShare"] if r["pid"] in d.index else fb.val.loc[P, "gamesShare"]
                self.assertEqual(r["pr_gamesShare"], gs)                       # never blended
                self.assertEqual(r["noPrior"], float(r["pid"] not in d.index))
        self.assertTrue(fr["noPrior"].any() and (fr["noPrior"] == 0).any())


# ── T-W-16 ──────────────────────────────────────────────────────────────────────────────────────────────────
class TestCopies(unittest.TestCase):
    """T-W-16. Fails if a copied formula drifts from its original or the season slice changes a share."""

    S = 2018

    @classmethod
    def setUpClass(cls):
        cls.R, cls.t, cls.panel = sw.make_weekly_panel()
        cls.store, _ = _store(cls.t)
        cls.W = cls.R.info["W"]
        t, S = cls.t, cls.S
        cls.F = features.season_features(asof.view(t, S + 1, 0), sorted(set(t.weeks.loc[t.weeks["S"] == S, "pid"])), features.universe(t, S + 1), {**cls.store.struct},
                                         cls.store.pos, cls.store.keys, ps=cls.store.ps(S + 1))

    def test_team_block_equals_features(self):
        F, S = self.F, self.S
        v = asof.view(self.t, S, self.W)
        tk = [era.era_team(x, S) if isinstance(x, str) else None for x in F["team_k"]]
        tb = wd.team_block(v, set(x for x in tk if x))
        self.assertTrue(len(tb) > 0)
        for mine, orig in (("tPassPg", "tmPassPg"), ("tRushPg", "tmRushPg"), ("tPtsPg", "tmPtsPg"), ("tEpa", "tmEpaPlay"), ("tProe", "tmProe")):
            got = tb[mine].reindex(tk).to_numpy(float)
            self.assertTrue(np.isfinite(got).any(), mine)
            np.testing.assert_allclose(got, F[orig].to_numpy(float), equal_nan=True, err_msg=mine)

    def test_gl_block_equals_features(self):
        F, S = self.F, self.S
        gb = wd.gl_block(asof.view(self.t, S, self.W), list(F["pid"]))
        for c in ("passEpaAtt", "cpoe", "rushEpaAtt", "recEpaTgt", "rushFdAtt", "recFdTgt", "yacRec"):
            self.assertTrue(np.isfinite(gb[c].to_numpy()).any(), c)
            np.testing.assert_allclose(gb[c].to_numpy(float), F[c + "1"].to_numpy(float), equal_nan=True, err_msg=c)         # features.py lag-1 gl

    def test_season_only_leaves_shares_unchanged(self):
        v = asof.view(self.t, self.S, 5)
        a = features.player_seasons(v, self.store.keys)
        b = features.player_seasons(era_w.season_only(v), self.store.keys)
        a = a[a["s"] == self.S].reset_index(drop=True)
        self.assertEqual(set(b["s"]), {self.S})
        self.assertTrue(a["airShare"].notna().any())
        pd.testing.assert_frame_equal(a, b.reset_index(drop=True))

    def test_last_three_shares(self):
        S, n, t = self.S, 6, self.t
        fr = wd.inputs_at(t, self.store, S, n, SPEC_W, _bio(sorted(set(t.weeks["pid"]))))
        self.assertNotIn("airSh3", fr.columns)
        w, tm = t.weeks, t.teams
        checked = 0
        for r in fr[fr["position"].isin(["WR", "RB"])].itertuples():
            rows = w[(w["pid"] == r.pid) & (w["S"] == S) & (w["w"] <= n) & w["played"]].sort_values("w").tail(3)
            if len(rows) < 3:
                continue
            ts = rows.merge(tm[tm["S"] == S], on=["team", "w"], suffixes=("", "_t"))
            self.assertAlmostEqual(r.tgtSh3, rows["rec_tgt"].sum() / ts["sum_rec_tgt"].sum(), places=9)
            self.assertAlmostEqual(r.rushSh3, rows["rush_att"].sum() / ts["sum_rush_att"].sum(), places=9)
            self.assertAlmostEqual(r.rzSh3, (rows["rec_rz_tgt"] + rows["rush_rz_att"]).sum() / (ts["sum_rec_rz_tgt"] + ts["sum_rush_rz_att"]).sum(), places=9)
            self.assertAlmostEqual(r.oppoPg3, (rows["rush_att"] + rows["rec_tgt"]).sum() / 3, places=9)
            checked += 1
        self.assertGreater(checked, 3)


# ── T-W-17 ──────────────────────────────────────────────────────────────────────────────────────────────────
class TestTargets(unittest.TestCase):
    """T-W-17. Fails on an `X` lookup of an opportunity or a missing exclusion."""

    def test_targets(self):
        m = sw.Mini(W=4)
        m.play("R1", "RB", 4, raw=dict(rush_att=12, rec_tgt=3), x=ss.xvec(rush_yd=54.0, bonus_fd_rb=4.0, rec=2.0, rec_yd=20.0, rush_td=1.0))
        m.play("R2", "RB", 4, raw=dict(rush_att=5, rec_tgt=0), x=ss.xvec(rush_yd=10.0))
        m.miss("R3", "RB", 4)
        t = m.tables()
        store, _ = _store(t)
        rows = pd.DataFrame({"pid": ["R1", "R2", "R3"], "S": 2018, "w": 4, "position": "RB"})
        out = wd.targets_at(t, rows, store).set_index("pid")
        r = out.loc["R1"]
        self.assertEqual((r["r_rush_att"], r["e_rush_att"], r["r_rec_tgt"], r["e_rec_tgt"]), (12.0, 1.0, 3.0, 1.0))      # opportunities: the raw columns
        self.assertAlmostEqual(r["r_rush_yd"], 54 / 12)
        self.assertEqual(r["e_rush_yd"], 12.0)
        self.assertAlmostEqual(r["r_rush_td"], 1 / 12)
        self.assertAlmostEqual(r["r_rec"], 2 / 3)
        self.assertAlmostEqual(r["r_bonus_fd_rb"], 4 / 15)                   # over rush_att + rec_tgt
        self.assertEqual(r["e_bonus_fd_rb"], 15.0)
        self.assertEqual(r["e_kr_yd"], 1.0)                                  # a per-game key
        self.assertTrue(r["played"] and np.isfinite(r["pts"]))
        r = out.loc["R2"]
        self.assertTrue(np.isnan(r["r_rec"]) and r["e_rec"] == 0.0)          # a zero denominator
        self.assertEqual((r["r_rec_tgt"], r["e_rec_tgt"]), (0.0, 1.0))
        r = out.loc["R3"]
        self.assertFalse(r["played"])
        for tg in spec_w.targets_by_pos()["RB"]:
            self.assertEqual(r["e_" + tg], 0.0)
            self.assertTrue(np.isnan(r["r_" + tg]))
        self.assertNotIn("r_gamesShare", out.columns)
        self.assertTrue(np.isnan(out.loc["R1", "r_pass_att"]) and np.isnan(out.loc["R1", "e_pass_att"]), "a QB target on an RB row")
        with mock.patch.object(wd, "targets_at", side_effect=AssertionError("an input builder called the outcome builder")):
            m2 = sw.Mini(W=4)
            m2.play("W1", "WR", 1, raw=dict(rec_tgt=4))
            m2.miss("W1", "WR", 2)
            t2 = m2.tables()
            wd.inputs_at(t2, _store(t2)[0], 2018, 1, SPEC_W, _bio(["W1"]))


if __name__ == "__main__":
    unittest.main()
