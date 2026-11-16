// Temporary: checks this branch's refresh output on real data. Removed before merging.
import fs from 'node:fs'

const file = 'web/public/data/dashboard.json'
const d = JSON.parse(fs.readFileSync(file, 'utf8'))
const show = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
show('written', { week: d.week, generatedAt: d.generatedAt, kb: Math.round(fs.statSync(file).size / 1024), problems: d.problems })
show('stamp', fs.readFileSync('web/public/data/stamp.json', 'utf8').trim())
const bySource = {}
for (const item of d.news || []) bySource[item.source] = (bySource[item.source] || 0) + 1
show('news', { total: (d.news || []).length, bySource })
show('changes', { total: (d.changes || []).length })
for (const league of d.leagues) {
  show(`league ${league.platform}`, {
    roster: league.roster.length,
    teams: league.teams?.length,
    waivers: league.waivers?.length,
    results: league.results?.length,
    matchup: league.matchup,
    record: league.record,
    standings: league.standings ? { teams: league.standings.teams?.length, remaining: league.standings.remaining?.length, playoffTeams: league.standings.playoffTeams, lastWeek: league.standings.lastWeek } : null,
    playoffs: league.playoffs ? { mine: league.playoffs.mine, rows: league.playoffs.rows?.map((row) => [row.teamId, row.wins, row.losses, Math.round(row.pointsFor), row.seed, Number(row.odds?.toFixed(3))]) } : null,
    lineupSlots: league.lineupSlots,
    season: 'season' in league
  })
}
show('done', 'probe complete')
