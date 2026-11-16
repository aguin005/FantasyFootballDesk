import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The schedule module reads its cache relative to the working directory, so the
// fixture is written to a scratch directory and the module is loaded from there.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-test-'))
fs.mkdirSync(path.join(dir, '.cache'))
const header =
  'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,spread_line,total_line,espn'
const teams = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LA', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
]
const rows = []
// Week 7: every team plays, Sunday October 25, before clocks change.
for (let i = 0; i < 32; i += 2) {
  const line = i === 0 ? '3.5,47.5' : ','
  const score = i === 2 ? ['17', '24'] : ['', '']
  rows.push(`2026_07_${i},2026,REG,7,2026-10-25,Sunday,13:00,${teams[i]},${score[0]},${teams[i + 1]},${score[1]},${line},40${i}`)
}
// Week 10: ARI and ATL on bye, Sunday November 8, after clocks change.
for (let i = 2; i < 32; i += 2) {
  rows.push(`2026_10_${i},2026,REG,10,2026-11-08,Sunday,16:25,${teams[i]},,${teams[i + 1]},,,,`)
}
// Week 12: only two games on file, which says nothing about byes.
rows.push('2026_12_a,2026,REG,12,2026-11-26,Thursday,,DAL,,DET,,,,')
rows.push('2026_12_b,2026,REG,12,2026-11-29,Sunday,13:00,BUF,,KC,,,,')
rows.push('2026_19_x,2026,WC,19,2027-01-16,Saturday,16:30,BUF,,KC,,,,')
fs.writeFileSync(path.join(dir, '.cache', 'nflverse-games.csv'), [header, ...rows].join('\n'))
process.chdir(dir)
const schedule = await import('../scripts/lib/schedule.mjs')
const { attachGame, attachNextGame, inGameWindow, loadByeWeeks, loadSchedule, seasonWeek, weekFinished, weekSchedule } = schedule

const quiet = async (work) => {
  const log = console.log
  console.log = () => {}
  try {
    return await work()
  } finally {
    console.log = log
  }
}

test('kickoffs become UTC instants on both sides of the clock change', async () => {
  const seven = await quiet(() => loadSchedule(2026, 7))
  const ten = await quiet(() => loadSchedule(2026, 10))
  assert.equal(seven.get('ATL').kickoffISO, '2026-10-25T17:00:00.000Z', '1:00 PM Eastern daylight time')
  assert.equal(ten.get('BUF').kickoffISO, '2026-11-08T21:25:00.000Z', '4:25 PM Eastern standard time')
})

test('team aliases, sides, scores and lines', async () => {
  const seven = await quiet(() => loadSchedule(2026, 7))
  assert.equal(seven.size, 32)
  assert.ok(seven.has('LAR') && seven.has('WSH') && !seven.has('LA') && !seven.has('WAS'))
  // The spread is from the home side, positive when the home team is favored.
  const home = seven.get('ATL')
  const away = seven.get('ARI')
  assert.deepEqual([home.home, home.opponent, home.spread, home.total, home.teamImplied, home.opponentImplied], [true, 'ARI', 3.5, 47.5, 25.5, 22])
  assert.deepEqual([away.home, away.opponent, away.spread, away.teamImplied, away.opponentImplied], [false, 'ATL', -3.5, 22, 25.5])
  assert.deepEqual([seven.get('BUF').score, seven.get('BUF').opponentScore, seven.get('BAL').score], [24, 17, 17])
  assert.equal(seven.get('CIN').total, null, 'no line posted yet')
  const player = attachGame({ team: 'WAS' }, seven)
  assert.equal(player.game.matchup, 'vs TEN')
  assert.equal(attachGame({ team: 'FA' }, seven).game, null)
  assert.deepEqual(attachNextGame({ team: 'ARI' }, await quiet(() => loadSchedule(2026, 10))).nextGame, null)
})

test('bye weeks come only from weeks with a full slate', async () => {
  const byes = await quiet(() => loadByeWeeks(2026))
  assert.deepEqual(byes, { ARI: 10, ATL: 10 })
})

test('the week view lists each game once, in order, with the teams on bye', async () => {
  const ten = await quiet(() => loadSchedule(2026, 10))
  const view = weekSchedule(ten, 10)
  assert.equal(view.games.length, 15)
  assert.deepEqual(view.byes, ['ARI', 'ATL'])
  assert.deepEqual(weekSchedule(new Map(), 3).byes, [], 'an empty schedule is a failed load, not 32 byes')
})

test('a week is finished four hours after its last kickoff', async () => {
  const seven = await quiet(() => loadSchedule(2026, 7))
  const kickoff = Date.parse('2026-10-25T17:00:00Z')
  assert.equal(weekFinished(seven, kickoff + 3 * 3600e3), false)
  assert.equal(weekFinished(seven, kickoff + 4 * 3600e3 + 1), true)
  assert.equal(weekFinished(new Map()), false)
  const twelve = await quiet(() => loadSchedule(2026, 12))
  assert.equal(weekFinished(twelve, Date.parse('2026-12-25T00:00:00Z')), false, 'a game with no kickoff time is not finished')
})

test('the game window opens three hours before kickoff', async () => {
  const seven = await quiet(() => loadSchedule(2026, 7))
  const kickoff = Date.parse('2026-10-25T17:00:00Z')
  assert.equal(inGameWindow(seven, kickoff - 3 * 3600e3 - 1), false)
  assert.equal(inGameWindow(seven, kickoff - 3 * 3600e3), true)
  assert.equal(inGameWindow(seven, kickoff + 4 * 3600e3), true)
  assert.equal(inGameWindow(seven, kickoff + 4 * 3600e3 + 1), false)
})

test('the season week ignores preseason and playoff week numbers', () => {
  assert.equal(seasonWeek({ season_type: 'regular', week: 10, display_week: 10 }), 10)
  assert.equal(seasonWeek({ season_type: 'regular', week: 10, display_week: 11 }), 11)
  assert.equal(seasonWeek({ season_type: 'post', week: 1, display_week: 1 }), 18)
  assert.equal(seasonWeek({ season_type: 'pre', week: 3 }), 1)
  assert.equal(seasonWeek({ season_type: 'off', week: 0 }), 1)
  assert.equal(seasonWeek({ season_type: 'regular', week: 0 }), 1)
  assert.equal(seasonWeek({ week: 25 }), 18)
})
