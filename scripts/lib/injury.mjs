/**
 * Injury designations in one vocabulary.
 *
 * Each source spells them its own way: Sleeper writes "Out" and "Sus", ESPN's
 * fantasy API writes "INJURY_RESERVE", and ESPN's injuries feed writes "Injured
 * Reserve". Everything downstream compares against OUT, IR, and friends, so an
 * unconverted "Injured Reserve" used to read as a mild, unknown designation.
 */

const ALIASES = {
  INJURY_RESERVE: 'IR',
  INJURED_RESERVE: 'IR',
  SUS: 'SUSPENDED',
  SUSPENSION: 'SUSPENDED',
  PHYSICALLY_UNABLE_TO_PERFORM: 'PUP',
  NON_FOOTBALL_INJURY: 'NFI',
  DAY_TO_DAY: 'QUESTIONABLE'
}

const HEALTHY = new Set(['ACTIVE', 'NORMAL', 'HEALTHY', 'PROBABLE'])

const NOT_PLAYING = new Set(['OUT', 'IR', 'SUSPENDED', 'PUP', 'NFI', 'COV'])

export function normalizeInjury(status) {
  if (!status) return null
  const key = String(status).trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (!key || HEALTHY.has(key)) return null
  return ALIASES[key] || key
}

/** 0 healthy, 1 questionable or unknown, 2 doubtful, 3 not playing. */
export function injuryLevel(status) {
  if (!status) return 0
  if (status === 'DOUBTFUL') return 2
  if (NOT_PLAYING.has(status)) return 3
  return 1
}

/** Sleeper keeps the game designation and the roster status in separate fields. */
export function sleeperInjury(player) {
  return (
    normalizeInjury(player?.injury_status) ||
    (player?.status === 'Injured Reserve' ? 'IR' : null) ||
    (player?.status === 'Physically Unable to Perform' ? 'PUP' : null)
  )
}
