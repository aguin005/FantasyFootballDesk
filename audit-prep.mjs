// Temporary: runs this branch's refresh output through matchup prep and prints
// what the app would show, plus checks on the new data. Removed before merging.
import fs from 'node:fs'
import { lineupReport } from './web/src/lib/lineup.js'
import { matchupReport } from './web/src/lib/matchup.js'
import { byeReport } from './web/src/lib/byes.js'
import { prepReport, chanceLabel, gainLabel, itemLine, itemNote, swapLine } from './web/src/lib/prep.js'

const file = 'web/public/data/dashboard.json'
const d = JSON.parse(fs.readFileSync(file, 'utf8'))
const now = Date.now()
console.log(`week ${d.week} generated ${d.generatedAt} size ${(fs.statSync(file).size / 1024).toFixed(0)} KB problems ${JSON.stringify(d.problems)}`)
for (const league of d.leagues) {
  console.log(`\n=== ${league.name} (${league.platform}) matchup ${JSON.stringify(league.matchup)}`)
  const weeks = {}
  for (const game of league.results || []) weeks[game.week] = (weeks[game.week] || 0) + 1
  console.log(`results: ${(league.results || []).length} games by week ${JSON.stringify(weeks)} teams ${league.teams?.length}`)
  const opponent = league.teams?.find((team) => league.matchup && String(team.teamId) === String(league.matchup.opponentTeamId))
  const swingCount = (roster) => `${roster.filter((p) => p.swing).length}/${roster.length}`
  console.log(`swing: mine ${swingCount(league.roster)}, opponent ${opponent ? swingCount(opponent.roster) : 'none'}, others ${league.teams?.filter((t) => t !== opponent && !t.isMine).some((t) => t.roster.some((p) => p.swing))}`)
  for (const p of [...league.roster, ...(opponent?.roster || [])].filter((p) => !p.swing && ['QB', 'RB', 'WR', 'TE'].includes(p.position))) {
    console.log(`  no swing: ${p.name} ${p.position} espnId ${p.espnId}`)
  }
  const report = lineupReport(league.roster, now)
  const matchup = matchupReport(league, d.generatedAt, now)
  const byes = byeReport(league, report, d.byeWeeks, d.week, now)
  const prep = prepReport(league, matchup, report, byes, now)
  if (!prep) {
    console.log(`no prep (matchup ${matchup ? (matchup.final ? 'final' : 'present') : 'missing'})`)
    continue
  }
  console.log(`vs ${prep.opponent}: ${chanceLabel(prep.chance)} as set, ${chanceLabel(prep.planned)} after the list, ${prep.status}; set ${matchup.me.projection.toFixed(1)} vs ${matchup.them.projection.toFixed(1)}, likely ${prep.myProjection.toFixed(1)} vs ${prep.theirProjection.toFixed(1)}; started ${matchup.started} live ${matchup.live}`)
  for (const item of prep.items) console.log(`  [${gainLabel(item.gain) ?? '-'}] ${itemLine(item)} | ${itemNote(item)}`)
  for (const swap of prep.theirSwaps) console.log(`  them: ${swapLine(swap)}`)
  console.log(`  edges mine ${prep.edges.mine.map((e) => `${e.slot} ${e.mine.name} +${e.diff.toFixed(1)}`).join(', ')} | theirs ${prep.edges.theirs.map((e) => `${e.slot} ${e.theirs.name} ${e.diff.toFixed(1)}`).join(', ')}`)
  console.log(`  recent them ${prep.recent.them.games.map((g) => `w${g.week} ${g.points} ${g.outcome} vs ${g.opponent}`).join('; ')} avg ${prep.recent.them.average?.toFixed(1)}`)
  console.log(`  recent me ${prep.recent.me.games.map((g) => `w${g.week} ${g.points} ${g.outcome}`).join('; ')} avg ${prep.recent.me.average?.toFixed(1)} (record ${league.record})`)
  console.log(`  series ${prep.series.map((g) => `w${g.week} ${g.outcome} ${g.points}-${g.against}`).join(', ') || 'first meeting'}`)
  // Starters' spreads, to sanity check the model on real players.
  const spreads = matchup.me.rows.map((row) => `${row.player.name.split(' ').pop()} ${row.expected.toFixed(1)}±${(row.player.swing ? row.player.swing.sd : NaN).toFixed?.(1)} rem ${row.remaining.toFixed(2)}`)
  console.log(`  my rows: ${spreads.join(', ')}`)
}
