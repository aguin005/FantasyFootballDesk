/**
 * Ranking free agents.
 *
 * Three signals, blended:
 *   projection      how many points the player is projected for this week, measured
 *                   against what you would start instead at that position
 *   trend           how many people added the player across Sleeper in the last day,
 *                   which spikes when news breaks before projections catch up
 *   ownershipChange ESPN's day over day change in percent rostered, same idea
 *   usage           snap share, target share, and depth chart rank from nflverse,
 *                   which move before projections do when a role changes
 *   opportunity     a teammate ahead of the player at the position is out, doubtful,
 *                   on IR, or suspended, which hands them the role this week
 *
 * Signals that a platform cannot supply are dropped and the remaining weights are
 * renormalized, so a Sleeper league ranks on trend alone rather than on zeros.
 */

const STARTABLE = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

// Used when leagues.config.json predates a signal, so an older config still ranks
// on everything instead of silently dropping the new signal to zero.
const DEFAULT_WEIGHTS = { projection: 0.4, trend: 0.2, ownershipChange: 0.15, usage: 0.25, opportunity: 0.3 }

// A starter's job outranks a move up to RB2.
const OPPORTUNITY_VALUE = { starter: 1, backup: 0.6 }

// Everyone who makes the overall cut, plus at least this many at each position, so
// one crowded position can never push another off the board. Defenses are all kept,
// since streaming compares every one of them.
const PER_POSITION = 8

export function rankCandidates(candidates, roster, configured, limit) {
  const weights = { ...DEFAULT_WEIGHTS, ...configured }
  const baselines = replacementBaselines(roster)
  const usable = candidates.filter((player) => STARTABLE.has(player.position))

  const projectionGain = new Map()
  for (const player of usable) {
    if (player.projected == null) continue
    const baseline = baselines.get(player.position) ?? 0
    projectionGain.set(player.playerId, player.projected - baseline)
  }

  const scales = {
    projection: buildScale([...projectionGain.values()]),
    trend: buildScale(usable.map((player) => player.trendAdds).filter(Boolean)),
    ownershipChange: buildScale(
      usable.map((player) => player.ownershipChange).filter((value) => value != null)
    ),
    usage: buildScale(usable.map((player) => player.usageSignal).filter((value) => value != null))
  }

  const ranked = usable.map((player) => {
    const parts = []

    if (projectionGain.has(player.playerId)) {
      const gain = projectionGain.get(player.playerId)
      parts.push({ key: 'projection', value: scales.projection(gain), raw: gain })
    }
    if (player.trendAdds) {
      parts.push({ key: 'trend', value: scales.trend(player.trendAdds), raw: player.trendAdds })
    }
    if (player.ownershipChange != null) {
      parts.push({
        key: 'ownershipChange',
        value: scales.ownershipChange(player.ownershipChange),
        raw: player.ownershipChange
      })
    }
    if (player.usageSignal != null) {
      parts.push({ key: 'usage', value: scales.usage(player.usageSignal), raw: player.usageSignal })
    }
    if (player.opportunity) {
      parts.push({ key: 'opportunity', value: OPPORTUNITY_VALUE[player.opportunity.kind] ?? 0.5 })
    }

    const totalWeight = parts.reduce((sum, part) => sum + (weights[part.key] ?? 0), 0)
    const score =
      totalWeight === 0
        ? 0
        : parts.reduce((sum, part) => sum + part.value * (weights[part.key] ?? 0), 0) / totalWeight

    return {
      ...player,
      score: Math.round(score * 100),
      reasons: buildReasons(parts, player, baselines)
    }
  })

  const sorted = ranked
    .filter((player) => player.injuryStatus !== 'IR')
    .sort((a, b) => b.score - a.score)

  const keep = new Set(sorted.slice(0, limit))
  const perPosition = new Map()
  for (const player of sorted) {
    const count = perPosition.get(player.position) || 0
    if (player.position === 'DEF' || count < PER_POSITION) keep.add(player)
    perPosition.set(player.position, count + 1)
  }
  return sorted.filter((player) => keep.has(player))
}

/**
 * Replacement level is your own worst startable option at that position, so a
 * suggestion only scores well if it would actually change your lineup.
 */
function replacementBaselines(roster) {
  const baselines = new Map()
  for (const position of STARTABLE) {
    const projections = roster
      .filter((player) => player.position === position && player.projected != null)
      .map((player) => player.projected)
      .sort((a, b) => b - a)
    if (projections.length === 0) continue
    baselines.set(position, projections[projections.length - 1])
  }
  return baselines
}

/** Min and max scaling into 0 to 1, flat at 0.5 when every value is identical. */
function buildScale(values) {
  if (values.length === 0) return () => 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return () => 0.5
  return (value) => Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function buildReasons(parts, player, baselines) {
  // An opening is the headline when there is one, since it explains everything else.
  const reasons = player.opportunity ? [player.opportunity.note] : []
  for (const part of parts) {
    if (part.key === 'projection') {
      const baseline = baselines.get(player.position)
      const verb = part.raw >= 0 ? 'above' : 'below'
      reasons.push(
        `Projected ${player.projected} points, ${Math.abs(part.raw).toFixed(1)} ${verb} your worst ${player.position} at ${baseline?.toFixed(1)}`
      )
    }
    if (part.key === 'trend') {
      reasons.push(`Added by ${part.raw.toLocaleString()} Sleeper managers in the last 24 hours`)
    }
    if (part.key === 'ownershipChange') {
      const direction = part.raw >= 0 ? 'up' : 'down'
      reasons.push(`Rostered percentage ${direction} ${Math.abs(part.raw)} points today`)
    }
  }
  // Role notes come from nflverse and are already written as sentences.
  for (const note of player.usageNotes || []) reasons.push(note)
  if (player.injuryStatus) reasons.push(`Listed ${player.injuryStatus}`)
  return reasons
}
