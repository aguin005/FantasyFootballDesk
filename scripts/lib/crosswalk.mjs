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
