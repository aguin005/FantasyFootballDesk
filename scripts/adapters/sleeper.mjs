import fs from 'node:fs/promises'
import path from 'node:path'
import { getJSON } from '../lib/http.mjs'
import { sleeperInjury } from '../lib/injury.mjs'

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

/**
 * This week's head to head pairings. Rosters sharing a matchup_id play each other,
 * and points update live on game day. A failure only costs the matchup card, so it
 * resolves to an empty list rather than taking the league down with it.
 */
export async function getMatchups(leagueId, week) {
  try {
    return await getJSON(`${BASE}/league/${leagueId}/matchups/${week}`, {
      label: `Sleeper matchups ${leagueId}`
    })
  } catch (error) {
    console.warn(`Sleeper matchups unavailable for ${leagueId}: ${error.message}`)
    return []
  }
}

/**
 * Most added players, used as a "news just broke" signal across every league.
 * It is one waiver signal among four, so a failure here degrades to no trend data
 * rather than taking the whole refresh down with it.
 */
export async function getTrendingAdds(lookbackHours = 24, limit = 200) {
  const counts = new Map()
  try {
    const rows = await getJSON(
      `${BASE}/players/nfl/trending/add?lookback_hours=${lookbackHours}&limit=${limit}`,
      { label: 'Sleeper trending' }
    )
    for (const row of rows) counts.set(row.player_id, row.count)
  } catch (error) {
    console.warn(`Sleeper trending adds unavailable: ${error.message}`)
  }
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

/**
 * Everything the dashboard needs for one Sleeper league, in our normalized shape.
 * options.include holds Sleeper ids to keep as free agents however obscure they
 * are, which is how a backup with a fresh opening makes the board.
 */
export async function loadLeague(
  leagueId,
  userId,
  players,
  trending,
  projections,
  seasonProjections,
  week,
  options = {}
) {
  const include = options.include || new Set()
  const [league, rosters, users, matchups] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
    getMatchups(leagueId, week)
  ])

  const myRoster = rosters.find((roster) => roster.owner_id === userId)
  if (!myRoster) return null

  const key = scoringKey(league)
  const weekly = projections || new Map()
  const season = seasonProjections || new Map()

  const owner = users.find((user) => user.user_id === userId)
  const rostered = new Set(rosters.flatMap((roster) => roster.players || []))
  const byRoster = new Map((matchups || []).map((entry) => [entry.roster_id, entry]))

  /** Lineup slot and this week's points for each player on one roster. */
  const lineupFor = (entry) => {
    const slots = starterSlots(league.roster_positions, entry.starters)
    const reserve = new Set(entry.reserve || [])
    const taxi = new Set(entry.taxi || [])
    const scored = byRoster.get(entry.roster_id)?.players_points || {}
    return (playerId) => ({
      slot: slots.get(playerId) || (reserve.has(playerId) ? 'IR' : taxi.has(playerId) ? 'TAXI' : 'BE'),
      starter: slots.has(playerId),
      points: typeof scored[playerId] === 'number' ? Number(scored[playerId].toFixed(2)) : null
    })
  }

  const myLineup = lineupFor(myRoster)
  const roster = (myRoster.players || []).map((playerId) => {
    const player = players[playerId] || {}
    return {
      playerId,
      espnId: player.espn_id ? String(player.espn_id) : null,
      name: playerName(player, playerId),
      position: player.position || '',
      team: player.team || 'FA',
      ...myLineup(playerId),
      injuryStatus: sleeperInjury(player),
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
    // Deep free agents are skipped to keep the pool small, except defenses, which
    // Sleeper ranks low but streaming needs every one of, and anyone with an opening.
    const keep = player.position === 'DEF' || include.has(playerId)
    if (!keep && trendAdds === 0 && (player.search_rank ?? 9999) > 300) continue
    candidates.push({
      playerId,
      espnId: player.espn_id ? String(player.espn_id) : null,
      name: playerName(player, playerId),
      position: player.position,
      team: player.team || 'FA',
      injuryStatus: sleeperInjury(player),
      trendAdds,
      searchRank: player.search_rank ?? null,
      projected: pointsFor(weekly.get(playerId), key),
      seasonProjected: pointsFor(season.get(playerId), key),
      percentOwned: null,
      ownershipChange: null
    })
  }

  // Every roster in the league, which the trade tab and the matchup both need.
  // Sleeper returns them all in the same call that returns yours.
  const teams = rosters.map((entry) => {
    const owner = users.find((user) => user.user_id === entry.owner_id)
    const lineup = lineupFor(entry)
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
          ...lineup(playerId),
          injuryStatus: sleeperInjury(player),
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
    record: formatRecord(myRoster.settings?.wins, myRoster.settings?.losses, myRoster.settings?.ties),
    scoring: key === 'pts_ppr' ? 'Full PPR' : key === 'pts_half_ppr' ? 'Half PPR' : 'Standard',
    matchup: findMatchup(matchups, myRoster.roster_id, week),
    roster,
    candidates
  }
}

/**
 * The roster you face this week and both live totals, or null on a bye week, in
 * the playoffs once you are out, or when the matchups call failed.
 */
function findMatchup(matchups, rosterId, week) {
  const mine = (matchups || []).find((entry) => entry.roster_id === rosterId)
  if (mine?.matchup_id == null) return null
  const theirs = matchups.find(
    (entry) => entry.matchup_id === mine.matchup_id && entry.roster_id !== rosterId
  )
  if (!theirs) return null
  return {
    week,
    opponentTeamId: theirs.roster_id,
    score: totalPoints(mine),
    opponentScore: totalPoints(theirs)
  }
}

/** A commissioner's manual adjustment, when there is one, replaces the computed total. */
function totalPoints(entry) {
  const value = entry.custom_points ?? entry.points
  return typeof value === 'number' ? Number(value.toFixed(2)) : null
}

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

const BENCH_SLOTS = new Set(['BN', 'IR', 'TAXI'])
const SLOT_NAMES = { SUPER_FLEX: 'SFLEX', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', IDP_FLEX: 'IDP' }

/**
 * Sleeper lists the league's lineup in roster_positions, and every roster's starters
 * array follows that order slot for slot with the bench left out. Zipping the two is
 * the only way to know which starter is sitting in a flex spot, which start and sit
 * needs, since a flex starter can be replaced by any RB, WR, or TE.
 */
function starterSlots(rosterPositions = [], starters = []) {
  const lineup = rosterPositions.filter((position) => !BENCH_SLOTS.has(position))
  const slots = new Map()
  starters.forEach((playerId, index) => {
    // An empty lineup spot comes back as "0" rather than being left out.
    if (!playerId || playerId === '0') return
    const position = lineup[index]
    slots.set(playerId, SLOT_NAMES[position] || position || 'FLEX')
  })
  return slots
}

function formatRecord(wins, losses, ties) {
  const base = `${wins ?? 0}-${losses ?? 0}`
  return ties ? `${base}-${ties}` : base
}

function playerName(player, fallbackId) {
  if (player.full_name) return player.full_name
  if (player.first_name) return `${player.first_name} ${player.last_name}`.trim()
  return fallbackId
}
