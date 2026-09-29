import { loadCSV } from './usage.mjs'
import { normalizeTeam } from './schedule.mjs'
import { toNumber } from './csv.mjs'

/**
 * How many fantasy points each defense allows to each position, from the same
 * nflverse weekly file the game logs use. Every row there is one player's game
 * and the defense on the other side, so summing a position's points by opponent and
 * dividing by that defense's games played gives points allowed per game.
 *
 * Standard points and receptions are kept apart, so each league ranks the
 * defenses in its own scoring, the same way the game logs do.
 */

const POSITIONS = ['QB', 'RB', 'WR', 'TE']
// One game says almost nothing about a defense, so ranks start with the second.
const MIN_GAMES = 2

export async function loadPointsAllowed(season) {
  try {
    const rows = await loadCSV(`stats_player/stats_player_week_${season}.csv`, `stats_player_week_${season}.csv`)
    const allowed = pointsAllowed(rows)
    console.log(`Points allowed: ${allowed.games.size} defenses`)
    return allowed
  } catch (error) {
    console.warn(`Points allowed unavailable: ${error.message}`)
    return null
  }
}

/** Games played by each defense, and every position's points against it. */
export function pointsAllowed(rows) {
  const games = new Map()
  const totals = new Map()

  for (const row of rows) {
    if (row.season_type && row.season_type !== 'REG') continue
    const defense = row.opponent_team ? normalizeTeam(row.opponent_team) : null
    const week = toNumber(row.week)
    if (!defense || week == null) continue

    // Any row counts toward games played, so a defense that shut a position out
    // entirely still has the game on its record.
    if (!games.has(defense)) games.set(defense, new Set())
    games.get(defense).add(week)

    if (!POSITIONS.includes(row.position)) continue
    const receptions = toNumber(row.receptions) ?? 0
    const ppr = toNumber(row.fantasy_points_ppr)
    const standard = toNumber(row.fantasy_points) ?? (ppr == null ? null : ppr - receptions)
    if (standard == null) continue

    const key = `${defense}:${row.position}`
    const total = totals.get(key) || { standard: 0, receptions: 0 }
    total.standard += standard
    total.receptions += receptions
    totals.set(key, total)
  }

  return { games, totals }
}

/**
 * Every defense ranked for each position in one league's scoring. Rank 1 allows
 * the most points, which is the matchup you want.
 */
export function rankDefenses(allowed, receptionPoints) {
  if (!allowed) return null
  const perCatch = receptionPoints ?? 1
  const table = new Map()

  for (const position of POSITIONS) {
    // No points recorded at a position at all means the file lacked the column,
    // and ranking 32 zeros would read as real matchups.
    if (![...allowed.totals.keys()].some((key) => key.endsWith(`:${position}`))) continue
    const rows = []
    for (const [defense, weeks] of allowed.games) {
      if (weeks.size < MIN_GAMES) continue
      const total = allowed.totals.get(`${defense}:${position}`) || { standard: 0, receptions: 0 }
      rows.push({ defense, games: weeks.size, perGame: (total.standard + perCatch * total.receptions) / weeks.size })
    }
    if (rows.length === 0) continue

    rows.sort((a, b) => b.perGame - a.perGame)
    const average = rows.reduce((sum, row) => sum + row.perGame, 0) / rows.length
    table.set(position, {
      teams: rows.length,
      average,
      byDefense: new Map(rows.map((row, index) => [row.defense, { ...row, rank: index + 1 }]))
    })
  }

  return table
}

/** This week's opponent as a defense against the player's position, or null. */
export function opponentDefenseFor(player, table) {
  const opponent = player.game?.opponent
  const entry = opponent ? table?.get(player.position) : null
  const row = entry?.byDefense.get(opponent)
  if (!row) return null
  return {
    opponent,
    rank: row.rank,
    teams: entry.teams,
    allowed: round(row.perGame),
    average: round(entry.average),
    games: row.games
  }
}

function round(value) {
  return Number(value.toFixed(1))
}
