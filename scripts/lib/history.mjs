import fs from 'node:fs/promises'
import path from 'node:path'

const LOCAL = path.resolve('web/public/data/dashboard.json')
const CARRY_FORWARD_MS = 24 * 60 * 60 * 1000

const SEVERITY = { OUT: 4, IR: 4, SUSPENDED: 4, DOUBTFUL: 3, QUESTIONABLE: 2, PUP: 4 }
const rank = (status) => (status ? SEVERITY[status] ?? 1 : 0)

/**
 * The previous run's output, which is what the diff compares against.
 *
 * Locally that file is still sitting on disk from last time. In Actions the
 * checkout is clean, so the previously deployed copy is fetched from the live site
 * instead. Nothing needs committing back to the repo either way.
 */
export async function loadPrevious(siteUrl) {
  try {
    return JSON.parse(await fs.readFile(LOCAL, 'utf8'))
  } catch {
    // Not on disk, so try the deployed copy.
  }

  const url = siteUrl || deployedUrl()
  if (!url) return null

  try {
    const response = await fetch(`${url}data/dashboard.json?t=${Date.now()}`)
    if (!response.ok) return null
    console.log(`Comparing against the copy already published at ${url}`)
    return await response.json()
  } catch {
    return null
  }
}

function deployedUrl() {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) return null
  const [owner, name] = repository.split('/')
  return `https://${owner}.github.io/${name}/`
}

/**
 * What changed since the previous run.
 *
 * Changes younger than a day are carried forward, because a refresh every 30
 * minutes would otherwise wipe the strip clean before you ever looked at it. The
 * point is what changed since you last looked, and this script has no idea when
 * that was.
 */
export function diffRuns(previous, current) {
  const changes = []
  const previousLeagues = new Map((previous?.leagues || []).map((league) => [league.id, league]))

  for (const league of current.leagues) {
    const before = previousLeagues.get(league.id)
    if (!before) continue

    const beforeRoster = new Map(before.roster.map((player) => [player.playerId, player]))
    const afterRoster = new Map(league.roster.map((player) => [player.playerId, player]))

    for (const player of league.roster) {
      const past = beforeRoster.get(player.playerId)

      if (!past) {
        changes.push(change(league, player, 'added', `Joined your roster`, 1))
        continue
      }

      if (rank(player.injuryStatus) !== rank(past.injuryStatus)) {
        const worse = rank(player.injuryStatus) > rank(past.injuryStatus)
        const from = past.injuryStatus || 'healthy'
        const to = player.injuryStatus || 'healthy'
        changes.push(
          change(
            league,
            player,
            worse ? 'downgrade' : 'upgrade',
            `${from} to ${to}`,
            worse ? rank(player.injuryStatus) : 1
          )
        )
      }

      const seen = new Set((past.news || []).map((item) => item.headline))
      for (const item of player.news || []) {
        if (seen.has(item.headline)) continue
        changes.push(change(league, player, 'news', item.headline, 2, item.url))
      }
    }

    for (const player of before.roster) {
      if (!afterRoster.has(player.playerId)) {
        changes.push(change(league, player, 'dropped', 'No longer on your roster', 1))
      }
    }

    // A player climbing into the top of the waiver board is the other thing worth
    // surfacing, since that is the claim you would otherwise miss.
    const beforeTop = new Set((before.waivers || []).slice(0, 10).map((player) => player.playerId))
    for (const player of (league.waivers || []).slice(0, 5)) {
      if (beforeTop.has(player.playerId)) continue
      changes.push(change(league, player, 'waiver', player.reasons?.[0] || 'New waiver target', 2))
    }
  }

  const now = Date.now()
  for (const entry of changes) entry.detectedAt = new Date(now).toISOString()

  const carried = (previous?.changes || []).filter(
    (entry) => now - Date.parse(entry.detectedAt) < CARRY_FORWARD_MS
  )
  for (const entry of carried) entry.isNew = false

  const merged = new Map()
  for (const entry of [...changes, ...carried]) {
    if (!merged.has(entry.key)) merged.set(entry.key, entry)
  }

  return [...merged.values()].sort((a, b) => {
    if (a.starter !== b.starter) return a.starter ? -1 : 1
    if (b.severity !== a.severity) return b.severity - a.severity
    return Date.parse(b.detectedAt) - Date.parse(a.detectedAt)
  })
}

function change(league, player, kind, detail, severity, url = null) {
  return {
    key: `${league.id}:${player.playerId}:${kind}:${detail}`.slice(0, 200),
    kind,
    leagueId: league.id,
    league: league.name,
    playerId: player.playerId,
    name: player.name,
    position: player.position,
    team: player.team,
    image: player.image || null,
    starter: Boolean(player.starter),
    injuryStatus: player.injuryStatus || null,
    detail,
    url,
    severity,
    isNew: true,
    detectedAt: null
  }
}
