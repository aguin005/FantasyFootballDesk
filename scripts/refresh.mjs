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
import { loadSchedule, attachGame, attachNextGame, inGameWindow, weekFinished } from './lib/schedule.mjs'
import { buildDepth, findOpportunities, openingCandidates } from './lib/opportunity.mjs'
import { loadGameLogs, gameLogFor, opponentHistoryFor } from './lib/gamelog.mjs'
import { loadPointsAllowed, rankDefenses, opponentDefenseFor } from './lib/defense.mjs'
import { fetchFeeds, buildRosterIndex, matchToRoster, foldEspnNews, mergeNews } from './lib/feeds.mjs'
import { fetchSocial } from './lib/social.mjs'
import { buildFreeAgentPool, collectMentions, consensusForLeague } from './lib/consensus.mjs'

const OUTPUT = path.resolve('web/public/data/dashboard.json')
const LAST_WEEK = 18

async function main() {
  const config = JSON.parse(await fs.readFile(path.resolve('leagues.config.json'), 'utf8'))
  const weights = config.waiverWeights
  const waiverLimit = config.waiverLimit ?? 25

  const state = await sleeper.getState()
  const season = state.season
  const scoringWeek = state.display_week || state.week || 1
  const scoringSchedule = await loadSchedule(season, scoringWeek)
  // Once Monday night is over the dashboard plans for the next week: its waivers,
  // its matchups and its lineup. The regular season ends at week 18.
  const rolled = scoringWeek < LAST_WEEK && weekFinished(scoringSchedule)
  const week = rolled ? scoringWeek + 1 : scoringWeek
  console.log(
    rolled
      ? `Week ${scoringWeek} is over, refreshing ${season} week ${week}`
      : `Refreshing ${season} week ${week}`
  )

  // Read the last run before anything overwrites it.
  const previous = await loadPrevious(config.siteUrl)

  const [players, trending, newsByPlayer, injuriesByPlayer, usage, logs, allowed, schedule, nextSchedule, weekly, seasonal] =
    await Promise.all([
      sleeper.getAllPlayers(),
      sleeper.getTrendingAdds(),
      fetchNews(),
      fetchInjuries(),
      loadUsage(season),
      loadGameLogs(season),
      loadPointsAllowed(season),
      rolled ? loadSchedule(season, week) : scoringSchedule,
      loadSchedule(season, week + 1),
      sleeper.getProjections(season, week),
      sleeper.getProjections(season)
    ])

  // Checked across the whole NFL once, then matched against each league's free agents.
  const opportunities = findOpportunities(buildDepth(players, weekly, seasonal, injuriesByPlayer))
  console.log(`${opportunities.size} players have an opening from a teammate's injury`)

  // Feeds are fetched alongside everything else but matched later, once the
  // rosters exist to match against.
  const [feedItems, socialItems] = await Promise.all([
    fetchFeeds(config.newsFeeds),
    fetchSocial(config.social)
  ])
  const crosswalk = buildCrosswalk(players)

  const leagues = []
  const problems = []

  if (config.sleeper?.username && !config.sleeper.username.startsWith('YOUR_')) {
    try {
      const user = await sleeper.getUser(config.sleeper.username)
      const sleeperLeagues = await sleeper.getLeagues(user.user_id, season)
      for (const league of sleeperLeagues) {
        const loaded = await sleeper.loadLeague(
          league.league_id,
          user.user_id,
          players,
          trending,
          weekly,
          seasonal,
          week,
          { include: new Set(opportunities.keys()), lastWeek: week - 1 }
        )
        if (loaded) leagues.push(loaded)
      }
    } catch (error) {
      problems.push(`Sleeper: ${error.message}`)
    }
  }

  for (const league of config.espn || []) {
    if (String(league.leagueId).startsWith('0000')) continue
    try {
      leagues.push(await espn.loadLeague(league, season, week, { lastWeek: week - 1 }))
    } catch (error) {
      problems.push(`ESPN ${league.leagueId}: ${error.message}`)
    }
  }

  for (const league of leagues) {
    for (const player of league.roster) {
      enrich(player, crosswalk, newsByPlayer, injuriesByPlayer, usage)
      attachGame(player, schedule)
    }

    // Other teams only need enough to price a trade and follow the matchup, so they
    // skip news. The game is what tells the matchup which starters have played.
    for (const team of league.teams || []) {
      for (const player of team.roster) {
        player.usage = usage.get(player.espnId) || null
        player.image = headshot(player)
        attachGame(player, schedule)
      }
    }

    league.candidates.push(...openingCandidates(league, opportunities, players, weekly, seasonal))

    for (const player of league.roster) {
      if (player.position === 'DEF') attachNextGame(player, nextSchedule)
    }

    for (const candidate of league.candidates) {
      enrich(candidate, crosswalk, newsByPlayer, injuriesByPlayer, usage)
      attachGame(candidate, schedule)
      if (candidate.position === 'DEF') attachNextGame(candidate, nextSchedule)
      // Sleeper ids are the player ids in a Sleeper league, and the crosswalk
      // supplies them for ESPN players.
      const sleeperId = league.platform === 'sleeper' ? candidate.playerId : candidate.sleeperId
      candidate.opportunity = (sleeperId && opportunities.get(sleeperId)) || null
      if (!candidate.trendAdds && candidate.sleeperId) {
        candidate.trendAdds = trending.get(candidate.sleeperId) || 0
      }
      candidate.usageSignal = usageSignal(candidate.usage)
    }

    // Your players and free agents are the ones the player sheet opens for, so
    // they carry this season's log, last season against this week's opponent, and
    // how that opponent's defense has held up against their position.
    const defenses = rankDefenses(allowed, league.receptionPoints)
    for (const player of [...league.roster, ...league.candidates]) {
      player.gameLog = gameLogFor(player, logs, league.receptionPoints)
      player.vsOpponent = opponentHistoryFor(player, logs, league.receptionPoints)
      player.opponentDefense = opponentDefenseFor(player, defenses)
    }

    league.waivers = rankCandidates(league.candidates, league.roster, weights, waiverLimit)
  }

  // Waiver columns are read once, against the free agents across every league, then
  // each league keeps only the names it can actually claim.
  const mentions = await collectMentions(feedItems, buildFreeAgentPool(leagues), week)
  for (const league of leagues) {
    league.consensus = consensusForLeague(league, mentions)
    delete league.candidates
  }

  const rosterIndex = buildRosterIndex(leagues)
  const news = mergeNews([
    matchToRoster(socialItems, rosterIndex),
    foldEspnNews(leagues),
    matchToRoster(feedItems, rosterIndex)
  ])
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

  // The workflow reads this to decide whether to queue the next run itself.
  const gameWindow = inGameWindow(schedule)
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `game_window=${gameWindow}\n`)
  if (gameWindow) console.log('Games are on or about to start, so the workflow will run again in about 10 minutes')

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

// Exit as soon as the file is written. Idle keep-alive sockets otherwise hold the
// process open for another ten seconds or so on every run.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
