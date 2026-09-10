import fs from 'node:fs/promises'
import path from 'node:path'
import { parseCSV } from './csv.mjs'

const GAMES_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'
const CACHE = path.resolve('.cache/nflverse-games.csv')
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// nflverse uses a few abbreviations that differ from ESPN's.
const ALIASES = { LA: 'LAR', WAS: 'WSH', JAC: 'JAX', SD: 'LAC', OAK: 'LV', STL: 'LAR' }
const normalize = (team) => ALIASES[team] || team

/**
 * Kickoff day and time for every team in a given week, so the dashboard can group
 * your roster by the day they actually play. Teams missing from the map are on bye.
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
        kickoff: game.gametime || null
      }
      byTeam.set(home, { ...shared, opponent: away, home: true })
      byTeam.set(away, { ...shared, opponent: home, home: false })
    }

    console.log(`Schedule loaded for ${games.length} games in week ${week}`)
    return byTeam
  } catch (error) {
    console.warn(`Schedule unavailable: ${error.message}`)
    return new Map()
  }
}

async function readGames() {
  try {
    const stat = await fs.stat(CACHE)
    if (Date.now() - stat.mtimeMs < ONE_DAY_MS) return await fs.readFile(CACHE, 'utf8')
  } catch {
    // No cache yet.
  }

  const response = await fetch(GAMES_URL, {
    headers: { 'user-agent': 'fantasy-dashboard/1.0 (personal use)' }
  })
  if (!response.ok) throw new Error(`games.csv returned HTTP ${response.status}`)

  const text = await response.text()
  await fs.mkdir(path.dirname(CACHE), { recursive: true })
  await fs.writeFile(CACHE, text)
  return text
}

/** Attaches this week's game to a player, or marks the bye. */
export function attachGame(player, schedule) {
  const game = schedule.get(player.team)
  player.game = game
    ? {
        weekday: game.weekday,
        date: game.date,
        kickoff: game.kickoff,
        matchup: `${game.home ? 'vs' : 'at'} ${game.opponent}`
      }
    : null
  return player
}
