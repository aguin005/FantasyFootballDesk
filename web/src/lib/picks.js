import { formatPoints, plural } from './format.js'

/**
 * Wording for the waiver track record. The refresh does the grading: each of the
 * app's top picks against your lowest scoring starter at the position, in every
 * week since the pick locked at kickoff.
 */

const POSITION_WORD = { DEF: 'defense', K: 'kicker' }

/** "your worst RB", or "your defense" where a lineup has one starter. */
export function rivalWord(position) {
  return POSITION_WORD[position] ? `your ${POSITION_WORD[position]}` : `your worst ${position}`
}

/** The latest week with a result, or null while the pick is waiting on its first game. */
export function latestResult(pick) {
  return [...(pick.results || [])].reverse().find((result) => !result.bye) || null
}

/** One line for a list row: how the pick did in its latest week. */
export function resultLine(pick) {
  const result = latestResult(pick)
  if (!result) {
    return pick.results?.length ? `On bye in week ${pick.results[pick.results.length - 1].week}` : 'Graded after the week is over'
  }
  const scored = `Week ${result.week}: ${formatPoints(result.points)}`
  if (!result.starter) return `${scored}, no ${pick.position} in your lineup to compare`
  return `${scored} vs ${rivalWord(pick.position)}, ${result.starter.name} ${formatPoints(result.starter.points)}`
}

/** "Beat" or "Missed" for the latest week, nothing before there is one. */
export function verdict(pick) {
  const result = latestResult(pick)
  if (!result || result.beat == null) return null
  return result.beat ? { label: 'Beat', tone: 'green' } : { label: 'Missed', tone: 'red' }
}

/** "2 of 3 times". */
export function tally({ beat, graded }) {
  return `${beat} of ${plural(graded, 'time')}`
}

/** Wins and graded weeks across a set of picks, every week since each pick. */
export function sumTally(picks) {
  return picks.reduce((sum, pick) => ({ beat: sum.beat + pick.beat, graded: sum.graded + pick.graded }), { beat: 0, graded: 0 })
}

/**
 * The most recent week whose own picks have been graded on that week, the answer
 * to "did last week's top picks do well".
 */
export function lastWeekRecord(report) {
  for (const { week, picks } of report?.weeks || []) {
    const results = picks.map((pick) => pick.results.find((result) => result.week === week)).filter((result) => result?.beat != null)
    if (results.length) return { week, beat: results.filter((result) => result.beat).length, graded: results.length }
  }
  return null
}

/** The earliest week a player was one of the top picks, with every result since. */
export function findPick(report, playerId) {
  const matches = (report?.weeks || []).flatMap((week) => week.picks.map((pick) => ({ ...pick, week: week.week })))
  return matches.filter((pick) => pick.playerId === playerId).sort((a, b) => a.week - b.week)[0] || null
}

/** "Week 4's top pick, Ollie Gordon II, scored 15.3, beating your worst RB." for Today. */
export function topPickLine(report) {
  const last = lastWeekRecord(report)
  if (!last) return null
  const top = report.weeks.find((entry) => entry.week === last.week)?.picks[0]
  const result = top?.results.find((entry) => entry.week === last.week)
  if (!result || result.bye) return null
  const against = result.beat == null ? '' : `, ${result.beat ? 'beating' : 'short of'} ${rivalWord(top.position)}`
  return `Week ${last.week}'s top pick, ${top.name}, scored ${formatPoints(result.points)}${against}.`
}
