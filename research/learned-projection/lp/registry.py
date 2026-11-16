"""LP-2a (§9): registration and locks. A candidate file `candidates/<name>.json` holds one hashed layer per forecasting layer; a layer is
STAMPED when its spec, specSha256, code, harness, data and registeredAt are all non-null. `require` raises unless the file is tracked and
identical to HEAD, the LP-1a preregHash matches, the layer is stamped and every hash recomputes. `append_layer` adds the weekly layer
without touching the season section (R1)."""
import hashlib
import json
import os
import subprocess
import sys
from datetime import date

from . import extra, report

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
NAMES = ("H", "G")
LAYERS = ("season", "weekly")
STAMP_KEYS = ("spec", "specSha256", "code", "harness", "data", "registeredAt")
EVAL_START = 2019
CONFIRM_SEASON = 2025

SEASON_CODE = ["lp/io.py", "lp/asof.py", "lp/extra.py", "lp/era.py", "lp/features.py", "lp/chain.py", "lp/MODEL.py", "lp/season_models.py", "lp/baselines.py", "lp/splits.py"]
SEASON_HARNESS = ["lp/evaluate.py", "lp/registry.py", "lp/report_s2a.py", "lp/report.py", "lp/score.py", "lp/metrics.py", "lp/bootstrap.py", "run_season_models.py"]


class NotRegistered(RuntimeError):
    pass


class ConfirmationHeld(RuntimeError):
    pass


def season_code(name):
    return [p.replace("MODEL", "model_h" if name == "H" else "model_g") for p in SEASON_CODE]


class Env:
    """Where things live; tests point it at a temporary git repository."""

    def __init__(self, base=HERE, repo=REPO, data_fn=None, prereg=None, task_file=None):
        self.base, self.repo = base, repo
        self.cand_dir = os.path.join(base, "candidates")
        self.runlog = os.path.join(base, ".cache", "models", "run-log.jsonl")
        self.data_fn = data_fn or default_data
        self.prereg = prereg or report.PREREG_HASH
        self.task_file = task_file or os.path.join(repo, ".claude", "tasks", "learned-projection-2a-season-models.md")


def default_data():
    with open(os.path.join(HERE, ".cache", "panel", "meta.json")) as f:
        meta = json.load(f)
    return {"panelGeneratedAt": meta["generatedAt"], "panelDataRev": meta["dataRev"], "gamelogs": extra.file_hashes()}


def _env(env):
    return env if env is not None else Env()


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(path):
    with open(path, "rb") as f:
        return sha_bytes(f.read())


def spec_sha(spec):
    return sha_bytes(json.dumps(spec, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def _git(env, *args):
    return subprocess.run(["git"] + list(args), cwd=env.base, capture_output=True, text=True)


def tracked_clean(env, rel):
    """True when `rel` (relative to env.base) is tracked and identical to HEAD."""
    if _git(env, "ls-files", "--error-unmatch", rel).returncode != 0:
        return False
    return _git(env, "diff", "--quiet", "HEAD", "--", rel).returncode == 0


def cand_path(env, name):
    return os.path.join(env.cand_dir, "%s.json" % name)


def _rel(env, name):
    return os.path.relpath(cand_path(env, name), env.base)


def load(env, name):
    with open(cand_path(env, name)) as f:
        return json.load(f)


def write(env, name, obj):
    with open(cand_path(env, name), "w") as f:
        f.write(json.dumps(obj, indent=1, sort_keys=True) + "\n")


def is_stamped(layer):
    return bool(layer) and all(layer.get(k) is not None for k in STAMP_KEYS)


def _versions():
    import numpy, pandas, scipy, sklearn
    return {"python": sys.version.split()[0], "requirements": {"numpy": numpy.__version__, "pandas": pandas.__version__, "scikit-learn": sklearn.__version__, "scipy": scipy.__version__}}


def stamp(spec, code_paths, harness_paths, env=None):
    """A stamped layer (without taskFileSha256 / reregistrations). Refuses unless every hashed path is tracked and identical to HEAD."""
    env = _env(env)
    for p in list(code_paths) + list(harness_paths):
        if not tracked_clean(env, p):
            raise NotRegistered("%s is not tracked and identical to HEAD" % p)
    v = _versions()
    return {"spec": spec, "specSha256": spec_sha(spec), "code": {p: sha_file(os.path.join(env.base, p)) for p in code_paths},
            "harness": {p: sha_file(os.path.join(env.base, p)) for p in harness_paths}, "data": env.data_fn(), "registeredAt": date.today().isoformat(),
            "python": v["python"], "requirements": v["requirements"]}


def runlog_entries(env):
    if not os.path.exists(env.runlog):
        return []
    with open(env.runlog) as f:
        return [json.loads(line) for line in f if line.strip()]


def runlog_append(env, entry):
    os.makedirs(os.path.dirname(env.runlog), exist_ok=True)
    with open(env.runlog, "a") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")


def _head_spec(env, name):
    r = _git(env, "show", "HEAD:./%s" % _rel(env, name))
    if r.returncode != 0:
        raise NotRegistered("%s is not committed" % _rel(env, name))
    return json.loads(r.stdout)["layers"]["season"]["spec"]


def register(env=None, names=NAMES, reregister=None):
    """`--register`: stamp the season layer of every candidate file. All checks first; nothing is written unless every file passes."""
    env = _env(env)
    now = date.today().isoformat()
    if reregister is None and any(e.get("mode") == "dev" for e in runlog_entries(env)):
        raise NotRegistered("the run-log holds a dev entry — registration is closed (--reregister needs Anton's ruling)")
    with open(env.task_file, "rb") as f:
        task_sha = sha_bytes(f.read())
    new = {}
    for name in names:
        obj = load(env, name)
        layer = obj["layers"]["season"]
        if is_stamped(layer) and reregister is None:
            raise NotRegistered("%s: season layer is already stamped" % name)
        if layer["spec"] != _head_spec(env, name):
            raise NotRegistered("%s: spec differs from its HEAD version" % name)
        s = stamp(layer["spec"], season_code(name), SEASON_HARNESS, env)
        s["taskFileSha256"] = task_sha
        prev = list(layer.get("reregistrations") or [])
        if reregister is not None and is_stamped(layer):
            prev.append({"at": now, "reason": reregister, "previous": {k: layer[k] for k in layer if k != "reregistrations"}})
        s["reregistrations"] = prev
        obj["name"], obj["preregHash"] = name, env.prereg
        obj["layers"]["season"] = s
        new[name] = obj
    for name, obj in new.items():
        write(env, name, obj)
    return new


def require(name, T, layer="season", env=None):
    """Raise NotRegistered unless candidate `name` is registered for `layer`; raise ConfirmationHeld for T >= 2025 unless both candidate
    files hold stamped season AND weekly layers. T <= 2018 needs nothing."""
    env = _env(env)
    if T < EVAL_START:
        return
    if T >= CONFIRM_SEASON:
        for n in NAMES:
            try:
                o = load(env, n)
            except (OSError, ValueError):
                raise ConfirmationHeld("candidate file %s missing — the 2025 confirmation is held" % n)
            if not all(is_stamped(o.get("layers", {}).get(l)) for l in LAYERS):
                raise ConfirmationHeld("the 2025 confirmation is held until both layers of both candidates are registered")
    rel = _rel(env, name)
    if not os.path.exists(cand_path(env, name)):
        raise NotRegistered("%s is missing" % rel)
    if not tracked_clean(env, rel):
        raise NotRegistered("%s is not tracked and identical to HEAD" % rel)
    obj = load(env, name)
    if obj.get("preregHash") != env.prereg:
        raise NotRegistered("%s: preregHash does not match the pinned LP-1a §8 hash" % name)
    lay = (obj.get("layers") or {}).get(layer)
    if not is_stamped(lay):
        raise NotRegistered("%s: layer %s is not stamped" % (name, layer))
    if spec_sha(lay["spec"]) != lay["specSha256"]:
        raise NotRegistered("%s: specSha256 does not recompute" % name)
    for group in ("code", "harness"):
        for p, h in lay[group].items():
            if not os.path.exists(os.path.join(env.base, p)) or sha_file(os.path.join(env.base, p)) != h:
                raise NotRegistered("%s: %s item %s differs from its registered hash" % (name, group, p))
    if lay["data"] != env.data_fn():
        raise NotRegistered("%s: the data hashes differ from the registered ones" % name)
    return lay


def append_layer(name, layer, spec, code_paths, harness_paths, env=None):
    """LP-2b: add a stamped `layer` to a candidate file — the `season` object stays byte-identical (never re-stamped)."""
    env = _env(env)
    obj = load(env, name)
    layers = obj["layers"]
    if not is_stamped(layers.get("season")):
        raise NotRegistered("%s: the season layer is not stamped" % name)
    if is_stamped(layers.get(layer)):
        raise NotRegistered("%s: layer %s already exists" % (name, layer))
    s = stamp(spec, code_paths, harness_paths, env)
    with open(env.task_file, "rb") as f:
        s["taskFileSha256"] = sha_bytes(f.read())
    s["reregistrations"] = []
    layers[layer] = s
    write(env, name, obj)
    return s
