#!/usr/bin/env python3
"""Benchmark 4 — fetch Sleeper's historical weekly projections into the git-ignored research cache.

Standalone, standard library only. Task: .claude/tasks/learned-projection-1a-harness.md §4.6.

  GET https://api.sleeper.com/projections/nfl/<season>/<week>?season_type=regular

exactly what the app sends (src/api/sleeperStats.js), no other parameter. One request at a time, >= 1.5 s apart, a generic
User-Agent, no account / league / personal identifier. One retry after 30 s on a non-200, then stop. Each response is written
verbatim to .cache/sleeper-proj/<season>-<week>.json (an existing file is not re-fetched); the script refuses any output path
outside .cache/. It writes sleeper-proj/index.json with per-file SHA-256 and one combined SHA-256.

Season 2021 is fetched first and its coverage checked (>= 24 QB, 48 RB, 60 WR, 24 TE rows per week whose `stats` carry at
least one panel key); a shortfall STOPS the run — never add parameters or change host.

Usage: python3 research/learned-projection/fetch_sleeper_projections.py [--coverage-only]
"""
import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import date

HOST = "https://api.sleeper.com"
QUERY = "season_type=regular"
USER_AGENT = "research-script"
MIN_INTERVAL = 1.5
RETRY_WAIT = 30
COVERAGE_SEASON = 2021
COVERAGE_MIN = {"QB": 24, "RB": 48, "WR": 60, "TE": 24}
SKILL = ("QB", "RB", "WR", "TE")

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_ROOT = os.path.join(HERE, ".cache")
PROJ_DIR = os.path.join(CACHE_ROOT, "sleeper-proj")
PANEL_META = os.path.join(CACHE_ROOT, "panel", "meta.json")


class FetchStop(Exception):
    """A stop condition (§11): non-200 twice, bad shape, or the 2021 coverage check failing."""


def weeks_of(season):
    return range(1, 18) if season <= 2020 else range(1, 19)


def url_for(season, week):
    return "%s/projections/nfl/%d/%d?%s" % (HOST, season, week, QUERY)


def safe_path(name, cache_root=CACHE_ROOT):
    """Absolute path under <cache_root>/sleeper-proj/, or a refusal: nothing is ever written outside .cache/."""
    root = os.path.realpath(os.path.join(cache_root, "sleeper-proj"))
    path = os.path.realpath(os.path.join(root, name))
    if os.path.dirname(path) != root and path != root:
        raise FetchStop("refusing to write outside the cache: %r" % name)
    if not path.startswith(root + os.sep):
        raise FetchStop("refusing to write outside the cache: %r" % name)
    if not os.path.realpath(root).startswith(os.path.realpath(cache_root) + os.sep):
        raise FetchStop("cache root escapes .cache/")
    return path


def row_position(row):
    p = row.get("player")
    if isinstance(p, dict) and p.get("position"):
        return p["position"]
    return row.get("position")


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        status = getattr(resp, "status", 200)
        return status, resp.read()


def fetch_week(season, week, cache_root=CACHE_ROOT, sleep=time.sleep, state=None):
    """Writes the response verbatim; returns (path, fetched?). An existing file is not re-fetched."""
    name = "%d-%d.json" % (season, week)
    path = safe_path(name, cache_root)
    if os.path.exists(path):
        return path, False
    state = state if state is not None else {}
    last = state.get("last")
    if last is not None:
        wait = MIN_INTERVAL - (time.monotonic() - last)
        if wait > 0:
            sleep(wait)
    url = url_for(season, week)
    body = None
    for attempt in (1, 2):
        try:
            status, data = http_get(url)
        except Exception as e:  # network error counts as a failed attempt
            status, data = None, None
            err = repr(e)
        else:
            err = "HTTP %s" % status
        state["last"] = time.monotonic()
        if status == 200:
            body = data
            break
        if attempt == 1:
            sleep(RETRY_WAIT)
        else:
            raise FetchStop("%s: %s twice — stop" % (url, err))
    try:
        parsed = json.loads(body)
    except ValueError:
        raise FetchStop("%s: response is not JSON" % url)
    if not isinstance(parsed, list) or any(not isinstance(r, dict) or "player_id" not in r or "stats" not in r for r in parsed[:50]):
        raise FetchStop("%s: response shape lacks player_id/stats — stop" % url)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(body)
    return path, True


def load_panel_keys(meta_path=PANEL_META):
    with open(meta_path) as f:
        return set(json.load(f)["keys"])


def coverage(season, panel_keys, cache_root=CACHE_ROOT):
    """Per week: rows per position whose stats carry >= 1 panel key. → {week: {pos: n}}."""
    out = {}
    for w in weeks_of(season):
        with open(safe_path("%d-%d.json" % (season, w), cache_root)) as f:
            rows = json.load(f)
        counts = {p: 0 for p in SKILL}
        for r in rows:
            pos = row_position(r)
            if pos in counts and isinstance(r.get("stats"), dict) and any(k in panel_keys for k in r["stats"]):
                counts[pos] += 1
        out[w] = counts
    return out


def check_coverage(cov):
    short = []
    for w, counts in cov.items():
        for pos, need in COVERAGE_MIN.items():
            if counts[pos] < need:
                short.append("week %d %s: %d < %d" % (w, pos, counts[pos], need))
    return short


def write_index(cache_root=CACHE_ROOT):
    root = os.path.join(cache_root, "sleeper-proj")
    files, updated = {}, {}
    for name in sorted(os.listdir(root)):
        if not name.endswith(".json") or name == "index.json":
            continue
        with open(safe_path(name, cache_root), "rb") as f:
            body = f.read()
        files[name] = hashlib.sha256(body).hexdigest()
        season = int(name.split("-")[0])
        rows = json.loads(body)
        a = updated.setdefault(season, [0, 0])
        a[0] += sum(1 for r in rows if r.get("updated_at") is not None)
        a[1] += len(rows)
    combined = hashlib.sha256("\n".join("%s:%s" % (n, h) for n, h in sorted(files.items())).encode("utf-8")).hexdigest()
    index = {
        "fetchDate": date.today().isoformat(), "host": HOST, "query": QUERY, "fileCount": len(files),
        "combinedSha256": combined, "files": files,
        "updatedAtNonNullShare": {str(s): (a[0] / a[1] if a[1] else None) for s, a in sorted(updated.items())},
    }
    with open(safe_path("index.json", cache_root), "w") as f:
        json.dump(index, f, indent=1)
    return index


def run(cache_root=CACHE_ROOT, meta_path=PANEL_META, coverage_only=False, sleep=time.sleep, log=print):
    panel_keys = load_panel_keys(meta_path)
    state = {}
    # 1. the coverage season first — stop before anything else on a shortfall
    for w in weeks_of(COVERAGE_SEASON):
        fetch_week(COVERAGE_SEASON, w, cache_root, sleep, state)
    cov = coverage(COVERAGE_SEASON, panel_keys, cache_root)
    short = check_coverage(cov)
    log("2021 coverage (rows whose stats carry a panel key), min per position over weeks: %s" % json.dumps(
        {p: min(c[p] for c in cov.values()) for p in SKILL}))
    if short:
        raise FetchStop("2021 coverage check FAILED: " + "; ".join(short))
    if coverage_only:
        return {"coverage": cov, "index": None}
    # 2. the rest: 2018–2025
    for season in range(2018, 2026):
        for w in weeks_of(season):
            _, fetched = fetch_week(season, w, cache_root, sleep, state)
            if fetched:
                log("fetched %d week %d" % (season, w))
    index = write_index(cache_root)
    log("combined sha256 %s (%d files)" % (index["combinedSha256"], index["fileCount"]))
    return {"coverage": cov, "index": index}


if __name__ == "__main__":
    try:
        run(coverage_only="--coverage-only" in sys.argv)
    except FetchStop as e:
        print("[fetch] STOP: %s" % e, file=sys.stderr)
        sys.exit(3)
