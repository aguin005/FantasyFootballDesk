import test from 'node:test'
import assert from 'node:assert/strict'
import { byeLine, methodNote, oddsLabel, recordLabel, stakesLine, standingLine } from '../web/src/lib/playoffs.js'

const picture = (mine = {}, extra = {}) => ({
  playoffTeams: 6,
  byes: 2,
  weeksLeft: 4,
  decided: false,
  tiebreak: 'points',
  median: false,
  rows: Array.from({ length: 10 }, (_, index) => ({ seed: index + 1 })),
  mine: { seed: 7, odds: 0.24, byeOdds: 0.01, ifWin: 0.41, ifLose: 0.12, ...mine },
  ...extra
})

test('odds never read as certain while games are left', () => {
  assert.deepEqual([0, 0.004, 0.005, 0.236, 0.994, 0.995, 1].map(oddsLabel), ['<1%', '<1%', '1%', '24%', '99%', '>99%', '>99%'])
  assert.equal(oddsLabel(null), '-')
  assert.equal(recordLabel({ wins: 6, losses: 3, ties: 0 }), '6-3')
  assert.equal(recordLabel({ wins: 6, losses: 3, ties: 1 }), '6-3-1')
})

test('where you stand', () => {
  assert.equal(standingLine(picture()), '7th of 10 now. The top 6 make the playoffs, with 4 weeks left.')
  assert.equal(standingLine(picture({}, { weeksLeft: 1 })), '7th of 10 now. The top 6 make the playoffs, and this is the last week.')
  assert.equal(standingLine(picture({ seed: 3 }, { decided: true, weeksLeft: 0 })), 'You finished 3rd of 10. The top 6 made the playoffs.')
})

test('what this week is worth, only when both results are still possible', () => {
  assert.equal(stakesLine(picture()), 'This week: 41% with a win, 12% with a loss.')
  assert.equal(stakesLine(picture({ ifWin: null })), null, 'the game is all but lost')
  assert.equal(stakesLine(picture({ ifLose: null })), null, 'the game is all but won')
  assert.equal(stakesLine(picture({ ifWin: 0.996, ifLose: 0.991 })), null, 'nothing rides on it')
  assert.equal(stakesLine(picture({}, { decided: true })), null)
})

test('the bye line and the method note', () => {
  assert.equal(byeLine(picture()), null, 'a one percent shot is not worth a line')
  assert.equal(byeLine(picture({ byeOdds: 0.576 })), 'First round bye: 58%')
  assert.equal(byeLine(picture({ byeOdds: 0.576 }, { byes: 0 })), null)
  assert.match(methodNote(picture()), /20,000 times.*split by points scored\. The top 2 seeds sit out the first round\.$/)
  assert.match(methodNote(picture({}, { tiebreak: 'other', median: true, byes: 0 })), /another way.*league median\.$/)
  assert.equal(methodNote(picture({}, { decided: true })), 'The regular season is over, so these are the final standings.')
})
