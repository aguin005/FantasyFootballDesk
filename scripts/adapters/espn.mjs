import { getJSON, AuthError } from '../lib/http.mjs'
import { normalizeInjury } from '../lib/injury.mjs'

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons'

// ESPN speaks in numeric ids for almost everything.
const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' }
// Anything missing here falls through to bench, so every offensive slot a league
// can configure needs an entry. Leaving out 7 (OP, ESPN's superflex) marked those
// starters as bench players.
const LINEUP_SLOTS = {
  0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP', 16: 'DEF', 17: 'K',
  20: 'BE', 21: 'IR', 23: 'FLEX'
}
const PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
}

function cookieHeader() {
  const espnS2 = clean(process.env.ESPN_S2)
  const swid = clean(process.env.SWID)

  // Returning an empty header here would send an unauthenticated request, and ESPN
  // answers that with the same 401 it gives a rejected cookie. Failing loudly
  // instead is the difference between "your cookies are bad" and "your cookies
  // never loaded", which are fixed in completely different places.
  if (!espnS2 || !swid) {
    const missing = [!espnS2 && 'ESPN_S2', !swid && 'SWID'].filter(Boolean).join(' and ')
    throw new AuthError(
      `${missing} not set in the environment. Locally run: set -a && source .env && set +a. In Actions, check the repository secrets.`
    )
  }

  return { cookie: `espn_s2=${espnS2}; SWID=${swid}` }
}

/** Strips quotes and stray whitespace, which are the usual copy and paste damage. */
function clean(value) {
  if (!value) return ''
  return value.trim().replace(/^["']|["']$/g, '')
}

function leagueUrl(season, leagueId, params) {
  return `${BASE}/${season}/segments/0/leagues/${leagueId}?${params}`
}

/**
 * Rosters, team names, records, and league settings in one call. The scoring
 * period is explicit because ESPN otherwise answers with its own current week,
 * and the lineups and projections have to match the week the refresh is planning.
 */
export function getLeague(season, leagueId, week) {
  const params = `view=mRoster&view=mTeam&view=mSettings${week ? `&scoringPeriodId=${week}` : ''}`
  return getJSON(leagueUrl(season, leagueId, params), {
    headers: cookieHeader(),
    label: `ESPN league ${leagueId}`,
    authenticated: true
  })
}

/**
 * The season's head to head schedule with live totals for the current week. Kept
 * out of getLeague on purpose: a failure here only costs the matchup card, while
 * a failure in the main call would lose the whole league.
 */
export async function getMatchups(season, leagueId, week) {
  try {
    return await getJSON(leagueUrl(season, leagueId, `view=mMatchupScore&scoringPeriodId=${week}`), {
      headers: cookieHeader(),
      label: `ESPN matchups ${leagueId}`,
      authenticated: true
    })
  } catch (error) {
    console.warn(`ESPN matchups unavailable for ${leagueId}: ${error.message}`)
    return null
  }
}

/**
 * Free agents and waiver players. The filter goes in a header rather than the
 * query string, which is the part of ESPN's API nobody would guess.
 */
export function getFreeAgents(season, leagueId, week, limit = 150, slotIds = [0, 2, 4, 6, 16, 17, 23]) {
  const filter = {
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      filterSlotIds: { value: slotIds },
      filterRanksForScoringPeriodIds: { value: [week] },
      limit,
      offset: 0,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: 'STANDARD' }
    }
  }

  return getJSON(leagueUrl(season, leagueId, `view=kona_player_info&scoringPeriodId=${week}`), {
    headers: { ...cookieHeader(), 'x-fantasy-filter': JSON.stringify(filter) },
    label: `ESPN free agents ${leagueId}`,
    authenticated: true
  })
}

/** Weekly projection lives in the stats array under statSourceId 1. */
function projectedPoints(player, week) {
  const entry = (player.stats || []).find(
    (stat) => stat.statSourceId === 1 && stat.scoringPeriodId === week
  )
  return entry?.appliedTotal != null ? Number(entry.appliedTotal.toFixed(1)) : null
}

/** Points actually scored this week sit beside it under statSourceId 0. */
function actualPoints(player, week) {
  const entry = (player.stats || []).find(
    (stat) => stat.statSourceId === 0 && stat.scoringPeriodId === week
  )
  return entry?.appliedTotal != null ? Number(entry.appliedTotal.toFixed(2)) : null
}

/** One roster entry in the normalized shape, lineup slot and this week's points included. */
function rosterPlayer(entry, week) {
  const player = entry.playerPoolEntry?.player || {}
  const slot = LINEUP_SLOTS[entry.lineupSlotId] || 'BE'
  return {
    playerId: String(player.id),
    espnId: String(player.id),
    name: player.fullName || 'Unknown player',
    position: POSITIONS[player.defaultPositionId] || '',
    team: PRO_TEAMS[player.proTeamId] || 'FA',
    slot,
    starter: slot !== 'BE' && slot !== 'IR',
    injuryStatus: normalizeInjury(player.injuryStatus),
    projected: projectedPoints(player, week),
    points: actualPoints(player, week),
    seasonProjected: seasonProjection(player)
  }
}

/**
 * Rest of season projection, which is what trade evaluation needs. ESPN files the
 * full season total under scoringPeriodId 0 rather than a week number.
 */
function seasonProjection(player) {
  const entry = (player.stats || []).find(
    (stat) => stat.statSourceId === 1 && stat.scoringPeriodId === 0
  )
  return entry?.appliedTotal != null ? Number(entry.appliedTotal.toFixed(1)) : null
}

export async function loadLeague(config, season, week, options = {}) {
  const { leagueId, teamId, label } = config
  const [league, freeAgentData, defenseData, matchupData] = await Promise.all([
    getLeague(season, leagueId, week),
    getFreeAgents(season, leagueId, week),
    // The main list is the 150 most rostered free agents, which can leave out the
    // barely rostered defenses a streamer is looking for. Only the board is lost if
    // this fails, so it degrades to nothing.
    getFreeAgents(season, leagueId, week, 40, [16]).catch((error) => {
      console.warn(`ESPN free agent defenses unavailable for ${leagueId}: ${error.message}`)
      return { players: [] }
    }),
    getMatchups(season, leagueId, week)
  ])

  const team = league.teams?.find((entry) => entry.id === Number(teamId))
  if (!team) {
    const available = (league.teams || []).map((entry) => `${entry.id}: ${teamName(entry)}`)
    throw new Error(
      `ESPN team id ${teamId} not found in league ${leagueId}. Teams in this league are ${available.join(', ')}`
    )
  }

  const roster = (team.roster?.entries || []).map((entry) => ({
    ...rosterPlayer(entry, week),
    injuryNote: null
  }))

  const seen = new Set()
  const pool = [...(freeAgentData.players || []), ...(defenseData.players || [])].filter((entry) => {
    const id = entry.player?.id
    if (id == null || seen.has(id)) return false
    seen.add(id)
    return true
  })

  const candidates = pool.map((entry) => {
    const player = entry.player || {}
    return {
      playerId: String(player.id),
      espnId: String(player.id),
      name: player.fullName || 'Unknown player',
      position: POSITIONS[player.defaultPositionId] || '',
      team: PRO_TEAMS[player.proTeamId] || 'FA',
      injuryStatus: normalizeInjury(player.injuryStatus),
      projected: projectedPoints(player, week),
      seasonProjected: seasonProjection(player),
      percentOwned: round(player.ownership?.percentOwned),
      ownershipChange: round(player.ownership?.percentChange),
      trendAdds: 0,
      searchRank: null
    }
  })

  // Every team's roster comes back in the same response, which is what makes trade
  // evaluation and the matchup possible without any extra calls.
  const teams = (league.teams || []).map((entry) => ({
    teamId: entry.id,
    name: teamName(entry),
    isMine: entry.id === Number(teamId),
    roster: (entry.roster?.entries || [])
      .map((slot) => rosterPlayer(slot, week))
      .filter((player) => player.position)
  }))

  return {
    id: `espn:${leagueId}`,
    teams,
    platform: 'espn',
    name: label || league.settings?.name || `League ${leagueId}`,
    teamName: teamName(team),
    record: formatRecord(team.record?.overall),
    scoring: league.settings?.scoringSettings?.scoringType || 'See ESPN settings',
    receptionPoints: receptionPoints(league.settings),
    matchup: findMatchup(matchupData?.schedule, team.id, matchupPeriodFor(league.settings, week), week),
    lastMatchup: lastMatchupFor(matchupData?.schedule, team.id, league.settings, week, options.lastWeek),
    roster,
    candidates
  }
}

/**
 * ESPN schedules by matchup period, not by week. They line up one to one in the
 * regular season, but a playoff round can span two weeks, and the settings carry
 * the map between them.
 */
function matchupPeriodFor(settings, week) {
  const periods = settings?.scheduleSettings?.matchupPeriods || {}
  for (const [period, weeks] of Object.entries(periods)) {
    if (Array.isArray(weeks) && weeks.includes(week)) return Number(period)
  }
  return week
}

/**
 * Last week's result, which the schedule already carries. A playoff round that
 * spans both weeks is still in progress, so it has no separate result to show.
 */
function lastMatchupFor(schedule, teamId, settings, week, lastWeek) {
  if (!(lastWeek >= 1)) return null
  const period = matchupPeriodFor(settings, lastWeek)
  if (period === matchupPeriodFor(settings, week)) return null
  return findMatchup(schedule, teamId, period, lastWeek)
}

/**
 * The team you face this period and both live totals. Null on a bye, which in the
 * playoffs shows up as a matchup with no away side, or when the call failed.
 */
function findMatchup(schedule, teamId, period, week) {
  const game = (schedule || []).find(
    (entry) =>
      entry.matchupPeriodId === period &&
      (entry.home?.teamId === teamId || entry.away?.teamId === teamId)
  )
  if (!game?.home || !game?.away) return null
  const [mine, theirs] = game.home.teamId === teamId ? [game.home, game.away] : [game.away, game.home]
  return {
    week,
    opponentTeamId: theirs.teamId,
    score: sideTotal(mine),
    opponentScore: sideTotal(theirs)
  }
}

/** The live total while games are on, the settled total otherwise. */
function sideTotal(side) {
  const value = side.totalPointsLive ?? side.totalPoints
  return typeof value === 'number' ? Number(value.toFixed(2)) : null
}

// ESPN's stat id for receptions. Its entry in the scoring items is the league's
// points per catch, and a league that never changed it is full PPR.
const RECEPTIONS_STAT = 53

function receptionPoints(settings) {
  const item = (settings?.scoringSettings?.scoringItems || []).find(
    (entry) => entry.statId === RECEPTIONS_STAT
  )
  return typeof item?.points === 'number' ? item.points : 1
}

function teamName(team) {
  return team.name || `${team.location ?? ''} ${team.nickname ?? ''}`.trim() || `Team ${team.id}`
}

function formatRecord(overall = {}) {
  const base = `${overall.wins ?? 0}-${overall.losses ?? 0}`
  return overall.ties ? `${base}-${overall.ties}` : base
}

function round(value) {
  return value == null ? null : Number(Number(value).toFixed(1))
}
