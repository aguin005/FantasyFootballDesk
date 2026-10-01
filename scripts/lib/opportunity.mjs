import { injuryLevel, sleeperInjury } from './injury.mjs'
import { pointsKey } from '../adapters/sleeper.mjs'

/**
 * Next man up.
 *
 * When a starter goes down, the player behind them inherits the role before any
 * projection catches up, and that is the cheapest moment to claim them. Sleeper's
 * player database carries every NFL player's team, position, depth chart order,
 * and injury status, and its projections cover everyone, so the whole league can
 * be checked on every run without another request.
 *
 * A free agent has an opening when a teammate at the same position who ranked
 * ahead of them is out, doubtful, on IR, or suspended, and the healthy players left
 * put them inside the starting group: the lead back, the starting QB or TE, or one of the
 * top three receivers. A back who moves up to RB2 counts too, at lower weight.
 */

// How many a team starts at each position, the line a backup has to cross.
const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1 }

// An injury only opens a role that existed. Below this many season points, half
// PPR, the injured player was not taking meaningful snaps from anyone.
const MIN_INJURED_SEASON = 50

const STATUS_WORDS = {
  OUT: 'out',
  IR: 'on IR',
  DOUBTFUL: 'doubtful',
  SUSPENDED: 'suspended',
  PUP: 'on the PUP list',
  NFI: 'on the NFI list',
  COV: 'out'
}

/** Every team's players at each fantasy position, keyed "MIA:RB". */
export function buildDepth(players, weekly, seasonal, injuriesByEspn = new Map()) {
  const groups = new Map()
  for (const [sleeperId, player] of Object.entries(players || {})) {
    const position = player.position
    if (!STARTERS[position] || !player.team) continue
    const espnId = player.espn_id ? String(player.espn_id) : null
    const entry = {
      sleeperId,
      espnId,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      position,
      team: player.team,
      status: sleeperInjury(player) || (espnId && injuriesByEspn.get(espnId)?.status) || null,
      weekly: halfPpr(weekly?.get(sleeperId)),
      season: halfPpr(seasonal?.get(sleeperId)),
      depthOrder: Number.isFinite(player.depth_chart_order) ? player.depth_chart_order : null
    }
    const key = `${player.team}:${position}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

/** Sleeper id to opening, for every player in the league who has one. */
export function findOpportunities(groups) {
  const found = new Map()

  for (const group of groups.values()) {
    const position = group[0].position
    const starters = STARTERS[position]
    const healthy = group.filter((player) => injuryLevel(player.status) < 2)
    // Among the healthy, this week's projection says who gets the work now.
    const pecking = [...healthy].sort(
      (a, b) =>
        b.weekly - a.weekly || (a.depthOrder ?? 99) - (b.depthOrder ?? 99) || b.season - a.season
    )

    for (const candidate of healthy) {
      const ahead = group.filter((player) => isAhead(player, candidate))
      const injured = ahead
        .filter((player) => injuryLevel(player.status) >= 2 && isImportant(player))
        .sort((a, b) => b.season - a.season)
      if (injured.length === 0) continue

      const before = ahead.length + 1
      const now = pecking.indexOf(candidate) + 1
      const kind =
        now <= starters && before > starters
          ? 'starter'
          : position === 'RB' && now === 2 && before > 2
            ? 'backup'
            : null
      if (!kind) continue

      found.set(candidate.sleeperId, {
        kind,
        rank: now,
        team: candidate.team,
        injured: injured.slice(0, 2).map(({ name, status, sleeperId, espnId }) => ({
          name,
          status,
          sleeperId,
          espnId
        })),
        note: describe(kind, position, candidate.team, injured.slice(0, 2))
      })
    }
  }

  return found
}

/**
 * Ahead of the candidate on the depth chart before anyone got hurt. Season
 * projection is the main measure, and depth chart order backs it up for a starter
 * whose season number was cut after landing on IR.
 */
function isAhead(player, candidate) {
  if (player === candidate) return false
  if (player.season > candidate.season) return true
  return (
    player.depthOrder != null && candidate.depthOrder != null && player.depthOrder < candidate.depthOrder
  )
}

function isImportant(player) {
  return player.season >= MIN_INJURED_SEASON || player.depthOrder === 1
}

function describe(kind, position, team, injured) {
  const who = injured
    .map((player) => `${player.name} ${STATUS_WORDS[player.status] || 'out'}`)
    .join(' and ')
  if (kind === 'backup') return `Moves up to RB2 for ${team} with ${who}`
  if (position === 'QB') return `Starts at QB for ${team} with ${who}`
  if (position === 'WR') return `Moves into ${team}'s top three receivers with ${who}`
  return `Next up at ${position} for ${team} with ${who}`
}

function halfPpr(stats) {
  const value = stats?.pts_half_ppr
  return typeof value === 'number' ? value : 0
}

/**
 * Free agents with an opening that the platform's own free agent list left out.
 * ESPN only returns its 150 most rostered free agents, and the backup who matters
 * this week is often rostered almost nowhere. Anyone not on a roster in the league
 * is available, so they are added here from Sleeper's data.
 */
export function openingCandidates(league, opportunities, players, weekly, seasonal) {
  const taken = new Set([
    ...league.roster.map((player) => player.playerId),
    ...(league.candidates || []).map((player) => player.playerId),
    ...(league.teams || []).flatMap((team) => team.roster.map((player) => player.playerId))
  ])
  const espn = league.platform === 'espn'
  // Sleeper projects every format, so pick the one this league scores in.
  const key = pointsKey(league.receptionPoints)
  const added = []

  for (const [sleeperId] of opportunities) {
    const player = players[sleeperId]
    if (!player) continue
    const espnId = player.espn_id ? String(player.espn_id) : null
    const playerId = espn ? espnId : sleeperId
    if (!playerId || taken.has(playerId)) continue

    added.push({
      playerId,
      espnId,
      sleeperId,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      position: player.position,
      team: player.team || 'FA',
      injuryStatus: sleeperInjury(player),
      projected: round(weekly?.get(sleeperId)?.[key]),
      seasonProjected: round(seasonal?.get(sleeperId)?.[key]),
      percentOwned: null,
      ownershipChange: null,
      trendAdds: 0,
      searchRank: player.search_rank ?? null
    })
  }
  return added
}

function round(value) {
  return typeof value === 'number' ? Number(value.toFixed(1)) : null
}
