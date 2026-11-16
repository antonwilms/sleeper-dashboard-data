"""LP-2a: T-M-10 (registration), T-M-11 (held confirmation, append), T-M-14 (prereg pin). Every repository here is a temporary git repo."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import run_season_models
from lp import extra, io, registry, report, season_models, splits
from tests import synth_season as ss

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
LP1A = os.path.join(REPO, ".claude", "tasks", "learned-projection-1a-harness.md")
WEEKLY_CODE = ["lp/weekly_x.py"]
WEEKLY_HARNESS = ["lp/weekly_h.py"]


def git(d, *a):
    r = subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t"] + list(a), cwd=d, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r


class Repo:
    def __init__(self):
        self.d = tempfile.mkdtemp()
        git(self.d, "init", "-q")
        self.data = {"panelGeneratedAt": "g", "panelDataRev": "r", "gamelogs": {"2012": "x"}}
        files = set(registry.season_code("H") + registry.season_code("G") + registry.SEASON_HARNESS + WEEKLY_CODE + WEEKLY_HARNESS)
        for p in sorted(files):
            self.write(p, "# %s\n" % p)
        os.makedirs(os.path.join(self.d, "candidates"))
        for n in ("H", "G"):
            obj = {"name": n, "preregHash": None, "layers": {"season": {"spec": {"name": n, "k": [1, 2]}, "specSha256": None, "code": None, "harness": None, "data": None,
                                                                          "taskFileSha256": None, "registeredAt": None, "python": None, "requirements": None, "reregistrations": []}}}
            self.write("candidates/%s.json" % n, json.dumps(obj, indent=1, sort_keys=True) + "\n")
        self.write("task.md", "task\n")
        self.env = registry.Env(base=self.d, repo=self.d, data_fn=lambda: dict(self.data), prereg="PREREG", task_file=os.path.join(self.d, "task.md"))
        self.commit("c1")

    def write(self, rel, text):
        p = os.path.join(self.d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)

    def commit(self, msg):
        git(self.d, "add", "-A")
        git(self.d, "commit", "-q", "-m", msg, "--allow-empty")

    def registered(self):
        registry.register(self.env)
        self.commit("register")
        return self

    def close(self):
        shutil.rmtree(self.d, ignore_errors=True)


class TestRegistration(unittest.TestCase):
    """T-M-10. Fails if a test-fold fit can start unregistered."""

    def setUp(self):
        self.r = Repo()

    def tearDown(self):
        self.r.close()

    def _raises(self, layer="season", T=2019, name="H"):
        with self.assertRaises(registry.NotRegistered):
            registry.require(name, T, layer, self.r.env)

    def test_unstamped_missing_untracked_modified(self):
        r = self.r
        self._raises()                                                       # unstamped
        r.registered()
        self.assertTrue(registry.require("H", 2019, "season", r.env))      # passes when clean
        registry.require("H", 2018, "season", registry.Env(base=r.d, repo=r.d, data_fn=lambda: {"x": 1}, prereg="no"))     # T = 2018 needs nothing
        os.remove(os.path.join(r.d, "candidates", "H.json"))
        self._raises()                                                       # missing
        git(r.d, "checkout", "--", "candidates/H.json")
        git(r.d, "rm", "-q", "--cached", "candidates/H.json")
        self._raises()                                                       # untracked
        git(r.d, "add", "candidates/H.json")
        with open(os.path.join(r.d, "candidates", "H.json")) as f:
            txt = f.read()
        r.write("candidates/H.json", txt + "\n")
        self._raises()                                                       # modified, not committed

    def test_stale_hashes(self):
        r = self.r.registered()
        env = r.env
        env.prereg = "OTHER"
        self._raises()
        env.prereg = "PREREG"
        registry.require("H", 2019, "season", env)
        r.data["panelDataRev"] = "new"
        self._raises()
        r.data["panelDataRev"] = "r"
        for rel in ("lp/era.py", "lp/evaluate.py"):                       # a code item, then a harness item, committed and stale
            r.write(rel, "# changed\n")
            r.commit("edit " + rel)
            self._raises()
            git(r.d, "revert", "--no-edit", "HEAD")
            registry.require("H", 2019, "season", env)
        with open(os.path.join(r.d, "candidates", "H.json")) as f:
            obj = json.load(f)
        obj["layers"]["season"]["spec"]["k"] = [9]
        r.write("candidates/H.json", json.dumps(obj, indent=1, sort_keys=True) + "\n")
        r.commit("spec edit")
        self._raises()                                                       # specSha256 no longer recomputes

    def test_weekly_layer_checks(self):
        r = self.r.registered()
        registry.append_layer("H", "weekly", {"w": 1}, WEEKLY_CODE, WEEKLY_HARNESS, r.env)
        r.commit("weekly")
        registry.require("H", 2019, "weekly", r.env)
        self._raises("weekly", name="G")                                     # G has no weekly layer
        r.write("lp/weekly_h.py", "# changed\n")
        r.commit("edit")
        self._raises("weekly")
        git(r.d, "revert", "--no-edit", "HEAD")
        registry.require("H", 2019, "weekly", r.env)
        r.data["gamelogs"] = {"2012": "y"}
        self._raises("weekly")

    def test_fold_unregistered_raises_before_any_fit(self):
        with self.assertRaises(registry.NotRegistered):
            season_models.fold(None, "H", {"k": 1}, 2019, self.r.env)       # a store of None proves nothing was touched

    def test_register_refusals(self):
        r = self.r
        env = r.env
        r.write("lp/io.py", "# dirty\n")                                     # a hashed path that differs from HEAD
        with self.assertRaises(registry.NotRegistered):
            registry.register(env)
        git(r.d, "checkout", "--", "lp/io.py")
        with open(os.path.join(r.d, "candidates", "H.json")) as f:           # a spec that differs from HEAD
            obj = json.load(f)
        obj["layers"]["season"]["spec"]["k"] = [7]
        r.write("candidates/H.json", json.dumps(obj, indent=1, sort_keys=True) + "\n")
        with self.assertRaises(registry.NotRegistered):
            registry.register(env)
        git(r.d, "checkout", "--", "candidates/H.json")
        registry.runlog_append(env, {"mode": "dev"})                         # a dev run-log entry closes registration
        with self.assertRaises(registry.NotRegistered):
            registry.register(env)
        os.remove(env.runlog)
        registry.register(env)
        r.commit("register")
        with self.assertRaises(registry.NotRegistered):                      # already stamped
            registry.register(env)
        registry.register(env, reregister="test")                           # --reregister: appended, not refused
        self.assertEqual(len(registry.load(env, "H")["layers"]["season"]["reregistrations"]), 1)

    def test_dev_unregistered_leaves_no_run_log(self):
        R, t, panel = ss.make_panel()
        with mock.patch.object(io, "load_cache", lambda: panel), mock.patch.object(io, "load_teamctx", lambda: t.teamctx), \
                mock.patch.object(extra, "build_extras", lambda: t.extras):
            rc = run_season_models.main(["--dev"], env=self.r.env)
        self.assertEqual(rc, 2)
        self.assertFalse(os.path.exists(self.r.env.runlog))


class TestHeldConfirmation(unittest.TestCase):
    """T-M-11. Fails if 2025 can run in this slice or the append rewrites the season section."""

    def setUp(self):
        self.r = Repo().registered()

    def tearDown(self):
        self.r.close()

    def test_2025_is_held_until_both_layers_of_both_candidates(self):
        r, env = self.r, self.r.env
        for T in (2025, 2026):
            with self.assertRaises(registry.ConfirmationHeld):
                registry.require("H", T, "season", env)
        registry.append_layer("H", "weekly", {"w": 1}, WEEKLY_CODE, WEEKLY_HARNESS, env)
        r.commit("H weekly")
        with self.assertRaises(registry.ConfirmationHeld):                   # one candidate only
            registry.require("H", 2025, "season", env)
        registry.append_layer("G", "weekly", {"w": 1}, WEEKLY_CODE, WEEKLY_HARNESS, env)
        r.commit("G weekly")
        for n in ("H", "G"):
            registry.require(n, 2025, "season", env)
            registry.require(n, 2025, "weekly", env)

    def test_dev_never_requests_2025(self):
        self.assertEqual(max(splits.DEV_FOLDS), 2024)
        seen = []

        def fake(name, T, layer="season", env=None):
            seen.append((name, T))
            if T == 2024:
                raise registry.NotRegistered("stop")
            return {"spec": {}}
        R, t, panel = ss.make_panel()
        with mock.patch.object(io, "load_cache", lambda: panel), mock.patch.object(io, "load_teamctx", lambda: t.teamctx), \
                mock.patch.object(extra, "build_extras", lambda: t.extras), mock.patch.object(registry, "require", fake):
            self.assertEqual(run_season_models.main(["--dev"], env=self.r.env), 2)
        self.assertEqual([T for n, T in seen if n == "H"], list(range(2019, 2025)))
        self.assertNotIn(2025, [T for _n, T in seen])

    def test_append_leaves_the_season_section_byte_identical(self):
        r, env = self.r, self.r.env
        before = json.dumps(registry.load(env, "H")["layers"]["season"], indent=1, sort_keys=True)
        r.write("lp/era.py", "# a season-hashed file, changed and committed\n")
        r.commit("season file edit")
        with self.assertRaises(registry.NotRegistered):
            registry.require("H", 2019, "season", env)                       # the season layer no longer verifies ...
        registry.append_layer("H", "weekly", {"w": 1}, WEEKLY_CODE + ["lp/era.py"], WEEKLY_HARNESS, env)     # ... and the weekly layer hashes the new file
        after = json.dumps(registry.load(env, "H")["layers"]["season"], indent=1, sort_keys=True)
        self.assertEqual(before, after)
        self.assertIn("lp/era.py", registry.load(env, "H")["layers"]["weekly"]["code"])
        with self.assertRaises(registry.NotRegistered):                      # an existing weekly layer is refused
            registry.append_layer("H", "weekly", {"w": 1}, WEEKLY_CODE, WEEKLY_HARNESS, env)

    def test_append_refuses_unstamped_season(self):
        r = Repo()
        try:
            with self.assertRaises(registry.NotRegistered):
                registry.append_layer("H", "weekly", {"w": 1}, WEEKLY_CODE, WEEKLY_HARNESS, r.env)
        finally:
            r.close()


class TestPreregPin(unittest.TestCase):
    """T-M-14. Fails if the check is missing or runs after the load."""

    def test_changed_section8_returns_2_before_the_load(self):
        with open(LP1A, encoding="utf-8") as f:
            text = f.read()
        a = text.index("## 8.")
        i = text.index("the", a)
        changed = text[:i] + "tHe" + text[i + 3:]
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "lp1a.md")
            with open(p, "w", encoding="utf-8") as f:
                f.write(changed)
            self.assertNotEqual(report.prereg_hash(changed)[0], report.PREREG_HASH)
            with mock.patch.object(io, "load_cache", side_effect=AssertionError("the cache was read before the prereg check")):
                self.assertEqual(run_season_models.main(["--smoke"], task_file=p), 2)
            self.assertEqual(report.prereg_hash(text)[0], report.PREREG_HASH)
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
