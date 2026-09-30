import { localDayKey } from './format.js'
import { teamCode } from './teams.js'

// Kickoff to final whistle with room for overtime, the same window the lineup uses.
const GAME_MS = 3.5 * 60 * 60 * 1000

/**
 * upcoming, live, or final. nflverse records a score once a game is over, so a
 * score means final even inside the usual window, and a game past the window
 * counts as final before its score arrives.
 */
export function gameStatus(game, now = Date.now()) {
  const start = Date.parse(game.kickoffISO)
  if (!Number.isFinite(start) || now < start) return 'upcoming'
  if (game.homeScore != null && game.awayScore != null) return 'final'
  return now < start + GAME_MS ? 'live' : 'final'
}

/**
 * The week's games by day in the device's time zone, in kickoff order. The first
 * game that is not over is marked current, which is where the panel opens. Games
 * without a kickoff time, late season flex games, go last under their weekday.
 */
export function scheduleDays(games = [], now = Date.now()) {
  const days = new Map()
  for (const game of games) {
    const key = game.kickoffISO ? localDayKey(game.kickoffISO) : `tbd-${game.weekday || ''}`
    if (!days.has(key)) {
      const label = game.kickoffISO
        ? new Date(game.kickoffISO).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
        : `${game.weekday || 'Date'}, time to be announced`
      days.set(key, { key, label, games: [] })
    }
    days.get(key).games.push({ ...game, status: gameStatus(game, now) })
  }

  const kickoff = (game) => Date.parse(game.kickoffISO) || Number.MAX_SAFE_INTEGER
  const ordered = [...days.values()]
  for (const day of ordered) day.games.sort((a, b) => kickoff(a) - kickoff(b))
  ordered.sort((a, b) => kickoff(a.games[0]) - kickoff(b.games[0]))

  const current = ordered.flatMap((day) => day.games).find((game) => game.status !== 'final')
  if (current) current.current = true
  return ordered
}

const startersFirst = (a, b) => Number(Boolean(b.starter)) - Number(Boolean(a.starter))

/** Your players by the team they play for, starters first. */
export function rosterByTeam(roster = []) {
  const byTeam = new Map()
  for (const player of roster) {
    if (!player.team || player.team === 'FA') continue
    const code = teamCode(player.team)
    if (!byTeam.has(code)) byTeam.set(code, [])
    byTeam.get(code).push(player)
  }
  for (const players of byTeam.values()) players.sort(startersFirst)
  return byTeam
}

/** Your players on either side of one game, starters first. */
export function playersInGame(byTeam, game) {
  return [...(byTeam.get(game.away) || []), ...(byTeam.get(game.home) || [])].sort(startersFirst)
}

/** "J. Allen", or "D/ST" for a team defense. */
export function shortName(player) {
  if (player.position === 'DEF') return 'D/ST'
  const parts = String(player.name || '').trim().split(/\s+/)
  if (parts.length < 2) return parts[0] || ''
  // A no-break space, so "D. Samuel" never splits across a line.
  return `${parts[0][0]}.\u00a0${parts.slice(1).join(' ')}`
}
