"""LP-2a: the machine-readable spec of a candidate (§5.6-§8). `default_spec(name)` builds it ONCE, to be written into
`candidates/<name>.json`; every other module reads these keys from the registered file and from nowhere else."""
import copy

POSITIONS = ("QB", "RB", "WR", "TE")
OPPS = ("pass_att", "rush_att", "rec_tgt")

TARGETS = {
    "QB": [("pass_att", "pg", None), ("rush_att", "pg", None), ("pass_yd", "po", ["pass_att"]), ("pass_td", "po", ["pass_att"]), ("pass_int", "po", ["pass_att"]),
           ("rush_yd", "po", ["rush_att"]), ("rush_td", "po", ["rush_att"]), ("fum_lost", "pg", None)],
    "RB": [("rush_att", "pg", None), ("rec_tgt", "pg", None), ("rush_yd", "po", ["rush_att"]), ("rush_td", "po", ["rush_att"]), ("rec", "po", ["rec_tgt"]),
           ("rec_yd", "po", ["rec_tgt"]), ("rec_td", "po", ["rec_tgt"]), ("bonus_fd_rb", "po", ["rush_att", "rec_tgt"]), ("kr_yd", "pg", None),
           ("bonus_rush_yd_100", "pg", None), ("fum_lost", "pg", None)],
    "WR": [("rec_tgt", "pg", None), ("rec", "po", ["rec_tgt"]), ("rec_yd", "po", ["rec_tgt"]), ("rec_td", "po", ["rec_tgt"]), ("bonus_fd_wr", "po", ["rec_tgt"]),
           ("kr_yd", "pg", None), ("pr_yd", "pg", None), ("bonus_rec_yd_100", "pg", None), ("rush_yd", "pg", None)],
    "TE": [("rec_tgt", "pg", None), ("rec", "po", ["rec_tgt"]), ("rec_yd", "po", ["rec_tgt"]), ("rec_td", "po", ["rec_tgt"]), ("bonus_rec_te", "po", ["rec_tgt"]),
           ("bonus_fd_te", "po", ["rec_tgt"])],
}


def targets_spec():
    out = {}
    for pos, lst in TARGETS.items():
        rows = []
        for name, kind, den in lst:
            t = {"name": name, "kind": kind}
            if den:
                t["den"] = den
            if kind == "pg" and name in OPPS:
                t["role"] = "opp"
            rows.append(t)
        rows.append({"name": "gamesShare", "kind": "raw", "role": "share"})
        out[pos] = rows
    return out


def _m(kind, q=None, lag=None, P=None, src=None):
    d = {"kind": kind, "q": q, "lag": lag, "P": P}
    if src is not None:
        d["src"] = src
    return d


def features_spec():
    tg = targets_spec()
    hist = {}
    for pos in POSITIONS:
        d = {}
        opps = {t["name"] for t in tg[pos] if t.get("role") == "opp"}
        for l in (1, 2, 3):
            d["g%d" % l] = _m("raw", lag=l, src=["col", "g"])
            d["gs%d" % l] = _m("raw", lag=l)
            for o in OPPS:
                d["%s%d" % (o, l)] = _m("pg" if o in opps else "raw", o if o in opps else None, l, src=["pg", o])
            for t in tg[pos]:
                if t.get("role") in ("opp", "share"):
                    continue
                src = ["po", t["name"], t["den"]] if t["kind"] == "po" else ["pg", t["name"]]
                d["%s%d" % (t["name"], l)] = _m(t["kind"], t["name"], l, src=src)
            d["ppg%d" % l] = _m("pg", "ppg", l, src=["ppg"])
            for sh in ("tgtShare", "rushShare", "rzShare", "airShare"):
                d["%s%d" % (sh, l)] = _m("raw", lag=l, src=["col", sh])
            d["adot%d" % l] = _m("raw", lag=l, src=["ratio", "rec_air_yd", "rec_tgt"])
            d["racr%d" % l] = _m("raw", lag=l, src=["ratio", "rec_yd", "rec_air_yd"])
            if l <= 2:
                d["offPct%d" % l] = _m("raw", lag=l)
        d["late1"] = _m("raw", lag=1)
        d["tdPts1"] = _m("raw", lag=1)
        hist[pos] = d
    dur = {"*": {"gs1": _m("raw", lag=1), "gs2": _m("raw", lag=2), "gs3": _m("raw", lag=3), "trailOut1": _m("raw", lag=1), "dWeeks1": _m("raw", lag=1)}}
    bio = {"*": {n: _m("raw") for n in ("age", "age2", "exp", "isRookie", "draftRound", "logOvr", "undrafted", "isRookieLogOvr", "expLe1LogOvr")}}
    role = {"*": {"depthEnd1": _m("raw", lag=1), "posRank1": _m("raw", lag=1), "compOpp": _m("pg", "oppoPg", 1), "compTop": _m("pg", "oppoPg", 1)}}
    team = {"*": {n: _m("raw", lag=1) for n in ("teamChange", "tmPassPg", "tmRushPg", "tmPtsPg", "tmEpaPlay", "tmPassEpaPlay", "tmProe", "vacTgt", "vacRush", "qbNew")}}
    team["*"]["qbYpa1"] = _m("po", "pass_yd", 1, P="QB")
    team["*"]["qbTdRate1"] = _m("po", "pass_td", 1, P="QB")
    team["*"]["qbAttPg1"] = _m("pg", "pass_att", 1, P="QB")
    gl = {"*": {}}
    for l in (1, 2):
        for n in ("passEpaAtt", "cpoe", "sackRate", "passAyAtt", "yacRec", "rushFdAtt", "recFdTgt", "rushEpaAtt", "recEpaTgt"):
            gl["*"]["%s%d" % (n, l)] = _m("raw", lag=l)
    return {"hist": hist, "dur": dur, "bio": bio, "role": role, "team": team, "gl": gl}


def default_spec(name):
    if name not in ("H", "G"):
        raise ValueError(name)
    grid = []
    if name == "H":
        for era in ("E1", "E0"):
            for lam in (0.0, 0.1, 0.2, 0.35):
                grid.append({"era": era, "lam": lam})
    else:
        for era in ("E1", "E0"):
            for lam in (0.0, 0.2):
                for g in ("g1", "g2", "g3", "g4"):
                    grid.append({"era": era, "lam": lam, "g": g})
    return {
        "name": name,
        "features": features_spec(),
        "desc": {"groups": ["bio", "role", "team", "gl"], "extra": ["gs1", "gs2", "trailOut1", "offPct1"]},
        "targets": targets_spec(),
        "topN": {"QB": 32, "RB": 64, "WR": 96, "TE": 32},
        "grid": grid,
        "alphas": [1, 10, 100, 1000] if name == "H" else None,
        "kMult": [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10] if name == "H" else None,
        "deltas": [0.5, 0.65, 0.8, 0.9, 1.0] if name == "H" else None,
        "gPoints": None if name == "H" else {"g1": [0.05, 100, 4, 20, 1.0], "g2": [0.05, 200, 4, 20, 1.0], "g3": [0.05, 200, 8, 20, 1.0], "g4": [0.03, 300, 6, 40, 10.0]},
        "gPointsOrder": None if name == "H" else ["learning_rate", "max_iter", "max_leaf_nodes", "min_samples_leaf", "l2_regularization"],
        "losses": None if name == "H" else {"yardage": "squared_error", "gamesShare": "squared_error", "other": "poisson"},
        "calibMinRows": 30,
        "seed": 0,
    }


def small_spec(name, topN=None):
    """Test helper: the default spec with small top-N cuts for tiny synthetic panels."""
    s = copy.deepcopy(default_spec(name))
    if topN:
        s["topN"] = topN
    return s
