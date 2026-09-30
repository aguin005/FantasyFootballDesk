import { buildIdMap } from './usage.mjs'

/**
 * Sleeper's player records carry espn_id, yahoo_id, and rotowire_id, which means
 * their dump doubles as a free cross-platform id map. Everything else in this
 * project keys off the ESPN id, because ESPN's news and injury feeds use it too.
 */
export function buildCrosswalk(players) {
  const byEspnId = new Map()
  const bySleeperId = new Map()

  for (const [sleeperId, player] of Object.entries(players)) {
    const record = {
      sleeperId,
      espnId: player.espn_id ? String(player.espn_id) : null,
      name: player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      position: player.position || '',
      team: player.team || 'FA',
      searchName: player.search_full_name || null
    }
    bySleeperId.set(sleeperId, record)
    if (record.espnId) byEspnId.set(record.espnId, record)
  }

  return { byEspnId, bySleeperId }
}

/** Fills in the missing id on a normalized player, whichever direction it is missing. */
export function linkIds(entry, crosswalk) {
  if (entry.espnId && !entry.sleeperId) {
    entry.sleeperId = crosswalk.byEspnId.get(entry.espnId)?.sleeperId ?? null
  }
  if (entry.playerId && !entry.espnId) {
    entry.espnId = crosswalk.bySleeperId.get(entry.playerId)?.espnId ?? null
  }
  return entry
}

/**
 * Fills espn_id on Sleeper records that lack it, in place. Sleeper leaves it empty
 * on a lot of current players, 9 of 17 on one real roster, and every feature keyed
 * to ESPN ids skipped them without a word: the weekly chart, news, injuries, and
 * snap and target share. Sleeper does carry the NFL's own gsis id, which nflverse's
 * players file maps to ESPN. Active players without one are matched on name and
 * position, but only where that pair is unique.
 */
export function fillEspnIds(players, nflversePlayers = []) {
  const { byGsis } = buildIdMap(nflversePlayers)
  const byName = new Map()
  for (const row of nflversePlayers) {
    if (!row.espn_id || !row.display_name) continue
    const key = nameKey(row.display_name, row.position)
    // A repeated name and position is ambiguous, so it matches nobody.
    byName.set(key, byName.has(key) ? null : String(row.espn_id).replace(/\.0$/, ''))
  }

  let filled = 0
  for (const player of Object.values(players || {})) {
    if (player.espn_id) continue
    const gsis = String(player.gsis_id || '').trim()
    const name = player.full_name || `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
    // Names only for active players. The dump keeps thousands of retired records.
    const espnId =
      (gsis && byGsis.get(gsis)) || (player.active && name && byName.get(nameKey(name, player.position)))
    if (!espnId) continue
    player.espn_id = espnId
    filled++
  }
  return filled
}

function nameKey(name, position) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${base}|${position}`
}
