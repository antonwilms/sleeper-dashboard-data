"""LP-2b-1a (§5, §10, §11): the names of the weekly inputs. `inputs_spec()` lists, per feature group, the column names `weekly_data.inputs_at`
emits, plus the target columns, the prior columns and the three constants (`trainFrom`, `gRecDecay`, `eraN0`). Not hashed (like `spec.py`).
The held-season boundary is NOT here: `weekly_data.LAST_SEASON` is its single source."""
from . import spec as spec_mod

POSITIONS = spec_mod.POSITIONS
IDENTITY = ["pid", "S", "w", "position", "team", "opp"]
TRAIN_FROM = 2018
G_REC_DECAY = 0.7
ERA_N0 = 4

AVAIL = ["playedPrev", "runP", "runN", "wkSince", "prevD", "prevX", "prevNone", "rwPrev_ACT", "rwPrev_INA", "rwPrev_RES", "rwPrev_PUP", "rwPrev_other",
         "depthPrev", "depthChg", "gsStd", "gsPrev", "first"]
USAGE = ["tgtSh", "rushSh", "rzSh", "airSh", "oppoPg", "tgtSh3", "rushSh3", "rzSh3", "oppoPg3"]
ABSENCE = ["vacShare", "retShare", "qbOut"]
OPP = ["oEpa", "oPassEpa", "oRushEpa", "oSucc", "oRzTd", "oPtsPg", "oG", "oEpa1", "oPassEpa1", "oRushEpa1", "oSucc1", "oRzTd1", "oPtsPg1"]
TEAM = ["tPassPg", "tRushPg", "tPtsPg", "tEpa", "tProe"]
GAME = ["home", "dome"]
GL = ["passEpaAtt", "cpoe", "rushEpaAtt", "recEpaTgt", "rushFdAtt", "recFdTgt", "yacRec"]
BIO = ["age", "exp", "isRookie"]


def targets_by_pos():
    """{position: [weekly target names]} — the season targets of 2a §7.1 except `gamesShare`, in the spec's order."""
    return {p: [t["name"] for t in rows if t["name"] != "gamesShare"] for p, rows in spec_mod.targets_spec().items()}


def union_targets():
    out = []
    for p in POSITIONS:
        for t in targets_by_pos()[p]:
            if t not in out:
                out.append(t)
    return out


def inputs_spec():
    ts = union_targets()
    groups = {
        "form": [f % t for t in ts for f in ("ex_%s", "std_%s", "rec_%s")] + ["nP", "wk"],
        "usage": list(USAGE), "avail": list(AVAIL), "absence": list(ABSENCE), "opp": list(OPP), "team": list(TEAM), "game": list(GAME), "gl": list(GL), "bio": list(BIO),
    }
    prior = ["pr_%s" % t for t in ts] + ["pr_gamesShare", "noPrior"] + ["dstd_%s" % t for t in ts] + ["drec_%s" % t for t in ts]
    groups["prior"] = prior
    return {"trainFrom": TRAIN_FROM, "gRecDecay": G_REC_DECAY, "eraN0": ERA_N0, "identity": list(IDENTITY), "targets": ts, "targetsByPos": targets_by_pos(),
            "groups": groups, "targetCols": ["r_%s" % t for t in ts] + ["e_%s" % t for t in ts] + ["played", "pts"], "priorCols": prior}


def feature_names(spec_w):
    """Every non-prior feature name, in group order."""
    out = []
    for g, names in spec_w["groups"].items():
        if g != "prior":
            out += names
    return out
