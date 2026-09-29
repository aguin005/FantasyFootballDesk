import { SLOT_ORDER, gameState, scheduleKnown, slotOf, sortBySlot } from './lineup.js'

// Kickoff to final whistle for a typical game. Only the fraction of a live game
// that is left matters, and the wall clock tracks the game clock closely enough
// for that.
const GAME_MS = 190 * 60 * 1000

// Closer than this and a projected margin means nothing.
const EVEN_MARGIN = 0.5

/**
 * Where a starter is likely to finish this week.
 *
 * Judged as of the moment the data was pulled rather than now, because the points
 * are a snapshot from that moment. Before kickoff it is the projection. During the
 * game it is the points so far plus the share of the projection still to be played.
 * After the game it is what they scored.
 */
export function expectedPoints(player, asOf, known = true) {
  const projected = player.projected ?? 0
  if (!known) return player.points ? Math.max(player.points, projected) : projected
  if (!player.game) return player.points ?? 0
  const start = Date.parse(player.game.kickoffISO)
  if (!Number.isFinite(start) || asOf < start || player.points == null) return projected
  const left = Math.max(0, 1 - (asOf - start) / GAME_MS)
  return player.points + projected * left
}

/**
 * Both sides of this week's matchup, or null when there is none: a bye, the
 * playoffs once you are out, or a refresh where the matchups call failed.
 */
export function matchupReport(league, generatedAt, now = Date.now()) {
  const matchup = league?.matchup
  if (!matchup) return null
  const opponent = (league.teams || []).find(
    (team) => String(team.teamId) === String(matchup.opponentTeamId)
  )
  if (!opponent) return null

  const asOf = Date.parse(generatedAt) || now
  const me = side(league.teamName, league.roster, matchup.score, asOf, now)
  const them = side(opponent.name, opponent.roster, matchup.opponentScore, asOf, now)
  const final = me.finished && them.finished
  const margin = final ? me.score - them.score : me.projection - them.projection

  return {
    week: matchup.week,
    me,
    them,
    margin,
    final,
    started: me.started || them.started,
    live: me.live + them.live > 0,
    outcome: Math.abs(margin) < EVEN_MARGIN ? 'even' : margin > 0 ? 'ahead' : 'behind',
    pairs: pairUp(me.rows, them.rows)
  }
}

/**
 * Last week's final score, which Today keeps showing until this week's games
 * begin, since Monday night to Thursday is when a result is still fresh news.
 */
export function lastResult(league) {
  const last = league?.lastMatchup
  if (!last || last.score == null || last.opponentScore == null) return null
  // Both at zero means the week was never scored, not a tie.
  if (last.score === 0 && last.opponentScore === 0) return null
  const opponent = (league.teams || []).find((team) => String(team.teamId) === String(last.opponentTeamId))
  const margin = last.score - last.opponentScore
  return {
    week: last.week,
    score: last.score,
    opponentScore: last.opponentScore,
    opponent: opponent?.name || null,
    outcome: Math.abs(margin) < 0.005 ? 'tied' : margin > 0 ? 'won' : 'lost'
  }
}

function side(name, roster, score, asOf, now) {
  const known = scheduleKnown(roster)
  const rows = sortBySlot(roster.filter((player) => player.starter)).map((player) => ({
    player,
    expected: expectedPoints(player, asOf, known),
    state: known ? gameState(player, now) : 'upcoming',
    doneAtPull: known && ['played', 'bye'].includes(gameState(player, asOf))
  }))
  const actual = rows.reduce((sum, row) => sum + (row.player.points ?? 0), 0)

  return {
    name,
    rows,
    score: score ?? actual,
    projection: rows.reduce((sum, row) => sum + row.expected, 0),
    left: rows.filter((row) => row.state === 'upcoming' || row.state === 'live').length,
    live: rows.filter((row) => row.state === 'live').length,
    started: rows.some((row) => row.state === 'live' || row.state === 'played') || (score ?? 0) > 0,
    // Final only once every game was over when the data was pulled, so a score
    // from halfway through Sunday night is never shown as the result.
    finished: rows.length > 0 && rows.every((row) => row.doneAtPull)
  }
}

/**
 * Lines the two lineups up slot by slot, QB against QB and flex against flex, the
 * way every fantasy app shows a matchup. Both teams share the league's lineup, so
 * the slots normally match one for one, and any leftovers sit at the end.
 */
function pairUp(mine, theirs) {
  const waiting = new Map()
  for (const row of theirs) {
    const slot = slotOf(row.player)
    if (!waiting.has(slot)) waiting.set(slot, [])
    waiting.get(slot).push(row)
  }

  const pairs = mine.map((row) => {
    const slot = slotOf(row.player)
    return { slot, mine: row, theirs: waiting.get(slot)?.shift() || null }
  })
  for (const [slot, rest] of waiting) {
    for (const row of rest) pairs.push({ slot, mine: null, theirs: row })
  }

  const order = (slot) => {
    const index = SLOT_ORDER.indexOf(slot)
    return index === -1 ? 99 : index
  }
  return pairs.sort((a, b) => order(a.slot) - order(b.slot))
}
