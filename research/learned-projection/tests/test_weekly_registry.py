"""LP-2b-1b: T-B-13 (weekly registration, temp git repo), T-B-15 (pins, prereg, verdict), T-B-16 (caches by SHA), and the runner parts of T-B-10 (held season)
and T-B-11 (the fits file and its SHA). Every test that reaches `fold_w` patches `registry.require`."""
import glob
import json
import os
import pickle
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import pandas as pd

import run_weekly_inputs as rwi
import run_weekly_models as rwm
from lp import evaluate_w, registry, registry_w, report, report_s2b, weekly_data as wd, weekly_models
from tests import e2e_w
from tests import synth_wmodels as swm

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
LP1A = os.path.join(REPO, ".claude", "tasks", "learned-projection-1a-harness.md")
S2B1A = os.path.join(REPO, ".claude", "tasks", "learned-projection-2b1a-weekly-inputs.md")
ARTIFACT_2B1A = os.path.join(REPO, "backtests", "2026-11-17-learned-s2b1a-inputs.json")


def git(d, *a):
    r = subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t"] + list(a), cwd=d, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r


def _bytes(p):
    with open(p, "rb") as f:
        return f.read()


class WRepo:
    """A temporary git repository holding every hashed path (stubs), both candidate files with a STAMPED season layer and four stand-in data files."""

    def __init__(self):
        self.d = tempfile.mkdtemp()
        git(self.d, "init", "-q")
        self.data = {"panelGeneratedAt": "g", "panelDataRev": "r", "gamelogs": {"2012": "x"}}
        self.patch = mock.patch.object(registry, "default_data", lambda: dict(self.data))
        self.patch.start()
        for n, text in (("benchw.jsonl", "b\n"), ("benchw.meta.json", "{}\n"), ("weekly-inputs.pkl", "i\n"), ("season-prior.jsonl", "p\n")):
            self.write("copies/" + n, text)
        files = set(registry.season_code("H") + registry.season_code("G") + registry.SEASON_HARNESS + registry_w.WEEKLY_CODE("H") + registry_w.WEEKLY_CODE("G") + registry_w.WEEKLY_HARNESS)
        for p in sorted(files):
            self.write(p, "# %s\n" % p)
        os.makedirs(os.path.join(self.d, "candidates"))
        for n in ("H", "G"):
            obj = {"name": n, "preregHash": None, "layers": {"season": {"spec": {"name": n, "k": [1, 2]}, "specSha256": None, "code": None, "harness": None, "data": None,
                                                                         "taskFileSha256": None, "registeredAt": None, "python": None, "requirements": None, "reregistrations": []}}}
            self.write("candidates/%s.json" % n, json.dumps(obj, indent=1, sort_keys=True) + "\n")
        self.write("task.md", "task\n")
        c = lambda n: os.path.join(self.d, "copies", n)
        self.env_s = registry.Env(base=self.d, repo=self.d, data_fn=lambda: dict(self.data), prereg="PREREG", task_file=os.path.join(self.d, "task.md"))
        self.env_w = registry_w.weekly_env(task_file=os.path.join(self.d, "task.md"), base=self.d, repo=self.d, prereg="PREREG",
                                           data_fn=lambda: registry_w.weekly_data_hashes(benchw=c("benchw.jsonl"), benchw_meta=c("benchw.meta.json"), inputs=c("weekly-inputs.pkl"), prior=c("season-prior.jsonl")))
        self.commit("c1")
        registry.register(self.env_s)
        self.commit("season registered")
        self.sections = {n: registry_w.section_hash(self.env_w, n) for n in ("H", "G")}

    def write(self, rel, text):
        p = os.path.join(self.d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)

    def commit(self, msg):
        git(self.d, "add", "-A")
        git(self.d, "commit", "-q", "-m", msg, "--allow-empty")

    def cand(self, n):
        return os.path.join(self.d, "candidates", "%s.json" % n)

    def snapshot(self):
        return {n: _bytes(self.cand(n)) for n in ("H", "G")}

    def initialised(self):
        registry_w.init_weekly(self.env_w)
        self.commit("init weekly")
        return self

    def registered(self):
        self.initialised()
        registry_w.register_weekly(self.env_s, self.env_w)
        self.commit("weekly registered")
        return self

    def close(self):
        self.patch.stop()
        shutil.rmtree(self.d, ignore_errors=True)


class TestWeeklyRegistration(unittest.TestCase):
    """T-B-13. Fails if a test-fold fit can start unregistered, a section is rewritten, or a failed check uses up `--dev`."""

    def setUp(self):
        self.r = WRepo()
        d = self._deps("OTHER")
        self.assertNotEqual(d.load_meta()["generatedAt"], d.anchor, "Fact: the test anchor differs from the meta")

    def tearDown(self):
        self.r.close()

    def _raises(self, name="H", T=2019, exc=registry.NotRegistered):
        with self.assertRaises(exc):
            registry.require(name, T, "weekly", self.r.env_w)

    def test_require_raises_until_registered_then_on_every_stale_hash(self):
        r = self.r.initialised()
        self._raises()                                                        # the init layer is unstamped
        registry_w.register_weekly(r.env_s, r.env_w)
        r.commit("weekly registered")
        self.assertTrue(registry.require("H", 2019, "weekly", r.env_w))      # passes when clean
        for rel in ("benchw.jsonl", "weekly-inputs.pkl"):                     # a stale data hash
            p = os.path.join(r.d, "copies", rel)
            before = _bytes(p)
            with open(p, "ab") as f:
                f.write(b"x")
            self._raises()
            with open(p, "wb") as f:
                f.write(before)
            registry.require("H", 2019, "weekly", r.env_w)
        for rel in ("lp/weekly_models.py", "lp/evaluate_w.py"):               # a changed code item, then a harness item (committed)
            r.write(rel, "# changed\n")
            r.commit("edit " + rel)
            self._raises()
            git(r.d, "revert", "--no-edit", "HEAD")
            registry.require("H", 2019, "weekly", r.env_w)
        obj = json.loads(_bytes(r.cand("H")))
        obj["layers"]["weekly"]["spec"]["calibMinRows"] = 99
        r.write("candidates/H.json", json.dumps(obj, indent=1, sort_keys=True) + "\n")
        r.commit("spec edit")
        self._raises()                                                        # specSha256 no longer recomputes

    def test_init_weekly_refuses_an_existing_key_and_keeps_the_season_section(self):
        r = self.r.initialised()
        with self.assertRaises(registry.NotRegistered):
            registry_w.init_weekly(r.env_w)
        for n in ("H", "G"):
            self.assertEqual(registry_w.section_hash(r.env_w, n), r.sections[n])
            lay = registry.load(r.env_w, n)["layers"]["weekly"]
            self.assertEqual([k for k in registry.STAMP_KEYS if lay[k] is not None], ["spec"])
            self.assertEqual(lay["reregistrations"], [])

    def test_init_weekly_restores_both_files_when_a_section_changes(self):
        r = self.r
        before = r.snapshot()
        with self.assertRaises(registry.NotRegistered):
            registry_w.init_weekly(r.env_w, section_sha={"H": "0" * 64, "G": "0" * 64})
        self.assertEqual(r.snapshot(), before)

    def test_register_refusals_leave_both_files_untouched(self):
        r = self.r.initialised()
        before = r.snapshot()
        registry.runlog_append(r.env_w, {"mode": "weekly-dev"})              # a weekly-dev entry closes registration
        with self.assertRaises(registry.NotRegistered):
            registry_w.register_weekly(r.env_s, r.env_w)
        os.remove(r.env_w.runlog)
        obj = json.loads(_bytes(r.cand("H")))                                  # a spec that differs from HEAD
        obj["layers"]["weekly"]["spec"]["calibMinRows"] = 77
        r.write("candidates/H.json", json.dumps(obj, indent=1, sort_keys=True) + "\n")
        with self.assertRaises(registry.NotRegistered):
            registry_w.register_weekly(r.env_s, r.env_w)
        git(r.d, "checkout", "--", "candidates/H.json")
        self.assertEqual(r.snapshot(), before)
        registry_w.register_weekly(r.env_s, r.env_w)
        r.commit("weekly registered")
        with self.assertRaises(registry.NotRegistered):                        # a stamped layer
            registry_w.register_weekly(r.env_s, r.env_w)

    def test_append_layer_raising_on_g_leaves_h_unchanged(self):
        r = self.r.initialised()
        before = r.snapshot()
        real = registry.append_layer

        def boom(name, *a, **k):
            if name == "G":
                raise registry.NotRegistered("boom")
            return real(name, *a, **k)
        with mock.patch.object(registry, "append_layer", boom):
            with self.assertRaises(registry.NotRegistered):
                registry_w.register_weekly(r.env_s, r.env_w)
        self.assertEqual(r.snapshot(), before)

    def test_after_registration_sections_are_canonical_and_2025_is_guarded_by_the_guard(self):
        r = self.r.registered()
        for n in ("H", "G"):
            self.assertEqual(registry_w.section_hash(r.env_w, n), r.sections[n])
            registry.require(n, 2024, "season", r.env_s)
            lay = registry.load(r.env_w, n)["layers"]["weekly"]
            self.assertEqual(lay["taskFileSha256"], registry.sha_file(r.env_w.task_file))
            self.assertEqual(lay["code"].keys(), set(registry_w.WEEKLY_CODE(n)))
            registry.require(n, 2025, "weekly", r.env_w)                      # flag 17: no ConfirmationHeld any more ...
        W = swm.make_frame()
        with mock.patch.object(registry, "require", lambda *a, **k: None):
            with self.assertRaises(registry.ConfirmationHeld):                # ... the guard holds 2025
                weekly_models.fold_w(W.frame, 2025, W.store, "H", swm.small_spec_w("H"), W.rel, W.hist)

    def _deps(self, meta_gen, load_cache=None, **over):
        r = self.r
        c = lambda n: os.path.join(r.d, "copies", n)
        kw = dict(anchor="ANCHOR", load_meta=lambda: {"generatedAt": meta_gen}, load_benchw_meta=lambda: {"panelGeneratedAt": "ANCHOR", "checks": {k: {"pass": True} for k in ("c2", "c3", "c6")}},
                  load_cache=load_cache or (lambda: (_ for _ in ()).throw(AssertionError("loaded"))), inputs_path=c("weekly-inputs.pkl"), inputs_sha=registry.sha_file(c("weekly-inputs.pkl")),
                  prior_path=c("season-prior.jsonl"), prior_sha=registry.sha_file(c("season-prior.jsonl")), env=r.env_s, env_w=r.env_w, section_sha=None, s2b1a_artifact=None)
        kw.update(over)
        return rwm.Deps(**kw)

    def test_runner_register_checks_the_anchor_first(self):
        r = self.r.initialised()
        before = r.snapshot()
        self.assertEqual(rwm.main(["--register-weekly"], deps=self._deps("OTHER")), 2)
        self.assertEqual(r.snapshot(), before)
        self.assertEqual(rwm.main(["--register-weekly"], deps=self._deps("ANCHOR")), 0)    # with a matching anchor it changes both files
        after = r.snapshot()
        self.assertTrue(all(after[n] != before[n] for n in ("H", "G")))

    def test_runner_dev_unregistered_returns_2_without_a_run_log_entry(self):
        r = self.r.initialised()
        for T in (2019, 2020):                                               # the season layer is stamped; the weekly layer is not
            pass
        self.assertEqual(rwm.main(["--dev", "--write"], deps=self._deps("ANCHOR")), 2)
        self.assertFalse(os.path.exists(r.env_w.runlog))


class TestRunnerEndToEnd(unittest.TestCase):
    """The runner parts of T-B-10 and T-B-11 and the single-use rule of T-B-13, on one shared `--dev --write` run (about two minutes the first time)."""

    @classmethod
    def setUpClass(cls):
        cls.dev = e2e_w.dev_run()

    def setUp(self):
        self.assertEqual(int(e2e_w.build()["benchw"]["S"].max()), e2e_w.L + 1, "Fact: benchw has S = L + 1 rows")

    def test_dev_ran_and_no_held_row_reached_a_fit_a_frame_or_a_metric(self):
        self.assertEqual(self.dev["rc"], 0)
        calls = self.dev["rec"].calls
        self.assertEqual({n for n, _ in calls}, {"weekly_forecasts", "fit_w", "labels"})
        self.assertLessEqual(max(s for _, s in calls), e2e_w.L)

    def test_run_log_and_folds(self):
        entries = registry.runlog_entries(self.dev["deps"].env_w)
        self.assertEqual([e["mode"] for e in entries], ["weekly-dev"])
        self.assertEqual(entries[0]["folds"], [2019, 2020, 2021])
        self.assertTrue(all(entries[0]["threads"][v] == "1" for v in rwm.THREAD_VARS))

    def test_fits_file_sha_and_artifact(self):
        out = self.dev["out"]
        art = json.load(open(os.path.join(out, "2026-01-01-learned-s2b1b-dev-panel.json")))
        self.assertEqual(art["sha256"]["weekly-fits.pkl"], registry.sha_file(os.path.join(out, "weekly-fits.pkl")))
        self.assertEqual(art["sha256"]["weekly-preds.jsonl"], registry.sha_file(os.path.join(out, "weekly-preds.jsonl")))
        with open(os.path.join(out, "weekly-fits.pkl"), "rb") as f:             # our own file, SHA-recorded above
            fits = pickle.load(f)
        self.assertEqual(sorted(fits), [(c, T) for c in ("g", "h") for T in (2019, 2020, 2021)])
        for (c, T), fit in fits.items():
            self.assertEqual((fit.name.lower(), fit.T, sorted(fit.pos)), (c, T, ["QB", "RB", "TE", "WR"]))
            self.assertEqual(fit.specSha256, registry.spec_sha(e2e_w.weekly_spec(fit.name)))
        self.assertEqual(art["folds"], [2019, 2020, 2021])
        self.assertEqual(art["confirmation"], evaluate_w.UNCONFIRMED_W)
        self.assertLess(os.path.getsize(os.path.join(out, "2026-01-01-learned-s2b1b-dev-panel.json")), rwm.ARTIFACT_LIMIT)

    def test_verdict_holds_hashes_and_the_rule_and_no_commit_id(self):
        text = open(os.path.join(self.dev["out"], "2026-01-01-learned-s2b1b-dev-verdict.md"), encoding="utf-8").read()
        self.assertIn(report_s2b.RULE_TEXT, text)
        self.assertIn("2026-11-16", text)
        self.assertIn("codeSha256", text)
        self.assertIn("harnessSha256", text)
        self.assertIn(report.PREREG_HASH, text)
        short = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE, capture_output=True, text=True).stdout.strip()
        self.assertTrue(short)
        self.assertNotIn(short, text)
        self.assertNotIn("code commit", text.lower())
        self.assertIn("report-only", text)

    def test_rule_text_is_item_1_of_the_2b1a_ruling(self):
        line = [l for l in open(S2B1A, encoding="utf-8").read().splitlines() if l.startswith("> 1. ")][0]
        self.assertEqual(line[len("> 1. "):], report_s2b.RULE_TEXT)

    def test_a_second_dev_returns_2_and_adds_no_entry(self):
        with mock.patch.object(registry, "require", e2e_w.fake_require):
            self.assertEqual(rwm.main(["--dev", "--write", "--date", "2026-01-02"], deps=self.dev["deps"]), 2)
        self.assertEqual(len(registry.runlog_entries(self.dev["deps"].env_w)), 1)

    def test_a_failed_step_7_check_writes_no_weekly_dev_entry(self):
        deps = e2e_w.deps_for()
        with mock.patch.object(registry, "require", e2e_w.fake_require), mock.patch.object(wd, "LAST_SEASON", e2e_w.L), \
                mock.patch.object(rwm.weekly_h, "crosscheck", lambda f, h: {"ex": 1.0, "std": 0.0, "rec": 0.0}), \
                mock.patch.object(rwm.weekly_models, "fit_w", side_effect=AssertionError("a fit ran")):
            self.assertEqual(rwm.main(["--dev", "--write", "--resamples", "20"], deps=deps), 2)
        self.assertEqual(registry.runlog_entries(deps.env_w), [])


class TestPinsPrereg(unittest.TestCase):
    """T-B-15. Fails if a pin or the prereg check runs late."""

    def setUp(self):
        self.env = {**os.environ, **{v: "8" for v in rwm.THREAD_VARS}}
        self.assertNotEqual(self.env["OMP_NUM_THREADS"], "1", "Fact: the subprocess would start unpinned")

    def test_subprocess_import_is_pinned_before_numpy(self):
        env = self.env
        code = ("import os, run_weekly_models as r; from threadpoolctl import threadpool_info; "
                "print(*[os.environ[v] for v in r.THREAD_VARS], r._NUMPY_PRELOADED, r._SKLEARN_PRELOADED); print(*[i['num_threads'] for i in threadpool_info()])")
        r = subprocess.run([sys.executable, "-c", code], cwd=HERE, env=env, capture_output=True, text=True)
        lines = r.stdout.strip().splitlines()
        self.assertEqual(lines[0].split(), ["1", "1", "1", "1", "False", "False"], r.stderr[-500:])
        self.assertTrue(len(lines) > 1 and lines[1].split())
        self.assertEqual(set(lines[1].split()), {"1"}, lines[1])

    def test_thread_vars_and_hash_seed_copy_the_original(self):
        self.assertEqual(rwm.THREAD_VARS, rwi.THREAD_VARS)
        got = []
        for mod in (rwi, rwm):
            calls = []
            with mock.patch.dict(os.environ, {"PYTHONHASHSEED": "random"}):
                mod._ensure_hash_seed(execv=lambda exe, argv: calls.append((exe, argv, os.environ["PYTHONHASHSEED"])))
                mod._ensure_hash_seed(execv=lambda *a: calls.append("again"))
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][2], "0")
            got.append(calls[0])
        self.assertEqual(got[0], got[1])

    def test_changed_section8_returns_2_before_any_load(self):
        text = open(LP1A, encoding="utf-8").read()
        a = text.index("## 8.")
        i = text.index("the", a)
        changed = text[:i] + "tHe" + text[i + 3:]
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "lp1a.md")
            open(p, "w", encoding="utf-8").write(changed)
            self.assertNotEqual(report.prereg_hash(changed)[0], report.PREREG_HASH)
            boom = lambda *a, **k: (_ for _ in ()).throw(AssertionError("read before the prereg check"))
            for argv in (["--smoke"], ["--init-weekly"], ["--register-weekly"], ["--dev", "--write"]):
                deps = rwm.Deps(task_file=p, load_cache=boom, load_meta=boom, load_benchw_meta=boom)
                self.assertEqual(rwm.main(argv, deps=deps), 2, argv)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_task_file_is_this_file(self):
        self.assertTrue(registry_w.TASK_FILE.endswith("learned-projection-2b1b-weekly-models.md"))
        self.assertTrue(os.path.exists(registry_w.TASK_FILE))
        self.assertEqual(registry_w.weekly_env().task_file, registry_w.TASK_FILE)


class TestCachesBySha(unittest.TestCase):
    """T-B-16. Fails if a cache is used unverified, or regenerated."""

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.inp, self.pri = os.path.join(self.d, "weekly-inputs.pkl"), os.path.join(self.d, "season-prior.jsonl")
        open(self.inp, "wb").write(b"inputs")
        open(self.pri, "wb").write(b"prior")
        self.sha = (registry.sha_file(self.inp), registry.sha_file(self.pri))
        open(self.inp, "wb").write(b"inputt")                                 # one byte changed in the copy
        self.assertNotEqual(registry.sha_file(self.inp), self.sha[0], "Fact: the copy's SHA differs")

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def _deps(self):
        return rwm.Deps(load_meta=lambda: {"generatedAt": e2e_w.ss.ANCHOR}, load_benchw_meta=lambda: {"panelGeneratedAt": e2e_w.ss.ANCHOR, "checks": {k: {"pass": True} for k in ("c2", "c3", "c6")}},
                        load_cache=lambda: (_ for _ in ()).throw(AssertionError("loaded")), inputs_path=self.inp, inputs_sha=self.sha[0], prior_path=self.pri, prior_sha=self.sha[1],
                        env=registry.Env(base=self.d, repo=self.d), env_w=registry_w.weekly_env(base=self.d, repo=self.d, data_fn=lambda: {}), section_sha=None)

    def test_every_mode_returns_2_before_the_pickle_or_any_fit(self):
        for argv in (["--init-weekly"], ["--smoke"], ["--register-weekly"], ["--dev", "--write"]):
            with mock.patch.object(pd, "read_pickle", side_effect=AssertionError("read_pickle")), mock.patch.object(weekly_models, "fit_w", side_effect=AssertionError("fit")):
                self.assertEqual(rwm.main(argv, deps=self._deps()), 2, argv)

    def test_constants_equal_the_2b1a_artifact(self):
        sha = json.load(open(ARTIFACT_2B1A))["sha256"]
        self.assertEqual(rwm.INPUTS_SHA, sha["weekly-inputs.pkl"])
        self.assertEqual(rwm.PRIOR_SHA, sha["season-prior.jsonl"])
        self.assertEqual(registry_w.SECTION_SHA["H"], json.load(open(ARTIFACT_2B1A))["sha256"]["canonicalSeasonSection H"])
        self.assertEqual(registry_w.SECTION_SHA["G"], json.load(open(ARTIFACT_2B1A))["sha256"]["canonicalSeasonSection G"])

    def test_no_new_module_writes_a_cache(self):
        new = ["spec_wm", "pplays", "weekly_h", "weekly_g", "weekly_models", "registry_w", "evaluate_w", "report_s2b"]
        files = [os.path.join(HERE, "lp", n + ".py") for n in new] + [os.path.join(HERE, "run_weekly_models.py")]
        write = re.compile(r"to_pickle|pickle\.dump|open\([^)]*[\"'](w|wb|a|ab)[\"']|\.write\(|_write")
        for f in files:
            for i, line in enumerate(open(f, encoding="utf-8").read().splitlines(), 1):
                if "weekly-inputs.pkl" in line or "season-prior.jsonl" in line:
                    self.assertIsNone(write.search(line), "%s:%d writes a 2b-1a cache" % (f, i))
        text = open(os.path.join(HERE, "run_weekly_models.py"), encoding="utf-8").read()
        self.assertNotIn("run_weekly_inputs.main", text)
        self.assertNotIn("import run_weekly_inputs", text)


if __name__ == "__main__":
    unittest.main()
