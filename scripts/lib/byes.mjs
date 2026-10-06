import { gameFor, normalizeTeam } from './schedule.mjs'
import { opponentDefenseFor } from './defense.mjs'
import { statsId } from './picks.mjs'
import { pointsKey } from '../adapters/sleeper.mjs'

/**
 * What the bye planner needs to cover a starter's bye week.
 *
 * The plan itself is made in the browser, beside the lineup rules it shares with
 * start and sit. The refresh supplies what only it can: how each player on your
 * roster projects in the coming weeks, and the best free agents at each position
 * who play in a week when one of your players is on bye, with their matchups.
 *
 * This week uses the league's own projections, the numbers the rest of the app
 * shows. Later weeks use Sleeper's in the league's points per catch, for your
 * bench and the free agents alike, so each comparison stays within one source.
 */

// Weeks that get replacement picks, this one included. Further out, projections
// are rough and the free agent pool will have changed by then.
export const LOOKAHEAD = 3
const OPTIONS_PER_POSITION = 4
// Not worth a claim for a bye week: anyone doubtful or worse.
const UNAVAILABLE = new Set(['DOUBTFUL', 'OUT', 'IR', 'SUSPENDED', 'SUSPENSION', 'PUP', 'NFI', 'COV'])

/** The weeks after this one that the planner looks at, stopping at the last week. */
export function laterWeeks(week, lastWeek) {
  const weeks = []
  for (let next = week + 1; next < week + LOOKAHEAD && next <= lastWeek; next++) weeks.push(next)
  return weeks
}

/**
 * Fills in the coming weeks for one league. Each roster player gets ahead[week]
 * with that week's projection and game for every later week they play, and the
 * league gets byeOptions[week], the free agent shortlist, for every week in the
 * window where one of your players is on bye.
 *
 * later is [{ week, schedule, projections }] for the weeks after this one, and
 * candidates are the league's free agents, already carrying this week's numbers.
 */
export function addByeOptions(league, { week, later, defenses, byeWeeks }) {
  const key = pointsKey(league.receptionPoints)
  const projected = (player, projections) => {
    const id = statsId(player, league.platform)
    const value = id ? projections.get(id)?.[key] : null
    return typeof value === 'number' ? round(value) : null
  }
  const matchup = (player, game) => opponentDefenseFor({ position: player.position, game }, defenses)

  for (const player of league.roster) {
    const ahead = {}
    for (const { week: next, schedule, projections } of later) {
      const game = gameFor(player, schedule)
      if (game) ahead[next] = { projected: projected(player, projections), game, opponentDefense: matchup(player, game) }
    }
    player.ahead = ahead
  }

  const resting = (target) => league.roster.some((player) => byeWeeks[normalizeTeam(player.team)] === target)
  const options = {}
  if (resting(week)) {
    options[week] = shortlist(
      league.candidates.map((candidate) => ({
        player: candidate,
        projected: candidate.projected,
        game: candidate.game,
        opponentDefense: candidate.opponentDefense
      }))
    )
  }
  for (const { week: next, schedule, projections } of later) {
    if (!resting(next)) continue
    options[next] = shortlist(
      league.candidates.map((candidate) => {
        const game = gameFor(candidate, schedule)
        return { player: candidate, projected: projected(candidate, projections), game, opponentDefense: matchup(candidate, game) }
      })
    )
  }
  league.byeOptions = options
}

/**
 * The best few free agents at each position who play that week and are healthy
 * enough to claim, trimmed to what a row and the player sheet need.
 */
function shortlist(entries) {
  const playing = entries
    .filter((entry) => entry.game && entry.projected > 0 && !UNAVAILABLE.has(entry.player.injuryStatus))
    .sort((a, b) => b.projected - a.projected)
  const taken = new Map()
  const kept = []
  for (const entry of playing) {
    const count = taken.get(entry.player.position) || 0
    if (count >= OPTIONS_PER_POSITION) continue
    taken.set(entry.player.position, count + 1)
    kept.push({ ...entry, player: summary(entry.player) })
  }
  return kept
}

function summary(player) {
  return {
    playerId: player.playerId,
    espnId: player.espnId || null,
    sleeperId: player.sleeperId || null,
    name: player.name,
    position: player.position,
    team: player.team,
    image: player.image || null,
    injuryStatus: player.injuryStatus || null,
    percentOwned: player.percentOwned ?? null,
    trendAdds: player.trendAdds || 0
  }
}

function round(value) {
  return Number(value.toFixed(1))
}
