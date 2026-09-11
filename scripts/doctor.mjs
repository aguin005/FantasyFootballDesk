import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Works out which of the several things that produce an ESPN 401 is actually
 * happening, since they all look identical from the refresh script.
 *
 * Run with: npm run doctor
 */

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const raw = { s2: process.env.ESPN_S2, swid: process.env.SWID }
const s2 = (raw.s2 || '').trim().replace(/^["']|["']$/g, '')
const swid = (raw.swid || '').trim().replace(/^["']|["']$/g, '')

function line(label, value) {
  console.log(`${label.padEnd(26)} ${value}`)
}

async function main() {
  console.log('\nEnvironment\n')

  if (!raw.s2 || !raw.swid) {
    line('ESPN_S2', raw.s2 ? `${s2.length} characters` : 'NOT SET')
    line('SWID', raw.swid ? `${swid.length} characters` : 'NOT SET')
    console.log(
      '\nThe variables are not in this shell. Run this first, from the project folder:\n' +
        '  set -a && source .env && set +a\n' +
        'Then run npm run doctor again. Every 401 you have seen so far is explained by this alone.\n'
    )
    return
  }

  line('ESPN_S2 length', `${s2.length} characters`)
  if (s2.length < 150) {
    console.log('  ^ Too short. This value is normally 250 to 350 characters, so it got truncated')
    console.log('    on copy. Use the Network tab Cookie header rather than the Cookies table.')
  }

  line('SWID length', `${swid.length} characters`)
  line('SWID has braces', swid.startsWith('{') && swid.endsWith('}') ? 'yes' : 'NO, it needs them')

  if (raw.s2 !== s2 || raw.swid !== swid) {
    console.log('\n  Note: quotes or whitespace were trimmed. Remove them from .env or the secret.')
  }

  const config = JSON.parse(await fs.readFile(path.resolve('leagues.config.json'), 'utf8'))
  const leagues = config.espn || []
  if (leagues.length === 0) {
    console.log('\nNo ESPN leagues in leagues.config.json.\n')
    return
  }

  const season = new Date().getUTCFullYear()

  for (const league of leagues) {
    console.log(`\nLeague ${league.leagueId}\n`)
    const url = `${BASE}/${season}/segments/0/leagues/${league.leagueId}?view=mTeam`

    // Without the cookie first. A public league answers 200 here, which means the
    // cookies were never the problem.
    const open = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } })
    line('Without cookies', open.status)

    const authed = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': UA,
        cookie: `espn_s2=${s2}; SWID=${swid}`
      }
    })
    line('With cookies', authed.status)

    if (authed.status === 200) {
      const data = await authed.json()
      const teams = (data.teams || []).map(
        (team) => `${team.id}: ${team.name || `${team.location ?? ''} ${team.nickname ?? ''}`.trim()}`
      )
      console.log('\nTeams in this league:')
      for (const team of teams) console.log(`  ${team}`)
      console.log(`\nYour config says teamId ${league.teamId}. Confirm that matches your team.\n`)
    } else if (authed.status === 401) {
      console.log(
        '\nESPN rejected these cookies. Either they are from an account that is not in\n' +
          'this league, or the session was invalidated by a logout or password change.\n' +
          'Log in at fantasy.espn.com, open DevTools, Network tab, click any request, and\n' +
          'copy espn_s2 and SWID out of the Cookie request header.\n'
      )
    } else if (authed.status === 404) {
      console.log(`\nLeague ${league.leagueId} does not exist in the ${season} season.\n`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
