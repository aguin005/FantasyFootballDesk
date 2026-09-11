import fs from 'node:fs/promises'
import path from 'node:path'
import * as sleeper from './adapters/sleeper.mjs'
import * as espn from './adapters/espn.mjs'
import { buildCrosswalk, linkIds } from './lib/crosswalk.mjs'
import { fetchNews, fetchInjuries, attachNews } from './lib/news.mjs'
import { rankCandidates } from './lib/waivers.mjs'
import { loadUsage, usageNotes } from './lib/usage.mjs'
import { loadPrevious, diffRuns } from './lib/history.mjs'
import { sendNotifications } from './lib/notify.mjs'
import { headshot } from './lib/images.mjs'
import { loadSchedule, attachGame } from './lib/schedule.mjs'
import { fetchFeeds, buildRosterIndex, matchToRoster, foldEspnNews, mergeNews } from './lib/feeds.mjs'

const OUTPUT = path.resolve('web/public/data/dashboard.json')

async function main() {
  const config = JSON.parse(await fs.readFile(path.resolve('leagues.config.json'), 'utf8'))
  const weights = config.waiverWeights
  const waiverLimit = config.waiverLimit ?? 25

  const state = await sleeper.getState()
  const season = state.season
  const week = state.display_week || state.week || 1
  console.log(`Refreshing ${season} week ${week}`)

  // Read the last run before anything overwrites it.
  const previous = await loadPrevious(config.siteUrl)

  const [players, trending, newsByPlayer, injuriesByPlayer, usage, schedule] = await Promise.all([
    sleeper.getAllPlayers(),
    sleeper.getTrendingAdds(),
    fetchNews(),
    fetchInjuries(),
    loadUsage(season),
    loadSchedule(season, week)
  ])

  // Feeds are fetched alongside everything else but matched later, once the
  // rosters exist to match against.
  const feedItems = await fetchFeeds(config.newsFeeds)
  const crosswalk = buildCrosswalk(players)

  const leagues = []
  const problems = []

  if (config.sleeper?.username && !config.sleeper.username.startsWith('YOUR_')) {
    try {
      const user = await sleeper.getUser(config.sleeper.username)
      const sleeperLeagues = await sleeper.getLeagues(user.user_id, season)
      for (const league of sleeperLeagues) {
        const loaded = await sleeper.loadLeague(league.league_id, user.user_id, players, trending)
        if (loaded) leagues.push(loaded)
      }
    } catch (error) {
      problems.push(`Sleeper: ${error.message}`)
    }
  }

  for (const league of config.espn || []) {
    if (String(league.leagueId).startsWith('0000')) continue
    try {
      leagues.push(await espn.loadLeague(league, season, week))
    } catch (error) {
      problems.push(`ESPN ${league.leagueId}: ${error.message}`)
    }
  }

  for (const league of leagues) {
    for (const player of league.roster) {
      enrich(player, crosswalk, newsByPlayer, injuriesByPlayer, usage)
      attachGame(player, schedule)
    }

    // Other teams only need enough to price a trade, so they skip news and images.
    for (const team of league.teams || []) {
      for (const player of team.roster) {
        player.usage = usage.get(player.espnId) || null
        player.image = headshot(player)
      }
    }

    for (const candidate of league.candidates) {
      enrich(candidate, crosswalk, newsByPlayer, injuriesByPlayer, usage)
      attachGame(candidate, schedule)
      if (!candidate.trendAdds && candidate.sleeperId) {
        candidate.trendAdds = trending.get(candidate.sleeperId) || 0
      }
      candidate.usageSignal = usageSignal(candidate.usage)
    }

    league.waivers = rankCandidates(league.candidates, league.roster, weights, waiverLimit)
    delete league.candidates
  }

  const rosterIndex = buildRosterIndex(leagues)
  const news = mergeNews([foldEspnNews(leagues), matchToRoster(feedItems, rosterIndex)])
  console.log(`${news.length} stories mention someone you roster`)

  const current = {
    generatedAt: new Date().toISOString(),
    timezone: config.timezone || 'America/Los_Angeles',
    news,
    season,
    week,
    leagues,
    problems
  }

  current.changes = diffRuns(previous, current)

  const topic = process.env.NTFY_TOPIC || config.ntfyTopic
  await sendNotifications(current.changes, topic)

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(current, null, 2))

  const fresh = current.changes.filter((entry) => entry.isNew).length
  console.log(
    `Wrote ${leagues.length} leagues, ${fresh} new changes, ${current.changes.length} on the board`
  )
  for (const problem of problems) console.warn(`Problem: ${problem}`)

  if (leagues.length === 0) {
    console.error('No leagues loaded. Check leagues.config.json and your ESPN secrets.')
    process.exit(1)
  }
}

function enrich(player, crosswalk, newsByPlayer, injuriesByPlayer, usage) {
  linkIds(player, crosswalk)
  attachNews(player, newsByPlayer, injuriesByPlayer)
  player.image = headshot(player)
  player.usage = player.espnId ? usage.get(player.espnId) || null : null
  player.usageNotes = usageNotes(player.usage)
  return player
}

/**
 * One number from the role signals, for the waiver ranker to normalize alongside
 * projections and add velocity. Depth chart position is weighted heavily in
 * September, when it is the only role data that exists.
 */
function usageSignal(entry) {
  if (!entry) return null
  let signal = 0
  if (entry.depthRank === 1) signal += 50
  else if (entry.depthRank === 2) signal += 20
  if (entry.snapPct != null) signal += entry.snapPct * 0.5
  if (entry.targetShare != null) signal += entry.targetShare * 1.5
  if (entry.snapTrend != null) signal += entry.snapTrend * 2
  if (entry.targetTrend != null) signal += entry.targetTrend * 2
  return signal
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
