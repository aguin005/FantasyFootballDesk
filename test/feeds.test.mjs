import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRosterIndex, matchToRoster, mergeNews, normalizeName, parseFeed, searchText } from '../scripts/lib/feeds.mjs'

const leagues = [
  {
    id: 'sleeper:1',
    name: 'League',
    roster: [
      { playerId: '1', name: 'Josh Allen', position: 'QB', team: 'BUF', starter: true },
      { playerId: '2', name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET', starter: true },
      { playerId: '3', name: "Ja'Marr Chase", position: 'WR', team: 'CIN', starter: true },
      { playerId: '4', name: 'Kenneth Walker III', position: 'RB', team: 'SEA', starter: false },
      { playerId: '5', name: 'DJ Moore', position: 'WR', team: 'CHI', starter: false },
      { playerId: 'BUF', name: 'Buffalo Bills', position: 'DEF', team: 'BUF', starter: true }
    ]
  }
]
const index = buildRosterIndex(leagues)
const item = (headline, summary = '') => ({ headline, summary, url: `https://example.com/${encodeURIComponent(headline)}`, published: new Date().toISOString() })
const names = (headline, summary) => matchToRoster([item(headline, summary)], index).flatMap((story) => story.players.map((player) => player.name))

test('a name matches however the headline punctuates it', () => {
  assert.deepEqual(names("Josh Allen's ankle is fine"), ['Josh Allen'])
  assert.deepEqual(names('Josh Allen: MVP favorite again'), ['Josh Allen'])
  assert.deepEqual(names('Is it time to worry about Josh Allen?'), ['Josh Allen'])
  assert.deepEqual(names('The Josh Allen-led Bills roll again'), ['Josh Allen'])
  assert.deepEqual(names('Bills QB Josh Allen (ankle) limited'), ['Josh Allen'])
  assert.deepEqual(names('Report: "Josh Allen" trending'), ['Josh Allen'])
  assert.deepEqual(names('Amon-Ra St. Brown’s targets are up'), ['Amon-Ra St. Brown'])
  assert.deepEqual(names("Ja'Marr Chase, Bengals agree to terms"), ["Ja'Marr Chase"])
  assert.deepEqual(names('Kenneth Walker’s workload is growing'), ['Kenneth Walker III'])
  assert.deepEqual(names('D.J. Moore/Rome Odunze split'), ['DJ Moore'])
  assert.deepEqual(names('Injury report', 'Seattle expects Kenneth Walker III to play.'), ['Kenneth Walker III'])
})

test('a longer or reordered name is not a match', () => {
  assert.deepEqual(names('Joshua Allenby signs with Miami'), [])
  assert.deepEqual(names('Josh Allens everywhere'), [])
  assert.deepEqual(names('Allen, Josh not listed'), [])
  assert.deepEqual(names('Buffalo Bills defense dominates'), [], 'defenses are never matched by name')
})

test('searchText reads hyphens both ways', () => {
  const [joined, split] = searchText("The Josh Allen-led offense and Amon-Ra's day")
  assert.ok(split.includes(' josh allen led '))
  assert.ok(joined.includes(' amonra day '))
})

test('duplicate headlines and old stories are dropped', () => {
  const old = { ...item('Josh Allen throws four touchdowns'), published: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() }
  const twice = [item('Josh Allen limited on Wednesday'), { ...item('Josh Allen limited on Wednesday'), source: 'Other' }, old]
  assert.equal(matchToRoster(twice, index).length, 1)
  assert.equal(mergeNews([[item('Same story')], [item('Same story!')], [item('Another')]]).length, 3)
  assert.equal(mergeNews([[item('Same story')], [item('same  STORY')]]).length, 1)
})

test('parseFeed reads RSS and Atom', () => {
  const rss = `<rss><channel><item><title><![CDATA[Chase &amp; Burrow connect]]></title><link>https://a.example/1</link><pubDate>Mon, 09 Nov 2026 15:00:00 GMT</pubDate><description>&lt;p&gt;Two scores.&lt;/p&gt;</description></item></channel></rss>`
  const atom = `<feed><entry><title>Allen&#8217;s day</title><link rel="alternate" href="https://a.example/2"/><updated>2026-11-09T15:00:00Z</updated><summary>Big game</summary></entry></feed>`
  const [first] = parseFeed(rss, 'RSS')
  assert.deepEqual([first.headline, first.url, first.summary, first.published], ['Chase & Burrow connect', 'https://a.example/1', 'Two scores.', '2026-11-09T15:00:00.000Z'])
  const [second] = parseFeed(atom, 'Atom')
  assert.deepEqual([second.headline, second.url, second.published], ['Allen’s day', 'https://a.example/2', '2026-11-09T15:00:00.000Z'])
  assert.equal(normalizeName('Amon-Ra St. Brown'), 'amonra st brown')
})
