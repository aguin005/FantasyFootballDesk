/**
 * Push notifications through ntfy.sh.
 *
 * ntfy has no accounts and no keys. Anyone who knows your topic name can read your
 * notifications, so the topic goes in a GitHub Secret and should be long and
 * unguessable rather than something like "fantasy".
 *
 * Only starters getting worse are pushed. A phone that buzzes for every bench
 * player is a phone you stop reading.
 */
export async function sendNotifications(changes, topic) {
  if (!topic) return 0

  const worth = changes.filter(
    (entry) => entry.isNew && entry.starter && entry.kind === 'downgrade' && entry.severity >= 3
  )
  if (worth.length === 0) return 0

  let sent = 0
  for (const entry of worth) {
    const urgent = entry.severity >= 4
    try {
      const response = await fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: {
          Title: `${entry.name} is ${entry.injuryStatus}`,
          Priority: urgent ? 'high' : 'default',
          Tags: urgent ? 'rotating_light' : 'warning'
        },
        body: `${entry.position} ${entry.team}, starting in ${entry.league}. ${entry.detail}.`
      })
      if (response.ok) sent++
      else console.warn(`ntfy returned HTTP ${response.status}`)
    } catch (error) {
      console.warn(`Could not send notification: ${error.message}`)
    }
  }

  console.log(`Pushed ${sent} notifications`)
  return sent
}
