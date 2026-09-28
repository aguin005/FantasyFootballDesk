import fs from 'node:fs/promises'
import path from 'node:path'
import { parseCSV, toNumber } from './csv.mjs'
import { timedFetch } from './http.mjs'

const GAMES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'
const CACHE = path.resolve('.cache/nflverse-games.csv')
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// nflverse uses a few abbreviations that differ from ESPN's.
const ALIASES = { LA: 'LAR', WAS: 'WSH', JAC: 'JAX', SD: 'LAC', OAK: 'LV', STL: 'LAR' }
const normalize = (team) => ALIASES[team] || team

/**
 * Kickoff day and time for every team in a given week, so the dashboard can group
 * your roster by the day they actually play. Teams missing from the map are on bye.
 *
 * nflverse also carries the betting line for each game, which is the best free
 * read on how many points a team will score. That is what defense streaming ranks
 * on: a defense facing a team the market expects to score 17 is worth more than
 * one facing a team expected to score 27.
 */
export async function loadSchedule(season, week) {
  try {
    const rows = parseCSV(await readGames())
    const games = rows.filter(
      (row) => row.season === String(season) && row.week === String(week) && row.game_type === 'REG'
    )

    const byTeam = new Map()
    for (const game of games) {
      const home = normalize(game.home_team)
      const away = normalize(game.away_team)
      const shared = {
        weekday: game.weekday,
        date: game.gameday,
        kickoff: game.gametime || null,
        kickoffISO: toISO(game.gameday, game.gametime)
      }
      const total = toNumber(game.total_line)
      const spread = toNumber(game.spread_line)
      byTeam.set(home, { ...shared, opponent: away, home: true, ...lines(total, spread, true) })
      byTeam.set(away, { ...shared, opponent: home, home: false, ...lines(total, spread, false) })
    }

    console.log(`Schedule loaded for ${games.length} games in week ${week}`)
    return byTeam
  } catch (error) {
    console.warn(`Schedule unavailable: ${error.message}`)
    return new Map()
  }
}

/**
 * Each side's implied points from the total and the spread. nflverse writes the
 * spread from the home side, positive when the home team is favored, so the home
 * team's share is half of the total plus half of the spread. Lines are missing
 * until books post them, which leaves these null rather than guessed.
 */
function lines(total, spread, isHome) {
  if (total == null || spread == null) {
    return { total: null, spread: null, teamImplied: null, opponentImplied: null }
  }
  const home = (total + spread) / 2
  const away = (total - spread) / 2
  return {
    total,
    // From this team's side: positive means this team is favored.
    spread: isHome ? spread : -spread,
    teamImplied: round(isHome ? home : away),
    opponentImplied: round(isHome ? away : home)
  }
}

function round(value) {
  return Number(value.toFixed(1))
}

async function readGames() {
  try {
    const stat = await fs.stat(CACHE)
    if (Date.now() - stat.mtimeMs < ONE_DAY_MS) return await fs.readFile(CACHE, 'utf8')
  } catch {
    // No cache yet.
  }

  const response = await timedFetch(GAMES_URL, {
    headers: { 'user-agent': 'fantasy-dashboard/1.0 (personal use)' }
  })
  if (!response.ok) throw new Error(`games.csv returned HTTP ${response.status}`)

  const text = await response.text()
  await fs.mkdir(path.dirname(CACHE), { recursive: true })
  await fs.writeFile(CACHE, text)
  return text
}

/**
 * nflverse publishes kickoff times in Eastern with no zone attached, which is only
 * useful if you happen to live there. Converting to a real UTC instant here lets
 * the browser render it in whatever zone you actually want.
 *
 * The offset is derived rather than hardcoded, because the regular season runs
 * across the November daylight saving change.
 */
function toISO(date, time) {
  if (!date || !time) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if ([year, month, day, hour, minute].some((value) => !Number.isFinite(value))) return null

  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const offset = zoneOffset(new Date(guess), 'America/New_York')
  return new Date(guess - offset).toISOString()
}

function zoneOffset(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  )
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )
  return asUTC - date.getTime()
}

/**
 * Attaches this week's game to a player, or marks the bye.
 *
 * The lookup goes through the same aliases as the schedule itself. Sleeper writes
 * Washington as WAS while the schedule is keyed WSH, and skipping this sent every
 * Washington player in a Sleeper league to the bye group.
 */
export function attachGame(player, schedule) {
  player.game = gameFor(player, schedule)
  return player
}

/**
 * Next week's game too, for defenses. Streaming is planned a week ahead, since
 * the defense you claim today is often the one you start the week after.
 */
export function attachNextGame(player, schedule) {
  const game = gameFor(player, schedule)
  player.nextGame = game
    ? { matchup: game.matchup, opponent: game.opponent, kickoffISO: game.kickoffISO, opponentImplied: game.opponentImplied }
    : null
  return player
}

function gameFor(player, schedule) {
  const game = schedule.get(normalize(player.team))
  if (!game) return null
  return {
    weekday: game.weekday,
    date: game.date,
    kickoff: game.kickoff,
    kickoffISO: game.kickoffISO,
    opponent: game.opponent,
    matchup: `${game.home ? 'vs' : 'at'} ${game.opponent}`,
    spread: game.spread,
    total: game.total,
    teamImplied: game.teamImplied,
    opponentImplied: game.opponentImplied
  }
}
