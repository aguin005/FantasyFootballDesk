import test from 'node:test'
import assert from 'node:assert/strict'
import { pastResults as sleeperResults } from '../scripts/adapters/sleeper.mjs'
import { pastResults as espnResults } from '../scripts/adapters/espn.mjs'
import { swingFor } from '../scripts/lib/gamelog.mjs'

test('Sleeper results pair rosters by matchup and skip byes and unplayed weeks', () => {
  // Sleeper: pairs by matchup_id, skips byes, unplayed weeks and failed calls.
  const week1 = [
    { roster_id: 1, matchup_id: 1, points: 121.44 },
    { roster_id: 2, matchup_id: 1, points: 99.2 },
    { roster_id: 3, matchup_id: 2, points: 110 },
    { roster_id: 4, matchup_id: 2, points: 87.5, custom_points: 90 },
    { roster_id: 5, matchup_id: null, points: 0 }
  ]
  const week2 = [
    { roster_id: 1, matchup_id: 1, points: 0 },
    { roster_id: 3, matchup_id: 1, points: 0 }
  ]
  assert.deepEqual(sleeperResults([1, 2, 3], [week1, week2, []]), [
    { week: 1, a: 1, aPoints: 121.44, b: 2, bPoints: 99.2 },
    { week: 1, a: 3, aPoints: 110, b: 4, bPoints: 90 }
  ])
})

test('ESPN results cover finished periods, and a two week round takes its last week', () => {
  // ESPN: finished periods before this one, two-week playoff rounds labelled by their last week.
  const settings = { scheduleSettings: { matchupPeriods: { 1: [1], 2: [2], 3: [3], 15: [15, 16] } } }
  const schedule = [
    { matchupPeriodId: 1, winner: 'HOME', home: { teamId: 1, totalPoints: 120.5 }, away: { teamId: 4, totalPoints: 101 } },
    { matchupPeriodId: 2, winner: 'AWAY', home: { teamId: 4, totalPoints: 90 }, away: { teamId: 2, totalPoints: 95.25 } },
    { matchupPeriodId: 3, winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 30, totalPointsLive: 44 }, away: { teamId: 2, totalPoints: 0 } },
    { matchupPeriodId: 2, winner: 'HOME', home: { teamId: 3 } }
  ]
  assert.deepEqual(espnResults(schedule, settings, 3), [
    { week: 1, a: 1, aPoints: 120.5, b: 4, bPoints: 101 },
    { week: 2, a: 4, aPoints: 90, b: 2, bPoints: 95.25 }
  ])
  const playoffs = [{ matchupPeriodId: 15, winner: 'HOME', home: { teamId: 1, totalPoints: 250 }, away: { teamId: 2, totalPoints: 240 } }]
  assert.equal(espnResults(playoffs, settings, 17)[0].week, 16)
  assert.deepEqual(espnResults(null, settings, 3), [])
})

test('swing uses this season, fills in from last season early on, and needs three games', () => {
  // Swing: this season's games, filled from last season early on, null under three games.
  const logs = {
    season: 2026,
    current: new Map([
      ['1', [4, 22, 9, 30, 6, 18, 12, 25].map((standard, i) => ({ week: i + 1, standard, receptions: 0 }))],
      ['2', [10, 11].map((standard, i) => ({ week: i + 1, standard, receptions: 2 }))],
      ['3', [{ week: 1, standard: 5, receptions: 0 }]]
    ]),
    last: new Map([
      ['2', [1, 2, 3, 20, 21, 22, 23, 24, 25, 26].map((standard, i) => ({ week: i + 8, standard, receptions: 0 }))]
    ])
  }
  const boom = swingFor({ position: 'WR', espnId: '1' }, logs, 1)
  assert.equal(boom.games, 8)
  assert.equal(boom.thisSeason, 8)
  assert.equal(boom.mean, 15.8)
  assert.ok(boom.sd > 9 && boom.sd < 10, `sd ${boom.sd}`)
  assert.ok(boom.low < 7 && boom.high > 24, JSON.stringify(boom))
  const early = swingFor({ position: 'RB', espnId: '2' }, logs, 0.5)
  assert.equal(early.games, 10, 'two this season plus the last eight of last season')
  assert.equal(early.thisSeason, 2)
  assert.equal(swingFor({ position: 'TE', espnId: '3' }, logs, 1), null, 'one game is too few')
  assert.equal(swingFor({ position: 'K', espnId: '1' }, logs, 1), null, 'kickers have no log')
  assert.equal(swingFor({ position: 'WR', espnId: null }, logs, 1), null)
})
