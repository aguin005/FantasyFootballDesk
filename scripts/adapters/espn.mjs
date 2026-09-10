import { getJSON } from '../lib/http.mjs'

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons'

// ESPN speaks in numeric ids for almost everything.
const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' }
const LINEUP_SLOTS = {
  0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'DEF', 17: 'K', 20: 'BE', 21: 'IR', 23: 'FLEX'
}
const PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
}

function cookieHeader() {
  const espnS2 = process.env.ESPN_S2
  const swid = process.env.SWID
  if (!espnS2 || !swid) return {}
  return { cookie: `espn_s2=${espnS2}; SWID=${swid}` }
}

function leagueUrl(season, leagueId, params) {
  return `${BASE}/${season}/segments/0/leagues/${leagueId}?${params}`
}

/** Rosters, team names, records, and league settings in one call. */
export function getLeague(season, leagueId) {
  const params = 'view=mRoster&view=mTeam&view=mSettings'
  return getJSON(leagueUrl(season, leagueId, params), {
    headers: cookieHeader(),
    label: `ESPN league ${leagueId}`,
    authenticated: true
  })
}

/**
 * Free agents and waiver players. The filter goes in a header rather than the
 * query string, which is the part of ESPN's API nobody would guess.
 */
export function getFreeAgents(season, leagueId, week, limit = 150) {
  const filter = {
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17, 23] },
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

function normalizeInjury(status) {
  if (!status || status === 'ACTIVE' || status === 'NORMAL') return null
  if (status === 'INJURY_RESERVE') return 'IR'
  return status
}

export async function loadLeague(config, season, week) {
  const { leagueId, teamId, label } = config
  const [league, freeAgentData] = await Promise.all([
    getLeague(season, leagueId),
    getFreeAgents(season, leagueId, week)
  ])

  const team = league.teams?.find((entry) => entry.id === Number(teamId))
  if (!team) {
    const available = (league.teams || []).map((entry) => `${entry.id}: ${teamName(entry)}`)
    throw new Error(
      `ESPN team id ${teamId} not found in league ${leagueId}. Teams in this league are ${available.join(', ')}`
    )
  }

  const roster = (team.roster?.entries || []).map((entry) => {
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
      injuryNote: null,
      projected: projectedPoints(player, week),
      seasonProjected: seasonProjection(player)
    }
  })

  const candidates = (freeAgentData.players || []).map((entry) => {
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
  // evaluation possible without any extra calls.
  const teams = (league.teams || []).map((entry) => ({
    teamId: entry.id,
    name: teamName(entry),
    isMine: entry.id === Number(teamId),
    roster: (entry.roster?.entries || [])
      .map((slot) => {
        const player = slot.playerPoolEntry?.player || {}
        return {
          playerId: String(player.id),
          espnId: String(player.id),
          name: player.fullName || 'Unknown player',
          position: POSITIONS[player.defaultPositionId] || '',
          team: PRO_TEAMS[player.proTeamId] || 'FA',
          injuryStatus: normalizeInjury(player.injuryStatus),
          projected: projectedPoints(player, week),
          seasonProjected: seasonProjection(player)
        }
      })
      .filter((player) => player.position)
  }))

  return {
    id: `espn:${leagueId}`,
    teams,
    platform: 'espn',
    name: label || league.settings?.name || `League ${leagueId}`,
    teamName: teamName(team),
    record: `${team.record?.overall?.wins ?? 0}-${team.record?.overall?.losses ?? 0}`,
    scoring: league.settings?.scoringSettings?.scoringType || 'See ESPN settings',
    roster,
    candidates
  }
}

function teamName(team) {
  return team.name || `${team.location ?? ''} ${team.nickname ?? ''}`.trim() || `Team ${team.id}`
}

function round(value) {
  return value == null ? null : Number(Number(value).toFixed(1))
}
