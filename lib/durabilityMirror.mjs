/**
 * lib/durabilityMirror.mjs — pure, no I/O.
 *
 * Mirror of the app's veteran projected-games rule (`src/utils/durabilitySignals.js`,
 * `src/utils/seasonProjection.js` Step 1 qualifying/weights and Step 6), the bounce-back predicate
 * (`src/utils/projectionSignals.js` `computeBounceBackFlag`) and the dynasty durability base
 * (`src/utils/dynastyScore.js:916-940`), for offline grading only. Mirrored at app `d627562` —
 * CR-28 (registry entry lands in absence-classification-c). Offline analysis: no served file reads this.
 *
 * `careerStats` is `{ [season]: { [playerId]: seasonRow } }` as the app builds it from season-totals.
 * `throughSeason` restricts every read — including the ±1 adjacent-season reads in
 * classifyInjurySeason — to seasons <= throughSeason, by passing a season-filtered view (seasonView),
 * so as-of-S+1 the app's missing S+1 row reads as absent.
 */

// durabilitySignals.js:19-28
export const DURABILITY_CONSTANTS = {
  SNAP_CONTRIB_FLOOR: 0.40, MIN_STARTS: 4, START_RATE_FLOOR: 0.50,
  VOLUME_FLOOR: { QB: 15, RB: 8, WR: 4, TE: 3 },
  VOLUME_KEY: { QB: 'pass_att', RB: 'rush_att', WR: 'rec_tgt', TE: 'rec_tgt' },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** A view of careerStats holding only seasons <= throughSeason (shares the season objects). */
export function seasonView(careerStats, throughSeason) {
  const out = {};
  for (const s of Object.keys(careerStats ?? {})) {
    if (Number(s) <= throughSeason) out[s] = careerStats[s];
  }
  return out;
}

// durabilitySignals.js activeSnapShare
function activeSnapShare(stats) {
  const snaps = stats?.off_snp;
  const teamSnaps = stats?.tm_off_snp;
  if (snaps == null || teamSnaps == null || teamSnaps <= 0) return null;
  return snaps / teamSnaps;
}

// durabilitySignals.js volumePerActiveGame
function volumePerActiveGame(stats, position, gp) {
  const key = DURABILITY_CONSTANTS.VOLUME_KEY[position];
  const v = key ? stats?.[key] : null;
  if (v == null || gp <= 0) return null;
  return v / gp;
}

/**
 * durabilitySignals.js:63-82 wasContributorSeason. Any ONE passing signal suffices — each tier is
 * `if (x != null && x >= FLOOR) return true`, so a snap share BELOW the floor falls through to
 * starts, then volume. (The app file's header comment says the opposite; the mirror follows the code.)
 */
export function wasContributorSeason(seasonData, position) {
  if (!seasonData) return false;
  const gp = seasonData.gamesPlayed ?? 0;
  if (gp <= 0) return false;
  const stats = seasonData.stats ?? {};
  const C = DURABILITY_CONSTANTS;

  const snap = activeSnapShare(stats);
  if (snap != null && snap >= C.SNAP_CONTRIB_FLOOR) return true;

  const gs = seasonData.gamesStarted;
  if (gs != null && (gs >= C.MIN_STARTS || gs / gp >= C.START_RATE_FLOOR)) return true;

  const vol = volumePerActiveGame(stats, position, gp);
  if (vol != null && vol >= C.VOLUME_FLOOR[position]) return true;

  return false;
}

/**
 * durabilitySignals.js:93-104 classifyInjurySeason. Reads careerStats as given — pass a
 * seasonView() to enforce an as-of cut-off on the ±1 reads.
 */
export function classifyInjurySeason(careerStats, playerId, position, season) {
  const sd = careerStats?.[season]?.[playerId];
  if (!sd) return false;
  const gp = sd.gamesPlayed ?? 0;
  const dnp = sd.dnpWeeks ?? 0;
  if (!(gp < 10 && dnp >= 3)) return false;
  return wasContributorSeason(sd, position)
      || wasContributorSeason(careerStats?.[season - 1]?.[playerId], position)
      || wasContributorSeason(careerStats?.[season + 1]?.[playerId], position);
}

/** seasonProjection.js:~655-676 `qualifying`: gp >= 8, finite gp and fantasyPoints, oldest → newest. */
export function qualifyingSeasons(careerStats, playerId, { throughSeason }) {
  const out = [];
  const seasons = Object.keys(careerStats ?? {}).map(Number).filter(s => s <= throughSeason).sort((a, b) => a - b);
  for (const s of seasons) {
    const d = careerStats[s]?.[playerId];
    if (!d) continue;
    const gpRaw = d.gamesPlayed ?? 0;
    if (Number.isFinite(gpRaw) && gpRaw < 8) continue;
    if (!Number.isFinite(gpRaw) || !Number.isFinite(d.fantasyPoints)) continue;
    out.push({ season: s, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: gpRaw, dnpWeeks: d.dnpWeeks ?? 0 });
  }
  return out;
}

/**
 * seasonProjection.js Step 1 weights + Step 6 (injury-season and absence-shape multipliers,
 * `:679-693, 879-923`). → { projectedGames, injurySeasons, absenceShapeFactor, avgGamesBase, avgGames } or null
 * when there is no qualifying season (the app routes those to the rookie path).
 */
export function projectedGamesFor(careerStats, playerId, position, { throughSeason }) {
  const cs = seasonView(careerStats, throughSeason);
  const qualifying = qualifyingSeasons(cs, playerId, { throughSeason });
  if (qualifying.length === 0) return null;

  const recent = qualifying.slice(-3);
  const weightsRaw = recent.length === 3 ? [0.20, 0.30, 0.50] : recent.length === 2 ? [0.30, 0.70] : [1.00];
  const wSum = weightsRaw.reduce((a, b) => a + b, 0);
  const gpWeights = weightsRaw.map(w => w / wSum);
  const avgGamesBase = recent.reduce((acc, s, i) => acc + s.gamesPlayed * gpWeights[i], 0);
  let avgGames = avgGamesBase;

  const injurySeasons = qualifying.filter(s => classifyInjurySeason(cs, playerId, position, s.season)).length;
  if (injurySeasons >= 3) avgGames *= 0.78;
  else if (injurySeasons >= 2) avgGames *= 0.88;

  const availSeasons = qualifying.map(s => cs[s.season]?.[playerId]?.availability).filter(Boolean);
  let absenceShapeFactor = 1.0;
  if (availSeasons.length > 0) {
    let recurring = 0, hidden = 0;
    for (const s of qualifying) {
      const a = cs[s.season]?.[playerId]?.availability;
      if (!a) continue;
      const segs = Array.isArray(a.absenceSegments) ? a.absenceSegments : [];
      if (segs.filter(seg => (seg.length ?? 0) >= 2).length >= 2) recurring += 1;
      if (s.gamesPlayed >= 10 && (a.longestAbsence ?? 0) >= 4) hidden += 1;
    }
    if (recurring >= 2) absenceShapeFactor *= 0.90;
    else if (recurring >= 1) absenceShapeFactor *= 0.95;
    if (hidden >= 2) absenceShapeFactor *= 0.93;
    else if (hidden >= 1) absenceShapeFactor *= 0.97;
    absenceShapeFactor = clamp(absenceShapeFactor, 0.85, 1.0);
  }

  avgGames *= absenceShapeFactor;
  const projectedGames = Math.round(clamp(avgGames, 8, 17));
  return { projectedGames, injurySeasons, absenceShapeFactor, avgGamesBase, avgGames };
}

/**
 * projectionSignals.js:64-93 computeBounceBackFlag, fed the way seasonProjection.js:783-785 feeds it:
 * null when fewer than 2 qualifying seasons. PPG = fantasyPoints / gamesPlayed (served half-PPR here;
 * the app uses league-rescored points, so the flag is descriptive offline).
 */
export function bounceBackFlag(careerStats, playerId, position, { throughSeason }) {
  const cs = seasonView(careerStats, throughSeason);
  const qualifying = qualifyingSeasons(cs, playerId, { throughSeason });
  if (qualifying.length < 2) return null;

  const current = qualifying[qualifying.length - 1];
  const priors = qualifying.slice(0, -1);
  const priorMax = Math.max(...priors.map(s => s.ppg));
  const downSeason = current.season - 1;
  const prevQ = priors[priors.length - 1];

  const shortQualifyingPrior = prevQ.season === downSeason && (prevQ.gamesPlayed ?? 0) < 10;
  const downEntry = cs[downSeason]?.[playerId];
  const subQualifyingInjury = downEntry != null && (downEntry.gamesPlayed ?? 0) < 8
    && classifyInjurySeason(cs, playerId, position, downSeason);

  if (!shortQualifyingPrior && !subQualifyingInjury) return false;
  return current.ppg >= priorMax;
}

/**
 * dynastyScore.js:916-940 injurySeasonCount: every season in careerStats (not just qualifying),
 * counted only when the player has at least one season with gp > 0.
 */
export function dynastyInjurySeasonCount(careerStats, playerId, position, { throughSeason }) {
  const cs = seasonView(careerStats, throughSeason);
  const allSeasons = Object.keys(cs).map(Number).sort((a, b) => a - b);
  const hasPlayed = allSeasons.some(s => (cs[s]?.[playerId]?.gamesPlayed ?? 0) > 0);
  if (!hasPlayed) return 0;
  return allSeasons.filter(s => classifyInjurySeason(cs, playerId, position, s)).length;
}
