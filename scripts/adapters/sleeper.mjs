import fs from 'node:fs/promises'
import path from 'node:path'
import { getJSON } from '../lib/http.mjs'

const BASE = 'https://api.sleeper.app/v1'
// Sleeper's documented API has no projections, but the host their own app talks to
// does, and it is publicly readable with no auth. Undocumented means it can change
// without notice, so every call here degrades to null rather than failing the run.
const INTERNAL = 'https://api.sleeper.com'
const PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const CACHE_DIR = path.resolve('.cache')
const PLAYERS_CACHE = path.join(CACHE_DIR, 'sleeper-players.json')
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Current NFL season and week, straight from Sleeper. This is our clock for everything. */
export function getState() {
  return getJSON(`${BASE}/state/nfl`, { label: 'Sleeper state' })
}

export function getUser(username) {
  return getJSON(`${BASE}/user/${encodeURIComponent(username)}`, { label: 'Sleeper user' })
}

export function getLeagues(userId, season) {
  return getJSON(`${BASE}/user/${userId}/leagues/nfl/${season}`, { label: 'Sleeper leagues' })
}

export function getLeague(leagueId) {
  return getJSON(`${BASE}/league/${leagueId}`, { label: `Sleeper league ${leagueId}` })
}

export function getRosters(leagueId) {
  return getJSON(`${BASE}/league/${leagueId}/rosters`, { label: `Sleeper rosters ${leagueId}` })
}

export function getLeagueUsers(leagueId) {
  return getJSON(`${BASE}/league/${leagueId}/users`, { label: `Sleeper users ${leagueId}` })
}

/** Most added players, used as a "news just broke" signal across every league. */
export async function getTrendingAdds(lookbackHours = 24, limit = 200) {
  const rows = await getJSON(
    `${BASE}/players/nfl/trending/add?lookback_hours=${lookbackHours}&limit=${limit}`,
    { label: 'Sleeper trending' }
  )
  const counts = new Map()
  for (const row of rows) counts.set(row.player_id, row.count)
  return counts
}

/**
 * The full player map is close to 5MB and Sleeper asks that it be pulled at most
 * once a day, so it is cached on disk and reused until it goes stale.
 */
export async function getAllPlayers() {
  try {
    const stat = await fs.stat(PLAYERS_CACHE)
    if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
      return JSON.parse(await fs.readFile(PLAYERS_CACHE, 'utf8'))
    }
  } catch {
    // No cache yet, fall through and download.
  }

  const players = await getJSON(`${BASE}/players/nfl`, { label: 'Sleeper players' })
  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(PLAYERS_CACHE, JSON.stringify(players))
  return players
}

/**
 * Weekly projections for every fantasy position, keyed by player id.
 *
 * Leave week undefined for season totals, which is what trade evaluation needs.
 * The response carries pts_std, pts_half_ppr, and pts_ppr, so the caller picks the
 * one that matches the league's own scoring rather than assuming.
 */
export async function getProjections(season, week) {
  const positions = PROJECTION_POSITIONS.map((position) => `position[]=${position}`).join('&')
  const path = week ? `${season}/${week}` : `${season}`
  const url = `${INTERNAL}/projections/nfl/${path}?season_type=regular&${positions}`

  try {
    const rows = await getJSON(url, { label: `Sleeper projections ${path}` })
    const byPlayer = new Map()
    for (const row of rows) {
      if (row?.player_id && row.stats) byPlayer.set(String(row.player_id), row.stats)
    }
    console.log(`Sleeper projections for ${path}: ${byPlayer.size} players`)
    return byPlayer
  } catch (error) {
    console.warn(`Sleeper projections unavailable for ${path}: ${error.message}`)
    return new Map()
  }
}

/** Full PPR, half PPR, or standard, read off the league's own scoring settings. */
function scoringKey(league) {
  const reception = league.scoring_settings?.rec ?? 0
  if (reception >= 1) return 'pts_ppr'
  if (reception > 0) return 'pts_half_ppr'
  return 'pts_std'
}

function pointsFor(stats, key) {
  const value = stats?.[key]
  return typeof value === 'number' ? Number(value.toFixed(1)) : null
}

/** Everything the dashboard needs for one Sleeper league, in our normalized shape. */
export async function loadLeague(leagueId, userId, players, trending, projections, seasonProjections) {
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId)
  ])

  const myRoster = rosters.find((roster) => roster.owner_id === userId)
  if (!myRoster) return null

  const key = scoringKey(league)
  const weekly = projections || new Map()
  const season = seasonProjections || new Map()

  const owner = users.find((user) => user.user_id === userId)
  const starters = new Set(myRoster.starters || [])
  const rostered = new Set(rosters.flatMap((roster) => roster.players || []))

  const roster = (myRoster.players || []).map((playerId) => {
    const player = players[playerId] || {}
    return {
      playerId,
      espnId: player.espn_id ? String(player.espn_id) : null,
      name: playerName(player, playerId),
      position: player.position || '',
      team: player.team || 'FA',
      starter: starters.has(playerId),
      injuryStatus: normalizeInjury(player.injury_status),
      injuryNote: player.injury_body_part || null,
      projected: pointsFor(weekly.get(playerId), key),
      seasonProjected: pointsFor(season.get(playerId), key)
    }
  })

  const candidates = []
  for (const [playerId, player] of Object.entries(players)) {
    if (rostered.has(playerId)) continue
    if (!player.active) continue
    if (!FANTASY_POSITIONS.has(player.position)) continue
    const trendAdds = trending.get(playerId) || 0
    if (trendAdds === 0 && (player.search_rank ?? 9999) > 300) continue
    candidates.push({
      playerId,
      espnId: player.espn_id ? String(player.espn_id) : null,
      name: playerName(player, playerId),
      position: player.position,
      team: player.team || 'FA',
      injuryStatus: normalizeInjury(player.injury_status),
      trendAdds,
      searchRank: player.search_rank ?? null,
      projected: pointsFor(weekly.get(playerId), key),
      seasonProjected: pointsFor(season.get(playerId), key),
      percentOwned: null,
      ownershipChange: null
    })
  }

  // Every roster in the league, which is what the trade tab needs. Sleeper returns
  // them all in the same call that returns yours.
  const teams = rosters.map((entry) => {
    const owner = users.find((user) => user.user_id === entry.owner_id)
    return {
      teamId: entry.roster_id,
      name: owner?.metadata?.team_name || owner?.display_name || `Roster ${entry.roster_id}`,
      isMine: entry.owner_id === userId,
      roster: (entry.players || []).map((playerId) => {
        const player = players[playerId] || {}
        return {
          playerId,
          espnId: player.espn_id ? String(player.espn_id) : null,
          name: playerName(player, playerId),
          position: player.position || '',
          team: player.team || 'FA',
          injuryStatus: normalizeInjury(player.injury_status),
          projected: pointsFor(weekly.get(playerId), key),
          seasonProjected: pointsFor(season.get(playerId), key)
        }
      })
    }
  })

  return {
    id: `sleeper:${leagueId}`,
    teams,
    platform: 'sleeper',
    name: league.name,
    teamName: owner?.metadata?.team_name || owner?.display_name || 'My team',
    record: `${myRoster.settings?.wins ?? 0}-${myRoster.settings?.losses ?? 0}`,
    scoring: key === 'pts_ppr' ? 'Full PPR' : key === 'pts_half_ppr' ? 'Half PPR' : 'Standard',
    roster,
    candidates
  }
}

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

function playerName(player, fallbackId) {
  if (player.full_name) return player.full_name
  if (player.first_name) return `${player.first_name} ${player.last_name}`.trim()
  return fallbackId
}

function normalizeInjury(status) {
  if (!status) return null
  const map = { Questionable: 'QUESTIONABLE', Doubtful: 'DOUBTFUL', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUSPENDED' }
  return map[status] || String(status).toUpperCase()
}
