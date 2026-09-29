import { formatPoints } from './format.js'

/**
 * How this week's opponent has defended the player's position, in words. Rank 1
 * allows the most points, which is the matchup you want. The refresh only ranks
 * defenses once they have played two games, so early weeks have none of this.
 */

// The six softest and six toughest defenses at a position are worth calling out
// in a list. The rest of the league is the middle, where the rank means little.
const NOTABLE = 6

/** 'soft', 'tough', or null for the middle of the league. */
export function matchupGrade(defense) {
  if (!defense) return null
  if (defense.rank <= NOTABLE) return 'soft'
  if (defense.rank > defense.teams - NOTABLE) return 'tough'
  return null
}

/** "the 3rd most" for the top half of the league, "the 2nd fewest" for the bottom half. */
export function rankPhrase({ rank, teams }) {
  const fromTop = rank <= Math.ceil(teams / 2)
  const place = fromTop ? rank : teams - rank + 1
  return `the ${place === 1 ? '' : `${ordinal(place)} `}${fromTop ? 'most' : 'fewest'}`
}

/** The full sentence for the player sheet. */
export function defenseSentence(player) {
  const defense = player.opponentDefense
  if (!defense) return null
  return (
    `${defense.opponent} allow ${formatPoints(defense.allowed)} points a game to ${player.position}s, ` +
    `${rankPhrase(defense)} in the league. The average is ${formatPoints(defense.average)}, ` +
    `through ${defense.games} games.`
  )
}

/** A short line for a roster row, only when the matchup is at either extreme. */
export function defenseNote(player) {
  const defense = player.opponentDefense
  const grade = matchupGrade(defense)
  if (!grade) return null
  const label = grade === 'soft' ? 'Soft matchup' : 'Tough matchup'
  return `${label}, ${defense.opponent} allow ${rankPhrase(defense)} to ${player.position}s`
}

export function ordinal(value) {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return `${value}th`
  return `${value}${{ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th'}`
}
