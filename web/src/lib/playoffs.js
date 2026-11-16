import { plural } from './format.js'
import { ordinal } from './opponent.js'

/**
 * Wording for the playoff picture. The refresh does the work, playing out the
 * rest of the regular season thousands of times, and this turns the result into
 * sentences.
 */

/** "64%", or "<1%" and ">99%" at the ends, since an estimate is never a certainty. */
export function oddsLabel(odds) {
  if (odds == null) return '-'
  if (odds < 0.005) return '<1%'
  if (odds >= 0.995) return '>99%'
  return `${Math.round(odds * 100)}%`
}

/** "6-2", or "6-2-1" with ties. */
export function recordLabel(row) {
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`
}

/** "3rd of 10 now. The top 6 make the playoffs, with 4 weeks left." */
export function standingLine(picture) {
  const teams = picture.rows.length
  const place = `${ordinal(picture.mine.seed)} of ${teams}`
  if (picture.decided) return `You finished ${place}. The top ${picture.playoffTeams} made the playoffs.`
  const left = picture.weeksLeft === 1 ? 'and this is the last week' : `with ${plural(picture.weeksLeft, 'week')} left`
  return `${place} now. The top ${picture.playoffTeams} make the playoffs, ${left}.`
}

/**
 * What this week's game is worth, or null when nothing rides on it: no game, a
 * game that is all but decided, which leaves only one side to report, or one
 * that moves the odds by less than a point.
 */
export function stakesLine(picture) {
  const { ifWin, ifLose } = picture.mine || {}
  if (picture.decided || ifWin == null || ifLose == null) return null
  if (Math.abs(ifWin - ifLose) < 0.01) return null
  return `This week: ${oddsLabel(ifWin)} with a win, ${oddsLabel(ifLose)} with a loss.`
}

/** "First round bye: 22%", when byes exist and yours is a real possibility. */
export function byeLine(picture) {
  const odds = picture.mine?.byeOdds
  if (picture.decided || !picture.byes || odds == null || odds < 0.05) return null
  return `First round bye: ${oddsLabel(odds)}`
}

/** How the estimate was made, for the foot of the standings. */
export function methodNote(picture) {
  if (picture.decided) return 'The regular season is over, so these are the final standings.'
  const notes = [
    'Odds come from playing out the rest of the regular season 20,000 times. This week uses every lineup and its projections, and later weeks use how each team has scored so far.',
    picture.tiebreak === 'points'
      ? 'Teams level on record are split by points scored.'
      : 'Your league splits teams level on record another way. This estimate uses points scored, so close races may differ.'
  ]
  if (picture.median) notes.push('Each week also counts a game against the league median.')
  if (picture.byes) notes.push(`The top ${picture.byes} seeds sit out the first round.`)
  return notes.join(' ')
}
