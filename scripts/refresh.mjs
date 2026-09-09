import fs from 'node:fs/promises'
import path from 'node:path'
import * as sleeper from './adapters/sleeper.mjs'
import * as espn from './adapters/espn.mjs'
import { buildCrosswalk, linkIds } from './lib/crosswalk.mjs'
import { fetchNews, fetchInjuries, attachNews } from './lib/news.mjs'
import { rankCandidates } from './lib/waivers.mjs'

const OUTPUT = path.resolve('web/public/data/dashboard.json')

async function main() {
  const config = JSON.parse(await fs.readFile(path.resolve('leagues.config.json'), 'utf8'))
  const weights = config.waiverWeights
  const waiverLimit = config.waiverLimit ?? 25

  const state = await sleeper.getState()
  const season = state.season
  const week = state.display_week || state.week || 1
  console.log(`Refreshing ${season} week ${week}`)

  const [players, trending, newsByPlayer, injuriesByPlayer] = await Promise.all([
    sleeper.getAllPlayers(),
    sleeper.getTrendingAdds(),
    fetchNews(),
    fetchInjuries()
  ])
  const crosswalk = buildCrosswalk(players)

  const leagues = []
  const problems = []

  // Sleeper leagues are discovered from the username, so adding a league on your
  // phone is enough. Nothing here needs editing when you join one.
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

  // ESPN leagues have to be listed by hand, since finding your leagues without
  // scraping the site is not something their API offers.
  for (const league of config.espn || []) {
    if (String(league.leagueId).startsWith('0000')) continue
    try {
      leagues.push(await espn.loadLeague(league, season, week))
    } catch (error) {
      problems.push(`ESPN ${league.leagueId}: ${error.message}`)
    }
  }

  const alerts = []

  for (const league of leagues) {
    for (const player of league.roster) {
      linkIds(player, crosswalk)
      attachNews(player, newsByPlayer, injuriesByPlayer)
      if (player.injuryStatus || player.news.length > 0) {
        alerts.push({
          league: league.name,
          leagueId: league.id,
          name: player.name,
          position: player.position,
          team: player.team,
          starter: player.starter,
          injuryStatus: player.injuryStatus,
          headline: player.news[0]?.headline || player.injuryNote || null
        })
      }
    }

    // Sleeper gives no projections, so its candidates borrow ESPN trend data by id.
    for (const candidate of league.candidates) {
      linkIds(candidate, crosswalk)
      if (!candidate.trendAdds && candidate.sleeperId) {
        candidate.trendAdds = trending.get(candidate.sleeperId) || 0
      }
      attachNews(candidate, newsByPlayer, injuriesByPlayer)
    }

    league.waivers = rankCandidates(league.candidates, league.roster, weights, waiverLimit)
    delete league.candidates
  }

  alerts.sort((a, b) => {
    if (a.starter !== b.starter) return a.starter ? -1 : 1
    return severity(b.injuryStatus) - severity(a.injuryStatus)
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    season,
    week,
    leagues,
    alerts,
    problems
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(payload, null, 2))

  console.log(`Wrote ${leagues.length} leagues and ${alerts.length} alerts to ${OUTPUT}`)
  for (const problem of problems) console.warn(`Problem: ${problem}`)

  // A run that reaches zero leagues means the config or the cookies are wrong,
  // and publishing an empty dashboard over a good one would hide that.
  if (leagues.length === 0) {
    console.error('No leagues loaded. Check leagues.config.json and your ESPN secrets.')
    process.exit(1)
  }
}

function severity(status) {
  return { OUT: 4, IR: 4, DOUBTFUL: 3, SUSPENDED: 3, QUESTIONABLE: 2 }[status] ?? 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
