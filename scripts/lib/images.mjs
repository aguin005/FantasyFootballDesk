/**
 * Headshot URLs.
 *
 * ESPN's headshot CDN is keyed by the same athlete id the fantasy API uses, and the
 * images are cut out on transparent backgrounds, so they sit on a dark page without
 * a box around them. Sleeper covers anyone ESPN is missing. Team defenses get a
 * logo, since there is no person to show.
 */
export function headshot(player) {
  if (player.position === 'DEF' || player.position === 'DST') {
    const abbreviation = (player.team || '').toLowerCase()
    return abbreviation && abbreviation !== 'fa'
      ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation}.png`
      : null
  }
  if (player.espnId) {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`
  }
  if (player.sleeperId || player.playerId) {
    return `https://sleepercdn.com/content/nfl/players/thumb/${player.sleeperId || player.playerId}.jpg`
  }
  return null
}
