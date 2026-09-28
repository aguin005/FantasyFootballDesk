import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { normalizeName } from './feeds.mjs'
import { timedFetch } from './http.mjs'

/**
 * What the fantasy press is telling everyone to add this week.
 *
 * RSS gives a headline and two sentences, and the actual recommendations live in
 * the article body, so waiver columns get fetched and read. Bodies are cached by
 * URL forever, since a published article does not change, which turns this into a
 * handful of fetches on Tuesday and Wednesday rather than a cost on every run.
 */

const CACHE_DIR = path.resolve('.cache/articles')
const MAX_ARTICLES = 12
const MAX_BODY_CHARS = 40000
const MIN_BODY_CHARS = 500
// Narrow on purpose. A wide window lets "drop Cade Otton for streaming options"
// swallow the next player named after it, which is a false negative rather than a
// false positive, and those are harder to notice.
const NEGATIVE_WINDOW = 25

const WAIVER_HEADLINE =
  /(waiver|pickup|pick-up|add\/drop|must-add|streamer|sleeper pick|start 'em|adds? for week)/i

// Names appearing just after these are being recommended away from, not toward.
// Word boundaries are load bearing here: without them "waiver wire" matches
// "waive" and the filter silently excludes every name in a waiver column.
const NEGATIVE = /\b(drops?|dropping|cut|bench|sell|avoid|fade|release)\b/i

const SUFFIXES = /\s+(jr|sr|ii|iii|iv|v)$/

export async function collectMentions(items, pool, week) {
  const articles = items
    .filter((item) => item.url && WAIVER_HEADLINE.test(item.headline))
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))
    .slice(0, MAX_ARTICLES)

  if (articles.length === 0) {
    console.log('No waiver columns in the feeds yet this week')
    return new Map()
  }

  const mentions = new Map()
  let read = 0

  for (const article of articles) {
    const body = await readArticle(article.url)
    if (!body) continue
    read++

    const text = ` ${normalizeName(`${article.headline} ${body}`)} `
    for (const [variant, player] of pool) {
      const position = findMention(text, variant)
      if (position === -1) continue

      const key = player.key
      if (!mentions.has(key)) {
        mentions.set(key, { player, sources: new Set(), firstPosition: 1 })
      }
      const entry = mentions.get(key)
      entry.sources.add(article.source)
      // Writers lead with their top recommendation, so how early a name appears is
      // a weak but real signal of how strongly it is being pushed.
      entry.firstPosition = Math.min(entry.firstPosition, position / text.length)
    }
  }

  console.log(`Read ${read} of ${articles.length} waiver columns, ${mentions.size} players named`)
  return mentions
}

/** Position of the first mention that is not preceded by drop, cut, bench, or sell. */
function findMention(text, variant) {
  const needle = ` ${variant}`
  let index = text.indexOf(needle)

  while (index !== -1) {
    const before = text.slice(Math.max(0, index - NEGATIVE_WINDOW), index)
    if (!NEGATIVE.test(before)) return index
    index = text.indexOf(needle, index + needle.length)
  }
  return -1
}

/**
 * Every free agent across your leagues, indexed by the spellings an article might
 * use. Restricting the search to players you could actually claim is what keeps the
 * hundred rostered names an article mentions in passing out of the results.
 */
export function buildFreeAgentPool(leagues) {
  const pool = new Map()

  for (const league of leagues) {
    for (const candidate of league.candidates || []) {
      if (!candidate.name || candidate.position === 'DEF') continue
      const base = normalizeName(candidate.name)
      if (base.split(' ').length < 2) continue

      const player = {
        key: base.replace(SUFFIXES, ''),
        name: candidate.name,
        position: candidate.position,
        team: candidate.team,
        image: candidate.image
      }

      for (const variant of new Set([base, base.replace(SUFFIXES, '')])) {
        if (!pool.has(variant)) pool.set(variant, player)
      }
    }
  }

  return pool
}

/**
 * The consensus board for one league: named players who are free agents here,
 * carrying your own model's score for the same player so the disagreements show.
 */
export function consensusForLeague(league, mentions) {
  const available = new Map()
  for (const candidate of league.candidates || []) {
    if (!candidate.name) continue
    available.set(normalizeName(candidate.name).replace(SUFFIXES, ''), candidate)
  }

  const rows = []
  for (const [key, entry] of mentions) {
    const candidate = available.get(key)
    if (!candidate) continue

    const ranked = (league.waivers || []).findIndex(
      (player) => player.playerId === candidate.playerId
    )

    rows.push({
      playerId: candidate.playerId,
      name: candidate.name,
      position: candidate.position,
      team: candidate.team,
      image: candidate.image,
      sources: [...entry.sources].sort(),
      count: entry.sources.size,
      modelScore: ranked === -1 ? null : league.waivers[ranked].score,
      modelRank: ranked === -1 ? null : ranked + 1,
      firstPosition: entry.firstPosition
    })
  }

  return rows
    .sort((a, b) => b.count - a.count || a.firstPosition - b.firstPosition)
    .slice(0, 8)
}

async function readArticle(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex')
  const file = path.join(CACHE_DIR, `${key}.txt`)

  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    // Not cached yet.
  }

  try {
    const response = await timedFetch(url, {
      headers: {
        accept: 'text/html',
        'user-agent': 'fantasy-dashboard/1.0 (personal use)'
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const text = stripHTML(await response.text())
    // A very short body is a paywall or a consent wall, not an article.
    if (text.length < MIN_BODY_CHARS) throw new Error('body too short, likely a paywall')

    await fs.mkdir(CACHE_DIR, { recursive: true })
    await fs.writeFile(file, text)
    return text
  } catch (error) {
    console.warn(`Could not read ${url}: ${error.message}`)
    return null
  }
}

function stripHTML(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|header|footer|aside|form)[\s>][\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BODY_CHARS)
}
