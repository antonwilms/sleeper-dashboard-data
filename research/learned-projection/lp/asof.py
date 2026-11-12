"""As-of reads (task §4.5). A prediction for (S, w) has origin (S, w-1); preseason is (S, 0).

Every baseline reads `view(tables, S, n)` — filtered COPIES — never the raw tables:

  weeks     seasons < S in full; season S weeks <= n. `rw` is masked wherever `rwOracle` (2012-2015 statuses are season-level
            and reflect later-season state). Closing lines (spreadLine/totalLine) are never in it.
  teams     seasons < S; season S weeks <= n
  schedule  season-S rows with w <= n, plus rows with w > n ONLY where `inUniverse` is true. The identity (team, opp, home, roof) of an
            `inUniverse` row of a later week is taken as published. A w > n row with `inUniverse` false exists only because the player
            played that week: it must never be in a view (its mere presence, and its team/opp/home/roof, are outcomes).
  team_weeks  the season's team schedule (team, w) — ex-ante
  seasons   rows of seasons < S in full; from the S row only age, draft fields, team, teamGames
  prior     the season's B2 PPG per pid (built from S-2 and S-1 only)
  position  static 2026 capture — accepted hindsight

Report-only extras, never in a gate: `lines_for=<pid>` adds that player's week n+1 closing line (weekly layer only, n >= 1, only the
row being predicted); `oracle=True` unmasks `rw` and adds week n+1 `rw` / `depthOrder`.
"""
import numpy as np

S_ROW_COLS = ["pid", "S", "position", "team", "teamGames", "age", "draftYear", "draftRound", "draftOvr", "undrafted"]
IDENT_COLS = ["pid", "S", "w", "position", "team", "opp", "home", "roof", "inUniverse"]
LINE_COLS = ["spreadLine", "totalLine"]
OUTCOME_COLS = ["status", "played", "pts", "rw", "depthOrder", "depthDt", "cohort"] + [
    "pass_att", "pass_cmp", "rush_att", "rec_tgt", "rec_air_yd", "rec_rz_tgt", "rush_rz_att", "pass_rz_att", "pass_sack"]


class Tables:
    """The raw cache tables plus the ex-ante schedule frames derived once at load."""

    def __init__(self, weeks, teams, seasons, bench):
        self.weeks, self.teams, self.seasons, self.bench = weeks, teams, seasons, bench
        self.schedule = weeks[IDENT_COLS].copy()
        self.team_weeks = teams[["team", "S", "w"]].drop_duplicates().copy()

    @classmethod
    def from_panel(cls, panel):
        return cls(panel.weeks, panel.teams, panel.seasons, panel.bench)


class View:
    pass


def view(tables, S, n, lines_for=None, oracle=False):
    v = View()
    v.S, v.n = S, n
    w = tables.weeks
    keep = (w["S"] < S) | ((w["S"] == S) & (w["w"] <= n))
    cols = [c for c in w.columns if c not in LINE_COLS and c != "rid"] + ["rid"]
    wk = w.loc[keep, cols].copy()
    if not oracle:
        wk["rw"] = [None if o else r for o, r in zip(wk["rwOracle"], wk["rw"])]
    v.weeks = wk
    t = tables.teams
    v.teams = t.loc[(t["S"] < S) | ((t["S"] == S) & (t["w"] <= n))].copy()
    sc = tables.schedule
    v.schedule = sc.loc[(sc["S"] == S) & ((sc["w"] <= n) | sc["inUniverse"].astype(bool))].copy()
    tw = tables.team_weeks
    v.team_weeks = tw.loc[tw["S"] == S].copy()
    s = tables.seasons
    prev = s.loc[s["S"] < S].copy()
    cur = s.loc[s["S"] == S, S_ROW_COLS].copy()
    v.seasons = prev
    v.season_row = cur
    b = tables.bench
    bs = b.loc[b["S"] == S, ["pid", "S", "b2_ppg"]]
    v.prior = dict(zip(bs["pid"], bs["b2_ppg"]))
    v._lines = None
    if lines_for is not None:
        if n < 1:
            raise ValueError("closing lines are never readable at origin (S, 0)")
        r = w.loc[(w["S"] == S) & (w["w"] == n + 1) & (w["pid"] == lines_for), ["pid"] + LINE_COLS]
        v._lines = r.set_index("pid")
    if oracle:
        nxt = w.loc[(w["S"] == S) & (w["w"] == n + 1), ["pid", "rw", "depthOrder"]]
        v.next_week = nxt
    return v


def lines(v):
    """The closing line of the predicted row — only inside a `lines`-arm view; raises everywhere else."""
    if v._lines is None:
        raise PermissionError("closing line not in this view (weekly `lines` arm only, never at origin (S, 0))")
    return v._lines
