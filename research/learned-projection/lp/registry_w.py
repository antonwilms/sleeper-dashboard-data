"""LP-2b-1b (§8): registration of the weekly layer. The candidate files `candidates/<name>.json` hold the season layer (never touched here) and the
weekly layer, which `--init-weekly` writes unstamped and `--register-weekly` stamps through `registry.append_layer`. After the registration commit there
is NO re-registration path: a change to weekly code, harness, data or spec makes `registry.require(..., "weekly", ...)` raise for good."""
import json
import os

from . import registry, spec_wm, weekly_data

TASK_FILE = os.path.join(registry.REPO, ".claude", "tasks", "learned-projection-2b1b-weekly-models.md")
PANEL_DIR = os.path.join(registry.HERE, ".cache", "panel")
MODELS_DIR = os.path.join(registry.HERE, ".cache", "models")
SECTION_SHA = {"H": "572792a2214653ac6d09be5f375113160d5a157461b141c63255951cc087301c", "G": "12bd9025530022eab79bc27cafc93e94cfd7d497ee715b87f872196b01090500"}
_COMMON = ["lp/spec_w.py", "lp/weekly_data.py", "lp/season_prior.py", "lp/era_w.py"]
_TAIL = ["lp/pplays.py", "lp/weekly_models.py"]
WEEKLY_HARNESS = ["lp/evaluate_w.py", "lp/report_s2b.py", "lp/registry_w.py", "lp/registry.py", "lp/report.py", "lp/score.py", "lp/metrics.py", "lp/bootstrap.py",
                  "run_weekly_models.py"]


def WEEKLY_CODE(name):
    """The season layer's code of `name` plus the weekly modules (the H or the G point model)."""
    return registry.season_code(name) + _COMMON + [("lp/weekly_h.py" if name == "H" else "lp/weekly_g.py")] + _TAIL


# ── data and environment ────────────────────────────────────────────────────────────────────────────────────
def weekly_data_hashes(benchw=None, benchw_meta=None, inputs=None, prior=None):
    """`registry.default_data()` plus the SHA-256 of the four weekly files — a regenerated cache fails `require`. (Hashing the benchw file reads bytes
    of its 2025 rows, as 2b-1a F8 allows; nothing is parsed.)"""
    out = registry.default_data()
    out["benchwSha256"] = registry.sha_file(benchw or os.path.join(PANEL_DIR, "benchw.jsonl"))
    out["benchwMetaSha256"] = registry.sha_file(benchw_meta or os.path.join(PANEL_DIR, "benchw.meta.json"))
    out["weeklyInputsSha256"] = registry.sha_file(inputs or os.path.join(MODELS_DIR, "weekly-inputs.pkl"))
    out["seasonPriorSha256"] = registry.sha_file(prior or os.path.join(MODELS_DIR, "season-prior.jsonl"))
    return out


def weekly_env(task_file=None, data_fn=None, **kw):
    return registry.Env(task_file=task_file or TASK_FILE, data_fn=data_fn or weekly_data_hashes, **kw)


def section_hash(env, name):
    """SHA-256 of the canonical season section: `json.dumps(layers.season, indent=1, sort_keys=True)`."""
    return registry.sha_bytes(json.dumps(registry.load(env, name)["layers"]["season"], indent=1, sort_keys=True).encode("utf-8"))


def head_layer(env, name, layer):
    """`layers.<layer>` of the candidate file as COMMITTED at HEAD (its own reader: `registry._head_spec` reads the season spec only)."""
    r = registry._git(env, "show", "HEAD:./%s" % registry._rel(env, name))
    if r.returncode != 0:
        raise registry.NotRegistered("%s is not committed" % registry._rel(env, name))
    lay = (json.loads(r.stdout).get("layers") or {}).get(layer)
    if lay is None:
        raise registry.NotRegistered("%s: layer %s is not in the committed file" % (name, layer))
    return lay


def _raw(env, name):
    with open(registry.cand_path(env, name)) as f:
        return f.read()


def _restore(env, backups):
    for n, text in backups.items():
        with open(registry.cand_path(env, n), "w") as f:
            f.write(text)


def _norm(spec):
    return json.loads(json.dumps(spec, sort_keys=True))


# ── --init-weekly ───────────────────────────────────────────────────────────────────────────────────────────
def init_weekly(env, names=registry.NAMES, section_sha=None):
    """Write the unstamped weekly layer {spec: default_spec_w(name), every other STAMP_KEY null, taskFileSha256 null, reregistrations []} into each candidate
    file. Refuses when a candidate already has a `weekly` layer. When `section_sha` is given and a season section then differs from its header hash, both
    files are restored and it raises."""
    objs = {n: registry.load(env, n) for n in names}
    for n, o in objs.items():
        if "weekly" in (o.get("layers") or {}):
            raise registry.NotRegistered("%s: a weekly layer already exists" % n)
    backups = {n: _raw(env, n) for n in names}
    try:
        for n, o in objs.items():
            lay = {k: None for k in registry.STAMP_KEYS}
            lay.update({"spec": spec_wm.default_spec_w(n), "taskFileSha256": None, "reregistrations": []})
            o["layers"]["weekly"] = lay
            registry.write(env, n, o)
        if section_sha is not None:
            for n in names:
                if section_hash(env, n) != section_sha[n]:
                    raise registry.NotRegistered("%s: the season section differs from its header hash" % n)
    except BaseException:
        _restore(env, backups)
        raise
    return {n: registry.load(env, n)["layers"]["weekly"] for n in names}


# ── --register-weekly ───────────────────────────────────────────────────────────────────────────────────────
def register_weekly(env_s, env_w, names=registry.NAMES, section_sha=None):
    """Stamp the weekly layer of every candidate (H, then G), atomically: every check first, nothing written unless all pass; a raise, or a changed
    season section, restores both files and re-raises. There is no re-registration path."""
    backups = {}
    for n in names:
        backups[n] = _raw(env_w, n)
    before = {n: section_hash(env_w, n) for n in names}
    if section_sha is not None and any(before[n] != section_sha[n] for n in names):
        raise registry.NotRegistered("a season section differs from its header hash")
    runlog = registry.runlog_entries(env_w)
    if any(e.get("mode") == "weekly-dev" for e in runlog):
        raise registry.NotRegistered("the run-log holds a weekly-dev entry — registration is closed")
    for n in names:
        registry.require(n, weekly_data.LAST_SEASON, "season", env_s)
        lay = (registry.load(env_w, n).get("layers") or {}).get("weekly")
        if not lay:
            raise registry.NotRegistered("%s: no weekly layer — run --init-weekly first" % n)
        if registry.is_stamped(lay):
            raise registry.NotRegistered("%s: the weekly layer is already stamped (there is no re-registration)" % n)
        if _norm(lay["spec"]) != _norm(head_layer(env_w, n, "weekly")["spec"]):
            raise registry.NotRegistered("%s: the weekly spec differs from its HEAD version" % n)
        if _norm(lay["spec"]) != _norm(spec_wm.default_spec_w(n)):
            raise registry.NotRegistered("%s: the weekly spec differs from default_spec_w" % n)
        if lay["spec"]["lastSeason"] != weekly_data.LAST_SEASON:
            raise registry.NotRegistered("%s: spec lastSeason differs from weekly_data.LAST_SEASON" % n)
        for p in [registry._rel(env_w, n)] + WEEKLY_CODE(n) + WEEKLY_HARNESS:
            if not registry.tracked_clean(env_w, p):
                raise registry.NotRegistered("%s is not tracked and identical to HEAD" % p)
    done = {}
    try:
        for n in names:
            lay = registry.load(env_w, n)["layers"]["weekly"]
            done[n] = registry.append_layer(n, "weekly", lay["spec"], WEEKLY_CODE(n), WEEKLY_HARNESS, env_w)
        for n in names:
            if section_hash(env_w, n) != before[n]:
                raise registry.NotRegistered("%s: the season section changed during registration" % n)
    except BaseException:
        _restore(env_w, backups)
        raise
    return done
