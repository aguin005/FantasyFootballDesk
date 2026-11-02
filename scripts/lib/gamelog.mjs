import { buildIdMap, loadCSV } from './usage.mjs'
import { normalizeTeam } from './schedule.mjs'
import { toNumber } from './csv.mjs'

/**
 * Week by week fantasy points, and how a player did against this week's opponent
 * last season.
 *
 * nflverse publishes a row per player per game with the opponent, standard
 * fantasy points, and receptions. Standard plus the league's points per reception
 * times receptions is that league's score, so one file serves PPR, half PPR, and
 * standard leagues alike. The usage module already downloads this season's file,
 * and the shared loader means it is only fetched once.
 *
 * Box score scoring can differ a little from a league's own, which may pay six
 * for a passing touchdown or count return yards, so the dashboard labels it as
 * such rather than presenting it as the league's number.
 */

// nflverse player stats cover passing, rushing, and receiving. Kickers and team
// defenses are scored from other tables, so they get no log rather than zeros.
const LOGGED = new Set(['QB', 'RB', 'WR', 'TE'])

export async function loadGameLogs(season) {
  const year = Number(season)
  try {
    const { byGsis } = buildIdMap(await loadCSV('players/players.csv', 'nflverse players'))
    // This season's file does not exist until the first games are played, so a
    // missing file is an empty season rather than a failure.
    const [current, last] = await Promise.all([
      loadCSV(`stats_player/stats_player_week_${year}.csv`, `stats_player_week_${year}.csv`).catch(() => []),
      loadCSV(`stats_player/stats_player_week_${year - 1}.csv`, `stats_player_week_${year - 1}.csv`).catch(() => [])
    ])
    const logs = { season: year, current: index(current, byGsis), last: index(last, byGsis) }
    console.log(`Game logs: ${logs.current.size} players this season, ${logs.last.size} last season`)
    return logs
  } catch (error) {
    console.warn(`Game logs unavailable: ${error.message}`)
    return null
  }
}

/** ESPN id to that player's regular season games, in week order. */
export function index(rows, byGsis) {
  const byPlayer = new Map()
  for (const row of rows) {
    if (row.season_type && row.season_type !== 'REG') continue
    const espnId = byGsis.get(row.player_id)
    const week = toNumber(row.week)
    if (!espnId || week == null) continue

    const receptions = toNumber(row.receptions) ?? 0
    const ppr = toNumber(row.fantasy_points_ppr)
    const standard = toNumber(row.fantasy_points) ?? (ppr == null ? null : ppr - receptions)
    if (standard == null) continue

    if (!byPlayer.has(espnId)) byPlayer.set(espnId, [])
    byPlayer.get(espnId).push({ week, opponent: normalizeTeam(row.opponent_team), standard, receptions })
  }
  for (const games of byPlayer.values()) games.sort((a, b) => a.week - b.week)
  return byPlayer
}

/** This season as [week, opponent, points] rows, compact since every roster carries one. */
export function gameLogFor(player, logs, receptionPoints) {
  if (!logs || !LOGGED.has(player.position) || !player.espnId) return null
  const games = logs.current.get(player.espnId)
  if (!games?.length) return null
  return {
    season: logs.season,
    weeks: games.map((game) => [game.week, game.opponent, score(game, receptionPoints)])
  }
}

/**
 * Last season's games against the team this player faces this week, beside their
 * average across all of last season, which is what makes the number mean anything.
 * An empty games list means they did not meet that team, which is worth saying too.
 */
export function opponentHistoryFor(player, logs, receptionPoints) {
  const opponent = player.game?.opponent
  if (!logs || !opponent || !LOGGED.has(player.position) || !player.espnId) return null
  const games = logs.last.get(player.espnId)
  if (!games?.length) return null

  const scored = games.map((game) => score(game, receptionPoints))
  return {
    season: logs.season - 1,
    opponent,
    games: games
      .filter((game) => game.opponent === opponent)
      .map((game) => [game.week, score(game, receptionPoints)]),
    seasonAverage: round(scored.reduce((sum, value) => sum + value, 0) / scored.length),
    seasonGames: games.length
  }
}

// Fewer games than this this season and last season's latest games fill in, up to
// RECENT_GAMES in all. Three or four games say little about how a player swings.
const MIN_CURRENT = 6
const RECENT_GAMES = 10

/**
 * How much a player's weekly score moves around: the average, the spread, and the
 * range they usually land in, from this season's games and, early in the season,
 * the end of last season's. Matchup prep uses it for win chances, and to tell a
 * boom-or-bust starter from a steady one. Null with fewer than three games.
 */
export function swingFor(player, logs, receptionPoints) {
  if (!logs || !LOGGED.has(player.position) || !player.espnId) return null
  const current = (logs.current.get(player.espnId) || []).map((game) => score(game, receptionPoints))
  let scores = current
  if (current.length < MIN_CURRENT) {
    const last = (logs.last.get(player.espnId) || []).map((game) => score(game, receptionPoints))
    scores = [...current, ...last.slice(-(RECENT_GAMES - current.length))]
  }
  if (scores.length < 3) return null

  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (scores.length - 1)
  const sorted = [...scores].sort((a, b) => a - b)
  return {
    games: scores.length,
    thisSeason: current.length,
    mean: round(mean),
    sd: round(Math.sqrt(variance)),
    // Most weeks fall between these, the 15th and 85th percentiles.
    low: round(percentile(sorted, 0.15)),
    high: round(percentile(sorted, 0.85))
  }
}

function percentile(sorted, share) {
  const at = (sorted.length - 1) * share
  const below = Math.floor(at)
  const above = Math.min(sorted.length - 1, below + 1)
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below)
}

function score(game, receptionPoints) {
  return round(game.standard + (receptionPoints ?? 1) * game.receptions)
}

function round(value) {
  return Number(value.toFixed(1))
}
