import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const MOCK = pathToFileURL(path.join(here, 'mock-network.mjs')).href
const REFRESH = path.join(here, '..', '..', 'scripts', 'refresh.mjs')

/**
 * Runs the real refresh in a scratch directory against the mocked network and
 * returns what it wrote. Pass dir to run again in the same directory, which is
 * how a second run sees the first as its previous one.
 */
export function runRefresh({ now = '2026-11-03T16:00:00Z', week, dir, env = {} } = {}) {
  const cwd = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-test-'))
  fs.writeFileSync(
    path.join(cwd, 'leagues.config.json'),
    JSON.stringify({ sleeper: { username: 'artnjelo' }, espn: [{ leagueId: '123', teamId: 1, label: 'Los Hermanos Klub' }], siteUrl: '' })
  )
  const requests = path.join(cwd, 'requests.txt')
  const result = spawnSync(process.execPath, ['--import', MOCK, REFRESH], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ESPN_S2: 'x',
      SWID: '{y}',
      PICK_HISTORY: path.join(cwd, '.history', 'picks.json'),
      GITHUB_OUTPUT: path.join(cwd, 'github-output.txt'),
      GITHUB_REPOSITORY: '',
      MOCK_NOW: now,
      MOCK_REQUEST_LOG: requests,
      ...(week ? { MOCK_WEEK: String(week) } : {}),
      ...env
    }
  })
  const read = (file) => {
    try {
      return fs.readFileSync(path.join(cwd, file), 'utf8')
    } catch {
      return null
    }
  }
  const output = read('web/public/data/dashboard.json')
  return {
    dir: cwd,
    status: result.status,
    log: `${result.stdout}${result.stderr}`,
    data: output ? JSON.parse(output) : null,
    stamp: JSON.parse(read('web/public/data/stamp.json') || 'null'),
    requests: (read('requests.txt') || '').split('\n').filter(Boolean),
    githubOutput: read('github-output.txt')
  }
}

let shared = null
/** One run at the default clock, shared by every test in a file that only reads it. */
export function fixture() {
  shared ||= runRefresh()
  if (shared.status !== 0) throw new Error(`The mocked refresh failed:\n${shared.log}`)
  return structuredClone(shared.data)
}
