"""Synthetic panels for the as-of / split / bootstrap tests (small, deterministic, no cache needed)."""
import numpy as np
import pandas as pd

from lp import asof

RAW = ["pass_att", "pass_cmp", "rush_att", "rec_tgt", "rec_air_yd", "rec_rz_tgt", "rush_rz_att", "pass_rz_att", "pass_sack"]
TEAMS = ["AAA", "BBB", "CCC"]
POS = ["QB", "RB", "RB", "WR", "WR", "TE"]


def ti_of(team):
    return TEAMS.index(team)


def make_tables(seed=1, seasons=range(2014, 2022), weeks=6, per_team=6):
    rng = np.random.RandomState(seed)
    rows, trows, srows, brows = [], [], [], []
    pids = []
    for team in TEAMS:
        for k in range(per_team):
            pids.append(("%s%d" % (team[0], k), team, POS[k % len(POS)]))
    for S in seasons:
        for pid, team, pos in pids:
            gp = int(rng.randint(6, 17))
            srows.append(dict(pid=pid, S=S, position=pos, hasRow=True, gamesPlayed=gp, fantasyPoints=float(rng.uniform(40, 300)), team=team,
                              teamGames=16, age=float(rng.randint(22, 33)), draftYear=2012, draftRound=float(rng.randint(1, 8)), draftOvr=float(rng.randint(1, 250)),
                              undrafted=False, offPct=float(rng.uniform(0.2, 0.95)), inSeasonUniverse=True))
            brows.append(dict(pid=pid, S=S, position=pos, b1_covered=True, b1_arm="P", b1_ppg=10.0, b1_games=16, b1_total=float(rng.uniform(80, 280)), b1_noGames=False,
                              b1_ppgWeekly=10.0, b1_starterPPG=None, b1_qbChainApprox=False, b2_ppg=float(rng.uniform(5, 15)), b2_total=float(rng.uniform(80, 240))))
            for w in range(1, weeks + 1):
                played = bool(rng.rand() < 0.85)
                raw = {c: (float(rng.randint(0, 9)) if played else np.nan) for c in RAW}
                rows.append(dict(pid=pid, S=S, w=w, position=pos, team=team, teamSource="rosterweekly", noGame=False, opp=TEAMS[(ti_of(team) + 1) % 3],
                                 home=bool(w % 2), roof="outdoors", spreadLine=float(rng.randint(-7, 8)), totalLine=float(rng.randint(38, 50)),
                                 status="P" if played else "D", played=played, pts=float(rng.uniform(0, 30)) if played else np.nan,
                                 rw=[[team, "ACT"]], rwOracle=S <= 2015, depthOrder=float(rng.randint(1, 4)), depthDt=None, inUniverse=True, cohort=[], **raw))
        for team in TEAMS:
            for w in range(1, weeks + 1):
                trows.append(dict(team=team, S=S, w=w, opp="X", sum_rec_tgt=float(rng.randint(20, 40)), sum_rush_att=float(rng.randint(20, 35)),
                                  sum_pass_att=float(rng.randint(25, 45)), sum_rec_rz_tgt=3.0, sum_rush_rz_att=4.0))
    weeks_df = pd.DataFrame(rows)
    weeks_df["rid"] = np.arange(len(weeks_df))
    return asof.Tables(weeks_df, pd.DataFrame(trows), pd.DataFrame(srows), pd.DataFrame(brows))
