// Preloaded with --import ahead of scripts/refresh.mjs: replaces fetch with fixtures
// for every service the refresh calls, so the whole pipeline runs with no network.
//
// The season is 2026 and the default clock is Tuesday November 3, in week 9, with
// one four team league on each platform holding the same rosters. Your team is
// down a starter to injury (James Cook) and one to a bye (Pat Freiermuth), starts
// a weak defense that a free agent beats, and has a boom-or-bust receiver on the
// bench. The opponent has two starters on bye and one out, each with a bench
// player to cover. MOCK_NOW moves the clock and MOCK_WEEK moves Sleeper's week.

const NOW = Date.parse(process.env.MOCK_NOW || '2026-11-03T16:00:00Z')
const WEEK = Number(process.env.MOCK_WEEK || 9)

const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [NOW]))
  }
  static now() {
    return NOW
  }
}

// id, name, position, team, week 9 projection, season projection, injury, scores in weeks 1 to 8
const P = (id, name, position, team, proj, season, injury = null, scores = null) => ({ id, name, position, team, proj, season, injury, scores })
const mine = [
  P('1001', 'Josh Allen', 'QB', 'BUF', 22.5, 380, null, [24, 21, 30, 18, 0, 26, 22, 19]),
  P('1002', 'Bijan Robinson', 'RB', 'ATL', 18.2, 300, null, [20, 15, 22, 17, 19, 0, 16, 21]),
  P('1003', 'James Cook', 'RB', 'BUF', 0, 220, 'Out', [14, 16, 9, 18, 0, 12, 15, 4]),
  P('1004', "Ja'Marr Chase", 'WR', 'CIN', 19.0, 310, null, [22, 9, 31, 17, 20, 14, 0, 25]),
  P('1005', 'Garrett Wilson', 'WR', 'NYJ', 14.5, 240, null, [12, 18, 10, 15, 0, 16, 13, 17]),
  P('1006', 'Pat Freiermuth', 'TE', 'PIT', 0, 140, null, [8, 6, 11, 9, 7, 0, 10, 8]),
  P('1007', 'Jaylen Waddle', 'WR', 'MIA', 12.0, 210, null, [12, 11, 13, 12, 0, 11, 13, 12]),
  P('1008', 'Brandon Aubrey', 'K', 'DAL', 9.0, 150),
  P('NYG', 'New York Giants', 'DEF', 'NYG', 4.0, 90),
  // Bench
  P('1009', 'Chuba Hubbard', 'RB', 'CAR', 12.5, 190, null, [11, 14, 9, 13, 12, 0, 15, 10]),
  P('1010', 'Tyjae Spears', 'RB', 'TEN', 0, 120, null, [6, 9, 4, 8, 7, 5, 0, 6]),
  P('1011', 'Romeo Doubs', 'WR', 'GB', 11.2, 170, null, [2, 25, 3, 22, 4, 19, 1, 24]),
  P('1012', 'Rashid Shaheed', 'WR', 'SEA', 6.5, 80, null, [5, 3, 9, 4, 6, 2, 7, 5]),
  P('1013', 'Geno Smith', 'QB', 'LV', 14.0, 230, null, [15, 12, 17, 14, 0, 16, 13, 11])
]
const theirs = [
  P('2001', 'Lamar Jackson', 'QB', 'BAL', 27.0, 400, null, [28, 22, 31, 25, 0, 27, 24, 30]),
  P('2002', 'Saquon Barkley', 'RB', 'PHI', 21.0, 320, null, [25, 18, 21, 0, 23, 19, 20, 22]),
  P('2003', 'Tony Pollard', 'RB', 'TEN', 0, 180, null, [12, 9, 14, 11, 10, 13, 0, 12]),
  P('2004', 'CeeDee Lamb', 'WR', 'DAL', 19.0, 300, null, [21, 17, 24, 15, 0, 19, 22, 18]),
  P('2005', 'Calvin Ridley', 'WR', 'TEN', 0, 190, null, [14, 7, 16, 10, 12, 9, 0, 13]),
  P('2006', 'Sam LaPorta', 'TE', 'DET', 0, 160, 'Out', [9, 12, 8, 0, 11, 10, 7, 9]),
  P('2007', 'Zay Flowers', 'WR', 'BAL', 17.0, 230, null, [16, 18, 14, 20, 0, 17, 15, 19]),
  P('2008', 'Jake Bates', 'K', 'DET', 9.0, 140),
  P('DEN', 'Denver Broncos', 'DEF', 'DEN', 8.0, 120),
  // Bench
  P('2009', 'Rachaad White', 'RB', 'TB', 12.0, 170, null, [10, 13, 11, 12, 9, 14, 0, 12]),
  P('2010', 'Jauan Jennings', 'WR', 'SF', 11.0, 160, null, [9, 12, 10, 13, 11, 0, 10, 12]),
  P('2011', 'Tucker Kraft', 'TE', 'GB', 9.5, 130, null, [8, 10, 9, 11, 7, 10, 0, 9])
]
const third = [
  P('3001', 'Jalen Hurts', 'QB', 'PHI', 21, 340), P('3002', 'Derrick Henry', 'RB', 'BAL', 17, 280),
  P('3003', 'Kyren Williams', 'RB', 'LAR', 15, 250), P('3004', 'Justin Jefferson', 'WR', 'MIN', 18, 290),
  P('3005', 'Puka Nacua', 'WR', 'LAR', 17, 280), P('3006', 'Trey McBride', 'TE', 'ARI', 11, 180),
  P('3007', 'DK Metcalf', 'WR', 'PIT', 0, 200), P('3008', 'Cameron Dicker', 'K', 'LAC', 8.5, 140),
  P('PHI', 'Philadelphia Eagles', 'DEF', 'PHI', 7, 120)
]
const fourth = [
  P('4001', 'Joe Burrow', 'QB', 'CIN', 20, 330), P('4002', 'Jahmyr Gibbs', 'RB', 'DET', 18, 300),
  P('4003', 'Breece Hall', 'RB', 'NYJ', 14, 230), P('4004', 'Amon-Ra St. Brown', 'WR', 'DET', 18, 290),
  P('4005', 'Nico Collins', 'WR', 'HOU', 16, 260), P('4006', 'George Kittle', 'TE', 'SF', 11, 180),
  P('4007', 'Tee Higgins', 'WR', 'CIN', 14, 220), P('4008', "Ka'imi Fairbairn", 'K', 'HOU', 8, 140),
  P('BAL', 'Baltimore Ravens', 'DEF', 'BAL', 6.5, 110)
]
const free = [
  P('5001', 'Jake Ferguson', 'TE', 'DAL', 10.5, 150, null, [9, 11, 8, 12, 10, 0, 11, 9]),
  P('5002', 'Hunter Henry', 'TE', 'NE', 9.0, 130, null, [8, 9, 7, 10, 9, 8, 0, 9]),
  P('5003', 'Jalen Coker', 'WR', 'CAR', 9.5, 120, null, [7, 10, 12, 8, 9, 0, 11, 10]),
  P('5004', 'Kendre Miller', 'RB', 'NO', 8.0, 100, null, [6, 9, 7, 8, 10, 0, 7, 8]),
  P('5005', 'Bo Nix', 'QB', 'DEN', 17.0, 280, null, [16, 19, 14, 18, 0, 17, 20, 15]),
  P('5006', 'Tyler Allgeier', 'RB', 'ATL', 7.5, 110, 'Questionable', [5, 8, 6, 9, 7, 0, 8, 6]),
  P('LAC', 'Los Angeles Chargers', 'DEF', 'LAC', 8.5, 120),
  P('CHI', 'Chicago Bears', 'DEF', 'CHI', 6.0, 100),
  P('5007', 'Wil Lutz', 'K', 'DEN', 8.0, 130)
]
const squads = [mine, theirs, third, fourth]
const everyone = [...squads.flat(), ...free]
const espnId = (p) => (p.position === 'DEF' ? null : String(Number(p.id) + 10000))

// The four teams' results in weeks 1 to 8, which also set their records. You beat
// Team Taco, roster 2, in week 3 and face them again in week 9.
const pairings = {
  1: [[1, 3], [2, 4]], 2: [[1, 4], [2, 3]], 3: [[1, 2], [3, 4]], 4: [[1, 3], [2, 4]], 5: [[1, 4], [2, 3]], 6: [[1, 3], [2, 4]],
  7: [[1, 4], [2, 3]], 8: [[1, 3], [2, 4]], 9: [[1, 2], [3, 4]], 10: [[1, 3], [2, 4]], 11: [[1, 4], [2, 3]], 12: [[1, 2], [3, 4]],
  13: [[1, 3], [2, 4]], 14: [[1, 4], [2, 3]]
}
const totals = {
  1: [118.2, 125.6, 101.3, 97.4], 2: [104.9, 131.2, 99.8, 110.1], 3: [121.4, 99.2, 108.7, 93.5], 4: [96.3, 117.8, 112.4, 101.9],
  5: [130.1, 109.4, 95.2, 104.6], 6: [99.7, 132.4, 118.3, 100.2], 7: [112.6, 98.1, 105.5, 121.7], 8: [108.4, 120.6, 114.9, 96.8]
}
const played = Math.min(WEEK - 1, 8)
const records = [1, 2, 3, 4].map((id) => {
  const record = { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
  for (let week = 1; week <= played; week++) {
    const [a, b] = pairings[week].find((pair) => pair.includes(id))
    const other = a === id ? b : a
    record.pointsFor += totals[week][id - 1]
    record.pointsAgainst += totals[week][other - 1]
    if (totals[week][id - 1] > totals[week][other - 1]) record.wins++
    else record.losses++
  }
  return record
})

// ---- nflverse -----------------------------------------------------------------

// The byes are the real ones for 2026, in nflverse's own abbreviations.
const NFL = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LA', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS']
const BYES = { 9: ['PIT', 'TEN'], 10: ['CHI', 'TB', 'PHI', 'DEN'], 11: ['SEA', 'NE', 'LA', 'CLE', 'ATL', 'GB'] }
const day = (week, offset) => new RealDate(RealDate.UTC(2026, 10, 5 + (week - 9) * 7 + offset)).toISOString().slice(0, 10)
function gamesCsv() {
  const rows = ['game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,spread_line,total_line,espn']
  for (const week of [9, 10, 11]) {
    const playing = NFL.filter((team) => !BYES[week].includes(team))
    const order = [...playing.slice(week), ...playing.slice(0, week)]
    for (let i = 0; i < order.length; i += 2) {
      const first = i === 0
      const last = i === order.length - 2
      const when = first ? [day(week, 0), 'Thursday', '20:15'] : last ? [day(week, 4), 'Monday', '20:15'] : [day(week, 3), 'Sunday', '13:00']
      const line = i % 4 === 0 ? `${(i % 3) - 2.5},${42.5 + (i % 5)}` : ','
      rows.push(`2026_${week}_${order[i]}_${order[i + 1]},2026,REG,${week},${when[0]},${when[1]},${when[2]},${order[i]},,${order[i + 1]},,${line},40${week}${i}`)
    }
  }
  return rows.join('\n')
}

// Weekly scores are standard points with no receptions, so every scoring format
// reads them the same.
const logged = everyone.filter((p) => p.scores)
const playersCsv = ['gsis_id,espn_id,pfr_id,display_name,position', ...logged.map((p) => `00-${p.id},${espnId(p)},${p.id},${p.name},${p.position}`)].join('\n')
const weeklyCsv = [
  'player_id,season,week,season_type,opponent_team,fantasy_points,fantasy_points_ppr,receptions,position,targets,carries,target_share',
  ...logged.flatMap((p) =>
    p.scores.map((score, i) => (score > 0 ? `00-${p.id},2026,${i + 1},REG,NYJ,${score},${score},0,${p.position},4,6,0.12` : null)).filter(Boolean)
  )
].join('\n')

// ---- Sleeper ------------------------------------------------------------------

const players = {}
for (const p of everyone) {
  const [first, ...rest] = p.name.split(' ')
  players[p.id] = {
    player_id: p.id,
    full_name: p.position === 'DEF' ? undefined : p.name,
    first_name: first,
    last_name: rest.join(' '),
    position: p.position,
    fantasy_positions: [p.position],
    team: p.team === 'WSH' ? 'WAS' : p.team,
    active: true,
    espn_id: espnId(p),
    gsis_id: p.position === 'DEF' ? null : `00-${p.id}`,
    search_rank: 50,
    injury_status: p.injury,
    injury_body_part: p.injury ? 'Ankle' : null
  }
}
const stats = (points) => ({ pts_ppr: points, pts_half_ppr: points * 0.9, pts_std: points * 0.8 })
const projections = (week) =>
  everyone.map((p) => ({ player_id: p.id, stats: stats(week === 9 ? p.proj : week ? Math.max(0, p.proj || p.season / 17) : p.season) }))

const ids = (list) => list.map((p) => p.id)
const rosters = squads.map((squad, index) => ({
  roster_id: index + 1,
  owner_id: `u${index + 1}`,
  players: ids(squad),
  starters: ids(squad.slice(0, 9)),
  reserve: [],
  settings: {
    wins: records[index].wins,
    losses: records[index].losses,
    ties: 0,
    fpts: Math.floor(records[index].pointsFor),
    fpts_decimal: Math.round((records[index].pointsFor % 1) * 100),
    fpts_against: Math.floor(records[index].pointsAgainst),
    fpts_against_decimal: Math.round((records[index].pointsAgainst % 1) * 100)
  }
}))
const users = [
  { user_id: 'u1', display_name: 'artnjelo', metadata: { team_name: 'Gridiron Grinders' } },
  { user_id: 'u2', display_name: 'tacotuesday', metadata: { team_name: 'Team Taco' } },
  { user_id: 'u3', display_name: 'bench', metadata: { team_name: 'Bench Mob' } },
  { user_id: 'u4', display_name: 'punt', metadata: { team_name: 'Punt Gods' } }
]
const matchups = (week) => {
  if (!pairings[week]) return []
  const done = week <= played
  return pairings[week].flatMap(([a, b], index) =>
    [a, b].map((id) => ({
      roster_id: id,
      matchup_id: index + 1,
      points: done ? totals[week][id - 1] : 0,
      starters: rosters[id - 1].starters,
      players: rosters[id - 1].players,
      players_points: {}
    }))
  )
}

// ---- ESPN ---------------------------------------------------------------------

const PRO_TEAM = {
  ATL: 1, BUF: 2, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, TEN: 10, IND: 11, KC: 12, LV: 13, LAR: 14, MIA: 15,
  MIN: 16, NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, ARI: 22, PIT: 23, LAC: 24, SF: 25, SEA: 26, TB: 27, WSH: 28, CAR: 29,
  JAX: 30, BAL: 33, HOU: 34
}
const POSITION_ID = { QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 16 }
const SLOT_ID = { QB: 0, RB: 2, WR: 4, TE: 6, FLEX: 23, K: 17, DEF: 16, BE: 20 }
const LINEUP = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF']
const espnPlayer = (p) => ({
  id: p.position === 'DEF' ? -16000 - PRO_TEAM[p.team] : Number(espnId(p)),
  fullName: p.position === 'DEF' ? `${p.name.split(' ').pop()} D/ST` : p.name,
  defaultPositionId: POSITION_ID[p.position],
  proTeamId: PRO_TEAM[p.team],
  injuryStatus: p.injury ? p.injury.toUpperCase() : 'ACTIVE',
  stats: [
    { statSourceId: 1, scoringPeriodId: WEEK, appliedTotal: p.proj },
    { statSourceId: 1, scoringPeriodId: 0, appliedTotal: p.season }
  ],
  ownership: { percentOwned: 12.4, percentChange: 1.5 }
})
const espnTeams = squads.map((squad, index) => ({
  id: index + 1,
  name: users[index].metadata.team_name,
  divisionId: 0,
  playoffSeed: index + 1,
  points: records[index].pointsFor,
  record: { overall: { ...records[index], ties: 0 } },
  roster: { entries: squad.map((p, slot) => ({ lineupSlotId: SLOT_ID[LINEUP[slot] || 'BE'], playerPoolEntry: { player: espnPlayer(p) } })) }
}))
const espnLeague = {
  settings: {
    name: 'Los Hermanos Klub',
    scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: [{ statId: 53, points: 1 }] },
    rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 17: 1, 16: 1, 20: 6, 21: 1 } },
    scheduleSettings: {
      matchupPeriodCount: 14,
      playoffTeamCount: 2,
      playoffSeedingRule: 'TOTAL_POINTS_SCORED',
      divisions: [{ id: 0, size: 4 }],
      matchupPeriods: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, [i + 1]]))
    }
  },
  status: { currentMatchupPeriod: WEEK, finalScoringPeriod: 17 },
  teams: espnTeams
}
const espnSchedule = {
  schedule: Object.entries(pairings).flatMap(([week, games]) =>
    games.map(([home, away]) => {
      const done = Number(week) <= played
      const points = (id) => (done ? totals[week][id - 1] : 0)
      return {
        matchupPeriodId: Number(week),
        winner: !done ? 'UNDECIDED' : points(home) > points(away) ? 'HOME' : 'AWAY',
        home: { teamId: home, totalPoints: points(home) },
        away: { teamId: away, totalPoints: points(away) }
      }
    })
  )
}
const espnFree = (url, options) => {
  const defensesOnly = (options?.headers?.['x-fantasy-filter'] || '').includes('"filterSlotIds":{"value":[16]}')
  return { players: free.filter((p) => !defensesOnly || p.position === 'DEF').map((p) => ({ player: espnPlayer(p) })) }
}

// ---- Routing ------------------------------------------------------------------

// First match wins, so the more specific path comes first.
const routes = [
  ['/state/nfl', { season: '2026', week: WEEK, display_week: WEEK, season_type: process.env.MOCK_SEASON_TYPE || 'regular' }],
  ['/user/artnjelo', { user_id: 'u1', display_name: 'artnjelo' }],
  ['/user/u1/leagues/nfl/2026', [{ league_id: 'L1', name: 'Blood, Sweat, and Beers' }]],
  ['/league/L1/rosters', rosters],
  ['/league/L1/users', users],
  ['/league/L1/matchups/', (url) => matchups(Number(url.split('/matchups/')[1]))],
  ['/league/L1', {
    league_id: 'L1',
    name: 'Blood, Sweat, and Beers',
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'],
    scoring_settings: { rec: 1 },
    settings: { playoff_teams: 2, playoff_week_start: 15, league_average_match: 0, num_teams: 4 }
  }],
  ['/players/nfl/trending', [{ player_id: '5001', count: 4200 }, { player_id: 'LAC', count: 1800 }]],
  ['/players/nfl', players],
  ['/projections/nfl/2026/', (url) => projections(Number(url.split('/projections/nfl/2026/')[1].split('?')[0]))],
  ['/projections/nfl/2026?', projections(null)],
  ['/stats/nfl/', []],
  ['view=kona_player_info', espnFree],
  ['view=mMatchupScore', espnSchedule],
  ['leagues/123', espnLeague],
  ['nfldata/master/data/games.csv', gamesCsv(), 'text'],
  ['players/players.csv', playersCsv, 'text'],
  ['stats_player_week_2026.csv', weeklyCsv, 'text'],
  ['site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', { injuries: [{ injuries: [{ athlete: { id: '11003' }, status: 'Out', shortComment: 'Ankle' }] }] }],
  ['site.api.espn.com', {
    articles: [{ headline: 'Allen sharp in practice', description: 'Full go.', published: new RealDate(NOW - 3600e3).toISOString(), links: { web: { href: 'https://espn.example/allen' } }, categories: [{ athleteId: 11001 }] }]
  }],
  ['rotowire.com/rss', `<rss><channel>
    <item><title>Bijan Robinson's workload keeps growing</title><link>https://rw.example/1</link><pubDate>${new RealDate(NOW - 7200e3).toUTCString()}</pubDate><description>Falcons lean on him.</description></item>
    <item><title>Week 9 waiver wire pickups</title><link>https://rw.example/waivers</link><pubDate>${new RealDate(NOW - 9000e3).toUTCString()}</pubDate><description>Adds for the week.</description></item>
    <item><title>Unrelated: Patrick Mahomes throws</title><link>https://rw.example/2</link><pubDate>${new RealDate(NOW - 7200e3).toUTCString()}</pubDate><description>Nothing here.</description></item>
  </channel></rss>`, 'text'],
  ['rw.example/waivers', `<html><body><article>${'Jake Ferguson is the top add this week. '.repeat(20)} Drop Hunter Henry if you must. Jalen Coker's role is growing too.</article></body></html>`, 'text']
]

globalThis.__requested = []
globalThis.fetch = async (input, options) => {
  const url = String(input)
  globalThis.__requested.push(url)
  const hit = routes.find(([key]) => url.includes(key))
  if (!hit) return new Response('not found', { status: 404 })
  const body = typeof hit[1] === 'function' ? hit[1](url, options) : hit[1]
  return new Response(hit[2] === 'text' ? body : JSON.stringify(body), { status: 200 })
}
if (process.env.MOCK_REQUEST_LOG) {
  process.on('exit', () => {
    // Synchronous, since nothing asynchronous runs once the process is exiting.
    process.getBuiltinModule('node:fs').writeFileSync(process.env.MOCK_REQUEST_LOG, globalThis.__requested.join('\n'))
  })
}
