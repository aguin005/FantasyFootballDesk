import { timedFetch } from './http.mjs'
/**
 * News aggregation.
 *
 * ESPN's JSON feed tags articles with athlete ids, which is exact. Everything else
 * is RSS, which carries no ids at all, so those items are matched by name against
 * your rosters. That is why this module normalizes hard: lowercase, strip accents,
 * strip punctuation, and index a suffix free variant, because a headline says
 * "Marvin Harrison" where the roster says "Marvin Harrison Jr.".
 *
 * Underdog has no public feed. Their player notes are in the app only.
 */

// Each feed lists the URLs to try in order. Publishers move feeds without notice,
// and the refresh log only shows a count, so a fallback keeps a source alive while
// npm run feeds shows which URL actually answered.
//
// Player news wires come first, since those are short items about one player.
// The fantasy sites after them publish the waiver and streaming columns that
// Writers' picks reads. CBS dropped its fantasy feed in 2026 and only its general
// NFL feed remains. ESPN's RSS answers scripts with an empty page, and ESPN
// stories arrive through its JSON API instead, tagged with player ids.
export const FEEDS = [
  { name: 'RotoWire', urls: ['https://www.rotowire.com/rss/news.php?sport=NFL'] },
  { name: 'FFToday', urls: ['https://www.fftoday.com/rss/news.xml'] },
  { name: 'Pro Football Rumors', urls: ['https://www.profootballrumors.com/feed'] },
  {
    name: 'RotoBaller',
    urls: ['https://www.rotoballer.com/category/nfl/feed', 'https://www.rotoballer.com/feed']
  },
  { name: 'FantasyPros', urls: ['https://www.fantasypros.com/feed/'] },
  { name: 'Fantasy Footballers', urls: ['https://www.thefantasyfootballers.com/feed/'] },
  { name: 'PFF', urls: ['https://www.pff.com/feed'] },
  { name: 'Yahoo Sports', urls: ['https://sports.yahoo.com/nfl/rss/', 'https://sports.yahoo.com/nfl/rss.xml'] },
  { name: 'CBS Sports', urls: ['https://www.cbssports.com/rss/headlines/nfl/'] },
  {
    name: 'Pro Football Talk',
    urls: ['https://www.nbcsports.com/profootballtalk.rss', 'https://profootballtalk.nbcsports.com/feed/']
  }
]

export const FEED_HEADERS = {
  accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
  'user-agent': 'fantasy-dashboard/1.0 (personal use)'
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ITEMS = 60

export async function fetchFeeds(enabled) {
  const active = enabled?.length ? FEEDS.filter((feed) => enabled.includes(feed.name)) : FEEDS
  const results = await Promise.all(active.map((feed) => fetchFeed(feed)))
  return results.flat()
}

/**
 * The first URL that returns items wins. A 200 with no items counts as a miss,
 * because a moved feed often redirects to an ordinary web page rather than failing.
 */
async function fetchFeed(feed) {
  const misses = []
  for (const url of feed.urls) {
    try {
      const response = await timedFetch(url, { headers: FEED_HEADERS })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const items = parseFeed(await response.text(), feed.name)
      if (items.length === 0) throw new Error('no items')
      console.log(`${feed.name}: ${items.length} items${misses.length ? ` from ${new URL(url).hostname}` : ''}`)
      return items
    } catch (error) {
      misses.push(error.message)
    }
  }
  console.warn(`${feed.name} feed unavailable: ${misses.join(', ')}`)
  return []
}

/**
 * A small feed reader. Most feeds here are RSS 2.0, a few publishers serve Atom,
 * and the two differ only in tag names, so pulling entry blocks out and reading a
 * handful of tags covers both without adding an XML parser to a project that has
 * no dependencies outside the site itself.
 */
export function parseFeed(xml, source) {
  const items = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || []

  for (const block of blocks) {
    const headline = clean(tag(block, 'title'))
    if (!headline) continue
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')
    const published = Date.parse(clean(date)) || null

    items.push({
      source,
      headline,
      summary: clean(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')).slice(0, 400),
      url: linkOf(block),
      published: published ? new Date(published).toISOString() : null
    })
  }

  return items
}

/** RSS puts the link in the tag body, Atom in an href, and some RSS only in the guid. */
function linkOf(block) {
  const body = clean(tag(block, 'link'))
  if (/^https?:\/\//.test(body)) return body
  const atom =
    block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
    block.match(/<link\b[^>]*href=["']([^"']+)["']/i)
  if (atom) return clean(atom[1])
  const guid = clean(tag(block, 'guid'))
  return /^https?:\/\//.test(guid) ? guid : null
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? match[1] : ''
}

function clean(value) {
  return (
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      // Descriptions often carry escaped HTML, which only becomes tags once decoded.
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const SUFFIXES = /\s+(jr|sr|ii|iii|iv|v)$/

export function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'`’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every rostered player, indexed under each spelling a headline might use. */
export function buildRosterIndex(leagues) {
  const index = new Map()

  for (const league of leagues) {
    for (const player of league.roster) {
      if (player.position === 'DEF') continue
      const entry = {
        playerId: player.playerId,
        name: player.name,
        position: player.position,
        team: player.team,
        image: player.image,
        starter: player.starter,
        league: league.name,
        leagueId: league.id
      }

      const base = normalizeName(player.name)
      const variants = new Set([base, base.replace(SUFFIXES, '')])
      for (const variant of variants) {
        if (variant.split(' ').length < 2) continue
        if (!index.has(variant)) index.set(variant, [])
        index.get(variant).push(entry)
      }
    }
  }

  return index
}

/**
 * Keeps only the items that mention someone you roster. Matching requires the full
 * name, since a surname alone produces constant false positives: there are four
 * Smiths and three Johnsons in any given week.
 */
export function matchToRoster(items, index) {
  const seen = new Set()
  const matched = []
  const now = Date.now()

  for (const item of items) {
    if (item.published && now - Date.parse(item.published) > WINDOW_MS) continue

    const haystack = ` ${normalizeName(`${item.headline} ${item.summary}`)} `
    const players = []
    const already = new Set()

    for (const [variant, entries] of index) {
      if (!haystack.includes(` ${variant} `) && !haystack.includes(` ${variant},`)) continue
      for (const entry of entries) {
        const key = `${entry.leagueId}:${entry.playerId}`
        if (already.has(key)) continue
        already.add(key)
        players.push(entry)
      }
    }

    if (players.length === 0) continue

    const dedupeKey = normalizeName(item.headline).slice(0, 90)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    matched.push({ ...item, players })
  }

  return matched
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))
    .slice(0, MAX_ITEMS)
}

/** ESPN's id tagged stories, folded into the same shape as the RSS items. */
export function foldEspnNews(leagues, newsByPlayer) {
  const items = []

  for (const league of leagues) {
    for (const player of league.roster) {
      for (const story of player.news || []) {
        items.push({
          source: 'ESPN',
          headline: story.headline,
          summary: story.summary || '',
          url: story.url,
          published: story.published,
          players: [
            {
              playerId: player.playerId,
              name: player.name,
              position: player.position,
              team: player.team,
              image: player.image,
              starter: player.starter,
              league: league.name,
              leagueId: league.id
            }
          ]
        })
      }
    }
  }

  return items
}

/** Combines ESPN's id matched stories with the RSS matches, newest first. */
export function mergeNews(groups) {
  const seen = new Set()
  const merged = []

  for (const item of groups.flat()) {
    if (!item.headline) continue
    const key = normalizeName(item.headline).slice(0, 90)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))
    .slice(0, MAX_ITEMS)
}
