"""LP-2a synthetic panels (small, deterministic, no cache): a random multi-season panel with X / teamctx / extras, and a hand-built one.
`tests/synth.py` is not edited."""
import numpy as np
import pandas as pd

from lp import asof, io, score

KEYS = ['bonus_fd_rb', 'bonus_fd_te', 'bonus_fd_wr', 'bonus_rec_te', 'bonus_rec_yd_100', 'bonus_rec_yd_200', 'bonus_rush_yd_100', 'bonus_rush_yd_200', 'fgm_20_29', 'fum_lost',
        'fum_rec_td', 'kr_yd', 'pass_2pt', 'pass_int', 'pass_td', 'pass_yd', 'pr_yd', 'rec', 'rec_2pt', 'rec_td', 'rec_yd', 'rush_2pt', 'rush_td', 'rush_yd', 'st_ff', 'st_fum_rec', 'st_td']
WEIGHTS = {"bonus_rec_te": 0.5, "bonus_rec_yd_100": 2, "bonus_rush_yd_100": 2, "pass_int": -1, "pass_2pt": 2, "st_td": 6, "rec_td": 6, "rush_td": 6, "bonus_fd_wr": 0.25,
           "rec_2pt": 2, "st_fum_rec": 1, "rec": 0.5, "fum_lost": -2, "kr_yd": 0.05, "fgm_20_29": 3, "rush_2pt": 2, "bonus_rec_yd_200": 1, "bonus_rush_yd_200": 1, "pass_yd": 0.04,
           "pass_td": 5, "rush_yd": 0.1, "pr_yd": 0.05, "fum_rec_td": 6, "rec_yd": 0.1, "bonus_fd_te": 0.25, "bonus_fd_rb": 0.25, "st_ff": 1}
RAW = io.RAW_COLS
ANCHOR = "2026-11-12T23:44:16.940Z"
TEAMS = ("AAA", "BBB", "CCC", "DDD")
SMALL_TOPN = {"QB": 3, "RB": 5, "WR": 6, "TE": 3}


def xvec(**kw):
    x = np.zeros(len(KEYS))
    for k, v in kw.items():
        x[KEYS.index(k)] = v
    return x


def pts_of(x):
    wk = list(WEIGHTS)
    return score.score([x[KEYS.index(k)] for k in wk], [WEIGHTS[k] for k in wk])


class Rows:
    """Collects table rows; `build()` returns io.Panel-like pieces and the Tables."""

    def __init__(self):
        self.weeks, self.X, self.teams, self.teamctx, self.extras, self.seasons, self.bench = [], [], [], [], [], [], []

    def week(self, pid, S, w, pos, team, played=True, x=None, raw=None, status=None, depth=None, in_universe=True, opp="ZZZ"):
        r = dict(pid=pid, S=S, w=w, position=pos, team=team, teamSource="rosterweekly", teamFirstChoice=True, noGame=False, opp=opp, home=bool(w % 2), roof="outdoors",
                 spreadLine=0.0, totalLine=44.0, status=status if status is not None else ("P" if played else "D"), played=bool(played),
                 pts=(pts_of(x) if (played and x is not None) else (0.0 if played else np.nan)), rw=[[team, "ACT"]], rwOracle=False,
                 depthOrder=depth, depthDt=None, inUniverse=in_universe, cohort=[])
        raw = raw or {}
        for c in RAW:
            r[c] = float(raw.get(c, 0.0)) if played else np.nan
        self.weeks.append(r)
        self.X.append(np.asarray(x if x is not None else np.zeros(len(KEYS)), float) if played else np.full(len(KEYS), np.nan))

    def team_week(self, team, S, w, sums=None, ctx=None):
        s = sums or {}
        self.teams.append(dict(team=team, S=S, w=w, opp="ZZZ", sum_rec_tgt=float(s.get("rec_tgt", 0)), sum_rush_att=float(s.get("rush_att", 0)), sum_pass_att=float(s.get("pass_att", 0)),
                               sum_rec_rz_tgt=float(s.get("rec_rz_tgt", 0)), sum_rush_rz_att=float(s.get("rush_rz_att", 0))))
        c = dict(team=team, S=S, w=w, off_plays=60.0, off_passPlays=35.0, off_rushPlays=25.0, off_epaSum=1.0, off_epaPlays=60.0, off_passEpaSum=2.0, off_passEpaPlays=35.0,
                 off_proePlays=60.0, off_proePassPlays=35.0, off_proeXpassSum=33.0, off_pointsScored=21.0, def_plays=60.0, def_pointsAllowed=20.0)
        c.update(ctx or {})
        self.teamctx.append(c)

    def season(self, pid, S, pos, team, gp, fp, tg=8, has=True, age=25.0, draft_year=2010, draft_round=3.0, draft_ovr=80.0, undrafted=False, off=0.6, universe=True):
        self.seasons.append(dict(pid=pid, S=S, position=pos, hasRow=has, gamesPlayed=gp, fantasyPoints=fp, team=team, teamGames=tg, age=age, draftYear=draft_year,
                                 draftRound=draft_round, draftOvr=draft_ovr, undrafted=undrafted, offPct=off, inSeasonUniverse=universe))

    def build(self):
        weeks = pd.DataFrame(self.weeks)
        weeks["rid"] = np.arange(len(weeks))
        X = np.vstack(self.X) if self.X else np.zeros((0, len(KEYS)))
        teams = pd.DataFrame(self.teams)
        teamctx = pd.DataFrame(self.teamctx)
        extras = pd.DataFrame(self.extras) if self.extras else pd.DataFrame(columns=["pid", "S", "w", "gl_att"])
        seasons = pd.DataFrame(self.seasons)
        bench = pd.DataFrame(self.bench) if self.bench else pd.DataFrame(columns=["pid", "S", "position", "b1_covered", "b1_total", "b2_ppg", "b2_total"])
        return weeks, X, teams, teamctx, extras, seasons, bench

    def tables(self):
        weeks, X, teams, teamctx, extras, seasons, bench = self.build()
        return asof.Tables(weeks, teams, seasons, bench, X=X, teamctx=teamctx, extras=extras)


def make_panel(seed=3, seasons=range(2012, 2022), W=8, per_pos=None, teams=TEAMS):
    """A random panel: every player is active from `start` to `end`, plays each week with probability p. Returns (Rows, tables, panel)."""
    rng = np.random.RandomState(seed)
    per_pos = per_pos or {"QB": 4, "RB": 7, "WR": 9, "TE": 4}
    R = Rows()
    players = []
    k = 0
    for pos, n in per_pos.items():
        for _ in range(n):
            players.append(dict(pid="%s%02d" % (pos[0], k), pos=pos, team=teams[k % len(teams)], start=int(rng.choice([2012, 2012, 2013, 2014, 2015, 2016, 2017, 2018])),
                                end=int(rng.choice([2019, 2021, 2021, 2021])), skill=float(rng.uniform(0.5, 1.5)), p=float(rng.uniform(0.6, 1.0)), age0=int(rng.randint(21, 28))))
            k += 1
    for S in seasons:
        sums = {(t, w): dict(rec_tgt=0, rush_att=0, pass_att=0, rec_rz_tgt=0, rush_rz_att=0) for t in teams for w in range(1, W + 1)}
        for pl in players:
            if not (pl["start"] <= S <= pl["end"]):
                continue
            if rng.rand() < 0.15:
                pl["team"] = teams[int(rng.randint(len(teams)))]
            gp, fp = 0, 0.0
            last = pl["team"]
            for w in range(1, W + 1):
                played = rng.rand() < pl["p"]
                if not played:
                    R.week(pl["pid"], S, w, pl["pos"], pl["team"], played=False)
                    continue
                s = pl["skill"]
                pa = ra = rt = 0
                kw = {}
                if pl["pos"] == "QB":
                    pa, ra = int(rng.poisson(30 * s)), int(rng.poisson(3))
                    kw = dict(pass_yd=7 * pa * rng.uniform(0.8, 1.2), pass_td=float(rng.poisson(0.05 * pa)), pass_int=float(rng.poisson(0.025 * pa)), rush_yd=4 * ra, rush_td=float(rng.poisson(0.03 * ra)),
                              fum_lost=float(rng.rand() < 0.05))
                else:
                    ra = int(rng.poisson(12 * s)) if pl["pos"] == "RB" else int(rng.poisson(0.3))
                    rt = int(rng.poisson({"RB": 3, "WR": 7, "TE": 5}[pl["pos"]] * s))
                    rec = int(rng.binomial(rt, 0.65))
                    kw = dict(rush_yd=4.2 * ra, rush_td=float(rng.poisson(0.03 * ra)), rec=float(rec), rec_yd=float(rec * rng.uniform(6, 13)), rec_td=float(rng.poisson(0.05 * rt)),
                              fum_lost=float(rng.rand() < 0.03), kr_yd=float(rng.rand() < 0.05) * 20)
                    if pl["pos"] == "RB":
                        kw["bonus_fd_rb"] = float(rng.poisson(0.2 * (ra + rt)))
                        kw["bonus_rush_yd_100"] = float(rng.rand() < 0.1)
                    elif pl["pos"] == "WR":
                        kw["bonus_fd_wr"] = float(rng.poisson(0.2 * rt))
                        kw["bonus_rec_yd_100"] = float(rng.rand() < 0.1)
                        kw["pr_yd"] = float(rng.rand() < 0.1) * 8
                    else:
                        kw["bonus_fd_te"] = float(rng.poisson(0.2 * rt))
                        kw["bonus_rec_te"] = float(rec)
                x = xvec(**kw)
                raw = dict(pass_att=pa, rush_att=ra, rec_tgt=rt, rec_air_yd=rt * 9, rec_rz_tgt=int(rt > 5), rush_rz_att=int(ra > 14), pass_rz_att=int(pa > 25), pass_cmp=int(pa * 0.6), pass_sack=int(pa > 20))
                R.week(pl["pid"], S, w, pl["pos"], pl["team"], played=True, x=x, raw=raw, depth=float(1 + (s < 0.8)))
                t = sums[(pl["team"], w)]
                t["rec_tgt"] += rt
                t["rush_att"] += ra
                t["pass_att"] += pa
                t["rec_rz_tgt"] += raw["rec_rz_tgt"]
                t["rush_rz_att"] += raw["rush_rz_att"]
                gp += 1
                fp += pts_of(x)
                last = pl["team"]
                R.extras.append(dict(pid=pl["pid"], S=S, w=w, gl_att=float(pa), gl_passEpa=float(pa) * 0.05, gl_cpoeAtt=float(pa) * 0.5, gl_cpoeDen=float(pa), gl_passAy=float(pa) * 8, gl_sacks=float(pa > 20),
                                      gl_rec=float(x[KEYS.index("rec")]), gl_yac=float(rt * 2), gl_carries=float(ra), gl_tgt=float(rt), gl_rushFd=float(ra // 4), gl_recFd=float(rt // 3),
                                      gl_rushEpa=0.01 * ra, gl_recEpa=0.02 * rt))
            R.season(pl["pid"], S, pl["pos"], last, gp, round(fp, 2), tg=W, has=gp > 0, age=float(pl["age0"] + S - pl["start"]), draft_year=pl["start"] - 1, draft_round=float(1 + (int(pl["pid"][1:]) % 7)),
                     draft_ovr=float(30 + 20 * (int(pl["pid"][1:]) % 7)), off=float(rng.uniform(0.4, 0.95)))
        for (t, w), s in sums.items():
            R.team_week(t, S, w, s, ctx=dict(off_pointsScored=float(rng.randint(10, 35)), off_epaSum=float(rng.normal(0, 8))))
    # bench: B2 from the two previous seasons (stratum V when both exist); B1 random
    by = {}
    for r in R.seasons:
        by[(r["pid"], r["S"])] = r
    for r in R.seasons:
        p1, p2 = by.get((r["pid"], r["S"] - 1)), by.get((r["pid"], r["S"] - 2))
        ppg = np.nan
        if p1 and p2 and p1["gamesPlayed"] + p2["gamesPlayed"] > 0:
            ppg = (p1["fantasyPoints"] + p2["fantasyPoints"]) / (p1["gamesPlayed"] + p2["gamesPlayed"])
        R.bench.append(dict(pid=r["pid"], S=r["S"], position=r["position"], b1_covered=bool(rng.rand() < 0.7), b1_total=float(rng.uniform(40, 200)), b2_ppg=ppg,
                            b2_total=ppg * W if np.isfinite(ppg) else np.nan))
    weeks, X, teams_df, teamctx, extras, seasons_df, bench = R.build()
    tables = asof.Tables(weeks, teams_df, seasons_df, bench, X=X, teamctx=teamctx, extras=extras)
    meta = {"keys": KEYS, "weights": WEIGHTS, "generatedAt": ANCHOR, "dataRev": "synthetic", "from": 2014, "to": 2021, "scoringFixture": "synthetic", "counts": {}}
    panel = io.Panel(meta, weeks, X, teams_df, seasons_df, bench)
    return R, tables, panel
