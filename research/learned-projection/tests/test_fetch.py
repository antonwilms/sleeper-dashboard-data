"""T-PY-9 — fetch confinement: the Sleeper fetch writes only under .cache/sleeper-proj/, refuses outside paths, skips existing files,
sends exactly `season_type=regular` to api.sleeper.com, and stops when the 2021 coverage check fails (urllib stubbed — no network)."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import fetch_sleeper_projections as F  # noqa: E402


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status = body, status

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def rows(counts, key="rec"):
    out = []
    for pos, n in counts.items():
        for i in range(n):
            out.append({"player_id": "%s%d" % (pos, i), "player": {"position": pos}, "stats": {key: 1.0}, "updated_at": None})
    return out


GOOD = {"QB": 30, "RB": 80, "WR": 130, "TE": 65}
THIN = {"QB": 30, "RB": 80, "WR": 130, "TE": 5}


class FetchConfinement(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cache = os.path.join(self.tmp, ".cache")
        self.meta = os.path.join(self.tmp, "meta.json")
        with open(self.meta, "w") as f:
            json.dump({"keys": ["rec"]}, f)
        self.calls = []

    def urlopen(self, counts_by_season=None):
        def f(req, timeout=None):
            self.calls.append(req)
            u = urlparse(req.full_url)
            season = int(u.path.split("/")[-2])
            return Resp(json.dumps(rows((counts_by_season or {}).get(season, GOOD))).encode())
        return f

    def run_fetch(self, **kw):
        with mock.patch("urllib.request.urlopen", self.urlopen(kw.pop("counts", None))), mock.patch("time.monotonic", return_value=0.0):
            return F.run(cache_root=self.cache, meta_path=self.meta, sleep=lambda s: None, log=lambda m: None, **kw)

    def test_py9_confinement_and_request_shape(self):
        out = self.run_fetch()
        self.assertEqual(len(self.calls), 141)                                  # 2018-2020: 17 weeks, 2021-2025: 18 weeks
        for req in self.calls:
            u = urlparse(req.full_url)
            self.assertEqual((u.scheme, u.netloc), ("https", "api.sleeper.com"))
            self.assertEqual(parse_qs(u.query), {"season_type": ["regular"]}, "exactly one parameter")
            self.assertTrue(u.path.startswith("/projections/nfl/"))
            self.assertEqual(req.get_header("User-agent"), "research-script")
        written = [os.path.relpath(os.path.join(d, f), self.tmp) for d, _, fs in os.walk(self.tmp) for f in fs]
        self.assertTrue(all(w.startswith(os.path.join(".cache", "sleeper-proj")) or w == "meta.json" for w in written), written)
        self.assertEqual(out["index"]["fileCount"], 141)
        # a second run skips every existing file (no request at all)
        self.calls.clear()
        self.run_fetch()
        self.assertEqual(self.calls, [])

    def test_py9_refuses_outside_paths(self):
        for bad in ("../x.json", "/etc/passwd", "a/../../b.json", "../.cache2/x.json"):
            with self.assertRaises(F.FetchStop, msg=bad):
                F.safe_path(bad, self.cache)
        self.assertTrue(F.safe_path("2021-1.json", self.cache).startswith(os.path.realpath(self.cache)))

    def test_py9_stops_when_2021_coverage_fails(self):
        with self.assertRaises(F.FetchStop) as cm:
            self.run_fetch(counts={2021: THIN})
        self.assertIn("coverage", str(cm.exception))
        self.assertEqual(len(self.calls), 18, "nothing but the 2021 season was requested before the stop")
        seasons = {int(urlparse(r.full_url).path.split("/")[-2]) for r in self.calls}
        self.assertEqual(seasons, {2021})

    def test_py9_non_200_twice_stops(self):
        def bad(req, timeout=None):
            self.calls.append(req)
            return Resp(b"x", status=503)
        sleeps = []
        with mock.patch("urllib.request.urlopen", bad), mock.patch("time.monotonic", return_value=0.0):
            with self.assertRaises(F.FetchStop):
                F.run(cache_root=self.cache, meta_path=self.meta, sleep=sleeps.append, log=lambda m: None)
        self.assertEqual(len(self.calls), 2)
        self.assertIn(30, sleeps)


if __name__ == "__main__":
    unittest.main()
