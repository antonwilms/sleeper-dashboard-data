# App-repo backlog — asks discovered from the data side

Work that belongs in `sleeper-dashboard`, found by a session scoped to this repo (which cannot write the app). Add a line in the same change, with the commit that found it and whether it blocks; flag it in the hand-back. Strike through and note the app commit when done.

## Open

### Name-only matchers miss nickname and short-form name variants
**Found:** computed-stats-verification (app `66ab1b7`, report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium — three matchers, one shared alias idea

V3 (top 400 KTC): `ktcMatch.js` leaves 5 players unmatched — D.J. Moore (rank 100; KTC `D.J.` normalises to `d j moore`, Sleeper `DJ Moore` to `dj moore`), Kenneth Gainwell (195; Sleeper `Kenny`), Chigoziem Okonkwo (228; `Chig`), Matthew Hibner (311; `Matt`), Travis Hunter (234; no skill-position Sleeper entry under that name). `collegeMatch.js` returns no seasons (`college-none`) for several more because CFBD spells the name differently (20 `college-none` rows in all; the rest are in the data-repo entry D-78 or unexamined): Cam Skattebo (72; `Cameron`), KC Concepcion (69; `Kevin`), Bucky Irving (57; `Mar'Keise`), Isiah Pacheco (307; `Isaih`), Tutu Atwell (357; `Chatarius`), Joshua Palmer (280; also the one `draft-missing/name-not-found`, pick name differs) and others in the report. Fix sites: `ktcMatch.js:47` `normalizeName` (private), `collegeMatch.js:11` `normalizeName`, `nflDraftMatch.js` (uses the college one). `nflverse/playerids.json` carries `ktcId`/`cfbrefId` for a crosswalk-based join if aliasing is not enough.

### Same-name, different-person: KTC takes the first candidate, college attaches the wrong player's seasons
**Found:** computed-stats-verification (app `66ab1b7`, report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** yes · **Size:** medium

V3: `ktcMatch.js:108` takes `ids[0]` of a name|position key with several Sleeper candidates — Kyle Williams (rank 241, three candidates `638`, `7437`, `12547`) resolves to the first, whose college seasons then end after its 2010 draft year. `collegeMatch.js` `resolveCandidate` returns a lone Sleeper candidate on name alone (collegeMatch.js:136), so another player's CFBD seasons are attached: `college-after-draft` for Caleb Williams (rank 11; seasons 2021–2023 and 2025, drafted 2024), A.J. Brown (78), Daniel Jones (113), Brian Thomas Jr. (112), Justice Hill (296), Isaiah Davis (270), Kyle Williams (241), Mike Evans (108, App State seasons), Chris Brooks (313); `college-name-collision` for Chase Brown (40), DeVonta Smith (45) and the same players; `college-disagree` for Mike Evans, Ray Davis (282), Chris Brooks. 12 distinct top-400 players in total. The college matcher needs a draft-year or college tie-break even for a single candidate. No CR mirror.

### nflDraftMatch rejects TE↔RB hybrids as position-incompatible
**Found:** computed-stats-verification (app `66ab1b7`, report `verification/2026-10-18-computed-stats-verification.md`) · **Blocking:** no · **Size:** small

V3 draft: Elijah Higgins (KTC rank 393, TE/ARI in KTC) is `draft-missing/position-incompatible` — the crosswalk says drafted 2023 round 6, but `positionsCompatible` (`nflDraftMatch.js:63`) hard-skips the pick because nflverse and Sleeper disagree on the skill position. The same miss is already known for Robbie Ouzts (header comment of `nflDraftMatch.js`). 2 of 400 top rows are missing a draft entry in total (the other is the Joshua Palmer name variant above).
