import test from 'node:test'
import assert from 'node:assert/strict'
import { byeCount, playoffPicture } from '../scripts/lib/playoffs.mjs'
import { fixture } from './helpers/pipeline.mjs'

/** A league of plain teams: records, results so far, and the games still to play. */
function league({ records, results = [], pairings = [], playoffTeams = 2, lastWeek = 14, median = false, mine = 1, rosters = {} }) {
  return {
    id: 'test:1',
    teams: records.map(([teamId]) => ({ teamId, name: `Team ${teamId}`, isMine: teamId === mine, roster: rosters[teamId] || [] })),
    results,
    season: {
      playoffTeams,
      lastWeek,
      median,
      tiebreak: 'points',
      records: records.map(([teamId, wins, losses, pointsFor, division = null]) => ({ teamId, wins, losses, ties: 0, pointsFor, division })),
      pairings
    }
  }
}
const odds = (picture) => Object.fromEntries(picture.rows.map((row) => [row.teamId, row.odds]))
const sum = (picture) => picture.rows.reduce((total, row) => total + row.odds, 0)

test('the mocked leagues: odds add up, and both platforms agree', () => {
  const [sleeper, espn] = fixture().leagues
  for (const entry of [sleeper, espn]) {
    const picture = entry.playoffs
    assert.equal(entry.season, undefined, 'the outline is an input and is not shipped')
    assert.deepEqual([picture.playoffTeams, picture.lastWeek, picture.weeksLeft, picture.decided, picture.byes], [2, 14, 6, false, 0])
    assert.ok(Math.abs(sum(picture) - 2) < 0.01, `two teams qualify in every run: ${sum(picture)}`)
    assert.deepEqual(picture.rows.map((row) => [row.seed, row.name, row.wins, row.losses]), [
      [1, 'Team Taco', 6, 2], [2, 'Bench Mob', 5, 3], [3, 'Gridiron Grinders', 3, 5], [4, 'Punt Gods', 2, 6]
    ])
    assert.equal(picture.mine.seed, 3)
    assert.ok(picture.mine.ifWin > picture.mine.odds && picture.mine.odds > picture.mine.ifLose, JSON.stringify(picture.mine))
    assert.ok(picture.mine.winChance > 0.05 && picture.mine.winChance < 0.5, 'an underdog this week, against a stronger lineup')
  }
  // The same league on two platforms, so the two estimates agree within noise.
  assert.ok(Math.abs(sleeper.playoffs.mine.odds - espn.playoffs.mine.odds) < 0.03)
})

test('the same inputs give the same odds', () => {
  const input = () => league({ records: [[1, 4, 4, 800], [2, 4, 4, 790], [3, 4, 4, 780], [4, 4, 4, 770]], pairings: [{ week: 9, a: 1, b: 2 }, { week: 9, a: 3, b: 4 }, { week: 10, a: 1, b: 3 }, { week: 10, a: 2, b: 4 }] })
  assert.deepEqual(playoffPicture(input(), { week: 9 }), playoffPicture(input(), { week: 9 }))
})

test('a finished regular season is settled, not estimated', () => {
  const picture = playoffPicture(league({ records: [[1, 8, 6, 1500], [2, 9, 5, 1400], [3, 8, 6, 1550], [4, 3, 11, 1300]], pairings: [] }), { week: 15 })
  assert.equal(picture.decided, true)
  assert.equal(picture.weeksLeft, 0)
  assert.deepEqual(odds(picture), { 2: 1, 3: 1, 1: 0, 4: 0 }, 'points break the tie between the 8-6 teams')
  assert.deepEqual(picture.rows.map((row) => row.teamId), [2, 3, 1, 4])
  assert.deepEqual([picture.mine.seed, picture.mine.odds, picture.mine.ifWin, picture.mine.ifLose, picture.mine.winChance], [3, 0, null, null, null])
})

test('a team that cannot be caught is in, and one that cannot catch up is out', () => {
  // One week left. Team 1 is three games clear, team 4 three games back.
  const picture = playoffPicture(
    league({ records: [[1, 12, 1, 1700], [2, 7, 6, 1500], [3, 7, 6, 1490], [4, 0, 13, 1100]], pairings: [{ week: 14, a: 1, b: 4 }, { week: 14, a: 2, b: 3 }] }),
    { week: 14 }
  )
  assert.equal(odds(picture)[1], 1)
  assert.equal(odds(picture)[4], 0)
  assert.ok(Math.abs(odds(picture)[2] + odds(picture)[3] - 1) < 1e-9, 'the last spot goes to whoever wins the other game')
  assert.ok(odds(picture)[2] > 0.3 && odds(picture)[2] < 0.7)
})

test('this week plays out from the lineups, and shows what the game is worth', () => {
  const starter = (playerId, projected) => ({ playerId, position: 'WR', slot: 'WR', starter: true, projected, game: { kickoffISO: '2026-11-08T18:00:00Z' } })
  const lineup = (prefix, projected) => Array.from({ length: 9 }, (_, index) => starter(`${prefix}${index}`, projected))
  const strong = lineup('s', 15)
  const weak = lineup('w', 5)
  const input = league({
    records: [[1, 7, 6, 1500], [2, 7, 6, 1490], [3, 9, 4, 1600], [4, 2, 11, 1200]],
    pairings: [{ week: 14, a: 1, b: 2 }, { week: 14, a: 3, b: 4 }],
    rosters: { 1: strong, 2: weak }
  })
  const picture = playoffPicture(input, { week: 14, asOf: Date.parse('2026-11-03T16:00:00Z') })
  assert.ok(picture.mine.winChance > 0.97, `a heavy favorite: ${picture.mine.winChance}`)
  assert.equal(picture.mine.ifWin, 1, 'win and you are in')
  assert.ok(picture.mine.odds > 0.97)
  // The other way round the loss side has enough runs to report, and it is the end.
  input.teams[0].roster = weak
  input.teams[1].roster = strong
  const reverse = playoffPicture(input, { week: 14, asOf: Date.parse('2026-11-03T16:00:00Z') })
  assert.ok(reverse.mine.winChance < 0.03)
  assert.equal(reverse.mine.ifLose, 0)
  assert.equal(reverse.mine.ifWin, null, 'too few winning runs to say')
})

test('division winners are seeded ahead of a better record', () => {
  const picture = playoffPicture(
    league({ records: [[1, 9, 5, 1500, 'east'], [2, 8, 6, 1480, 'east'], [3, 5, 9, 1300, 'west'], [4, 4, 10, 1250, 'west']], pairings: [] }),
    { week: 15 }
  )
  assert.deepEqual(picture.rows.map((row) => row.teamId), [1, 3, 2, 4])
  assert.deepEqual(odds(picture), { 1: 1, 3: 1, 2: 0, 4: 0 })
})

test('results on file win over a platform record that is a week behind', () => {
  // The platform still says 1-0 and 0-1 after week 2 was played.
  const results = [
    { week: 1, a: 1, aPoints: 120, b: 2, bPoints: 100 },
    { week: 2, a: 1, aPoints: 90, b: 2, bPoints: 110 }
  ]
  const picture = playoffPicture(league({ records: [[1, 1, 0, 120], [2, 0, 1, 100]], results, pairings: [], playoffTeams: 1, lastWeek: 2 }), { week: 3 })
  assert.deepEqual(picture.rows.map((row) => [row.teamId, row.wins, row.losses, row.pointsFor]), [[1, 1, 1, 210], [2, 1, 1, 210]])
  // And the platform's record stands when it covers at least as much.
  const short = playoffPicture(league({ records: [[1, 2, 0, 250], [2, 0, 2, 190]], results: results.slice(0, 1), pairings: [], playoffTeams: 1, lastWeek: 2 }), { week: 3 })
  assert.deepEqual(short.rows.map((row) => [row.teamId, row.wins, row.losses]), [[1, 2, 0], [2, 0, 2]])
})

test('a median league counts the extra game each week', () => {
  const results = [
    { week: 1, a: 1, aPoints: 130, b: 2, bPoints: 120 },
    { week: 1, a: 3, aPoints: 90, b: 4, bPoints: 80 }
  ]
  // The platform has not closed the week, so records come from the results: team 2
  // lost its game but beat the median, and team 3 won its game but did not.
  const picture = playoffPicture(league({ records: [[1, 0, 0, 0], [2, 0, 0, 0], [3, 0, 0, 0], [4, 0, 0, 0]], results, pairings: [], median: true, lastWeek: 1 }), { week: 2 })
  assert.deepEqual(picture.rows.map((row) => [row.teamId, row.wins, row.losses]), [[1, 2, 0], [2, 1, 1], [3, 1, 1], [4, 0, 2]])
  assert.equal(picture.median, true)
})

test('byes for the top seeds, and no picture without playoff settings', () => {
  assert.deepEqual([4, 5, 6, 7, 8, 2, 1].map(byeCount), [0, 3, 2, 1, 0, 0, 0])
  const six = playoffPicture(league({ records: [[1, 9, 0, 900], [2, 8, 1, 890], [3, 7, 2, 880], [4, 6, 3, 870], [5, 5, 4, 860], [6, 4, 5, 850], [7, 0, 9, 700]], playoffTeams: 6, pairings: [] }), { week: 15 })
  assert.equal(six.byes, 2)
  assert.deepEqual(six.rows.map((row) => row.byeOdds), [1, 1, 0, 0, 0, 0, 0])
  assert.equal(playoffPicture({ id: 'x', teams: [], results: [] }, { week: 3 }), null)
  assert.equal(playoffPicture(league({ records: [[1, 1, 0, 100]], playoffTeams: 0 }), { week: 3 }), null)
})
