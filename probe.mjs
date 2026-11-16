// Temporary: prints API facts the next features depend on. No names, only ids,
// numbers and field names. Removed before merging.
import fs from 'node:fs'
import * as sleeper from './scripts/adapters/sleeper.mjs'
import * as espn from './scripts/adapters/espn.mjs'

const config = JSON.parse(fs.readFileSync('leagues.config.json', 'utf8'))
const show = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
const ORIGIN = 'https://aguin005.github.io'

async function cors(url) {
  try {
    const response = await fetch(url, { headers: { Origin: ORIGIN } })
    const pick = ['access-control-allow-origin', 'access-control-allow-credentials', 'cache-control', 'age', 'content-type', 'vary']
    show(`CORS ${response.status} ${url.replace(/\d{15,}/g, 'ID')}`, Object.fromEntries(pick.map((key) => [key, response.headers.get(key)])))
  } catch (error) {
    show(`CORS failed ${url}`, error.message)
  }
}

const state = await sleeper.getState()
show('state', state)
const week = state.display_week || state.week

try {
  const user = await sleeper.getUser(config.sleeper.username)
  const leagues = await sleeper.getLeagues(user.user_id, state.season)
  for (const entry of leagues) {
    const id = entry.league_id
    const league = await sleeper.getLeague(id)
    show('sleeper league keys', Object.keys(league))
    show('sleeper settings', league.settings)
    show('sleeper roster_positions', league.roster_positions)
    show('sleeper status', { status: league.status, season_type: league.season_type, total_rosters: league.total_rosters })
    const rosters = await sleeper.getRosters(id)
    show('sleeper roster keys', Object.keys(rosters[0]))
    show('sleeper roster settings', rosters.map((roster) => ({ id: roster.roster_id, mine: roster.owner_id === user.user_id, ...roster.settings })))
    for (const w of [week - 1, week, week + 1, week + 2, 14, 15, 16, 17]) {
      const matchups = await sleeper.getMatchups(id, w)
      show(`sleeper week ${w}`, { entries: matchups.length, keys: matchups[0] ? Object.keys(matchups[0]) : [], pairs: matchups.map((m) => [m.roster_id, m.matchup_id, m.points]) })
    }
    const current = await sleeper.getMatchups(id, week)
    const mine = rosters.find((roster) => roster.owner_id === user.user_id)
    const my = current.find((m) => m.roster_id === mine?.roster_id)
    show('sleeper my matchup', {
      starters: my?.starters,
      starters_points: my?.starters_points,
      players: my?.players?.length,
      players_points: Object.entries(my?.players_points || {}).slice(0, 6),
      points: my?.points,
      custom_points: my?.custom_points
    })
    for (const path of ['winners_bracket', 'losers_bracket']) {
      const response = await fetch(`https://api.sleeper.app/v1/league/${id}/${path}`)
      const bracket = await response.json().catch(() => null)
      show(`sleeper ${path}`, { status: response.status, entries: Array.isArray(bracket) ? bracket.length : null, sample: Array.isArray(bracket) ? bracket.slice(0, 3) : bracket })
    }
    await cors('https://api.sleeper.app/v1/state/nfl')
    await cors(`https://api.sleeper.app/v1/league/${id}`)
    await cors(`https://api.sleeper.app/v1/league/${id}/rosters`)
    await cors(`https://api.sleeper.app/v1/league/${id}/matchups/${week}`)
    await cors(`https://api.sleeper.com/projections/nfl/${state.season}/${week}?season_type=regular&position[]=QB`)
    await cors(`https://api.sleeper.com/stats/nfl/${state.season}/${week}?season_type=regular&position[]=QB`)
    // Is the matchups response cached at the edge, and for how long.
    const again = await fetch(`https://api.sleeper.app/v1/league/${id}/matchups/${week}`)
    show('sleeper matchups headers', Object.fromEntries([...again.headers].filter(([key]) => /cache|age|etag|expires|cf-|date|last-mod/i.test(key))))
  }
} catch (error) {
  show('sleeper probe failed', error.stack)
}

for (const cfg of config.espn || []) {
  try {
    const league = await espn.getLeague(state.season, cfg.leagueId, week)
    show('espn top keys', Object.keys(league))
    show('espn status', league.status)
    show('espn settings keys', Object.keys(league.settings || {}))
    const schedule = league.settings?.scheduleSettings || {}
    show('espn scheduleSettings', { ...schedule, matchupPeriods: Object.keys(schedule.matchupPeriods || {}).length, divisions: (schedule.divisions || []).map((d) => ({ id: d.id, size: d.size })) })
    show('espn matchupPeriods', schedule.matchupPeriods)
    show('espn acquisitionSettings', league.settings?.acquisitionSettings)
    show('espn tradeSettings', league.settings?.tradeSettings)
    show('espn rosterSettings keys', Object.keys(league.settings?.rosterSettings || {}))
    const team = league.teams.find((t) => t.id === Number(cfg.teamId))
    show('espn team keys', Object.keys(team))
    show('espn teams', league.teams.map((t) => ({
      id: t.id, mine: t.id === Number(cfg.teamId), div: t.divisionId, seed: t.playoffSeed, projRank: t.currentProjectedRank,
      final: t.rankCalculatedFinal, clinch: t.playoffClinchType, waiverRank: t.waiverRank, points: t.points, pointsAdjusted: t.pointsAdjusted,
      overall: t.record?.overall && { w: t.record.overall.wins, l: t.record.overall.losses, t: t.record.overall.ties, pf: t.record.overall.pointsFor, pa: t.record.overall.pointsAgainst, gb: t.record.overall.gamesBack, pct: t.record.overall.percentage, streak: [t.record.overall.streakType, t.record.overall.streakLength] },
      division: t.record?.division && { w: t.record.division.wins, l: t.record.division.losses },
      sim: t.currentSimulationResults
    })))
    const matchups = await espn.getMatchups(state.season, cfg.leagueId, week)
    show('espn matchup top keys', Object.keys(matchups || {}))
    const byPeriod = {}
    for (const game of matchups?.schedule || []) {
      const key = game.matchupPeriodId
      byPeriod[key] ||= { games: 0, winners: {}, tiers: {}, withBoth: 0 }
      byPeriod[key].games++
      byPeriod[key].winners[game.winner] = (byPeriod[key].winners[game.winner] || 0) + 1
      byPeriod[key].tiers[game.playoffTierType] = (byPeriod[key].tiers[game.playoffTierType] || 0) + 1
      if (game.home?.teamId != null && game.away?.teamId != null) byPeriod[key].withBoth++
    }
    show('espn schedule by period', byPeriod)
    const sample = (matchups?.schedule || []).find((game) => game.matchupPeriodId === week)
    show('espn game keys', sample ? { game: Object.keys(sample), home: Object.keys(sample.home || {}) } : null)
    const future = (matchups?.schedule || []).filter((game) => game.matchupPeriodId === week + 1).map((game) => [game.home?.teamId, game.away?.teamId])
    show('espn next week pairs', future)
  } catch (error) {
    show('espn probe failed', error.stack)
  }
}
