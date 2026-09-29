/**
 * Defense streaming.
 *
 * A defense scores on sacks, turnovers, and points allowed, and all three follow
 * the offense it faces far more than the defense itself. The betting market is the
 * best free read on that offense: a team expected to score 17 gives up sacks and
 * turnovers to a team trying to protect a lead, and a team expected to score 27
 * does not. So each defense is rated on three things, blended:
 *
 *   projection  this week's projected points in your league's scoring
 *   implied     how many points the opponent is expected to score, fewer is better
 *   spread      how much the defense's own team is favored by, since a trailing
 *               offense throws more and a thrown ball can be picked off
 *
 * A signal with no data, usually a line the books have not posted yet, drops out
 * and the rest are reweighted, the same way the waiver model handles it.
 */

const WEIGHTS = { projection: 0.45, implied: 0.4, spread: 0.15 }

export function rateDefenses(freeAgents = [], mine = []) {
  // One scale across everyone, yours included, so your defense's score means the
  // same thing as the options it is being compared with.
  const pool = [...freeAgents, ...mine].filter((player) => player.game)
  const scales = {
    projection: scale(pool.map((player) => player.projected)),
    implied: scale(pool.map((player) => player.game.opponentImplied)),
    spread: scale(pool.map((player) => player.game.spread))
  }

  const rate = (player) => {
    if (!player.game) {
      return { player, score: 0, grade: 'bye', reasons: ['On bye this week'] }
    }
    const { opponentImplied, spread, opponent } = player.game
    const parts = [
      [WEIGHTS.projection, scales.projection(player.projected)],
      [WEIGHTS.implied, flip(scales.implied(opponentImplied))],
      [WEIGHTS.spread, scales.spread(spread)]
    ].filter(([, value]) => value != null)

    const weight = parts.reduce((sum, [share]) => sum + share, 0)
    const score = weight === 0 ? 0 : Math.round((100 * parts.reduce((sum, [share, value]) => sum + share * value, 0)) / weight)

    return {
      player,
      score,
      grade: score >= 70 ? 'great' : score >= 45 ? 'solid' : 'tough',
      reasons: [
        opponentImplied != null ? `${opponent} expected to score ${opponentImplied.toFixed(1)}` : null,
        spread == null ? null : spread > 0 ? `Favored by ${spread}` : spread < 0 ? `Underdog by ${-spread}` : 'Even game',
        player.projected != null ? `Projected ${player.projected.toFixed(1)} points` : null
      ].filter(Boolean)
    }
  }

  return {
    board: freeAgents.map(rate).sort((a, b) => b.score - a.score),
    mine: mine.map(rate)
  }
}

export const GRADE_LABEL = { great: 'Great', solid: 'Solid', tough: 'Tough', bye: 'Bye' }
export const GRADE_TONE = { great: 'green', solid: 'blue', tough: 'orange', bye: undefined }

/**
 * "Next week at ATL (21.4)", the opponent's implied points in brackets, for a
 * list row where there is room for little else.
 */
export function nextWeekLabel(player) {
  if (player.nextGame === undefined) return null
  if (!player.nextGame) return 'Bye next week'
  const implied = player.nextGame.opponentImplied
  return `Next week ${player.nextGame.matchup}${implied != null ? ` (${implied.toFixed(1)})` : ''}`
}

/**
 * "Buccaneers D/ST". Sleeper names defenses after the whole franchise, "Tampa Bay
 * Buccaneers", which leaves no room beside a grade on a phone, while ESPN already
 * uses the short form.
 */
export function defenseName(name = '') {
  if (/D\/ST$/.test(name)) return name
  const parts = name.trim().split(/\s+/)
  return `${parts[parts.length - 1]} D/ST`
}

function scale(values) {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (clean.length === 0) return () => null
  const min = Math.min(...clean)
  const max = Math.max(...clean)
  return (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return max === min ? 0.5 : (value - min) / (max - min)
  }
}

function flip(value) {
  return value == null ? null : 1 - value
}
