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

const FEEDS = [
  { name: 'RotoWire', url: 'https://www.rotowire.com/rss/news.php?sport=NFL' },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/nfl/news' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/nfl/rss.xml' },
  { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/nfl/' },
  { name: 'Pro Football Talk', url: 'https://profootballtalk.nbcsports.com/feed/' }
]

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ITEMS = 60

export async function fetchFeeds(enabled) {
  const active = enabled?.length ? FEEDS.filter((feed) => enabled.includes(feed.name)) : FEEDS

  const results = await Promise.all(
    active.map(async (feed) => {
      try {
        const response = await fetch(feed.url, {
          headers: {
            accept: 'application/rss+xml, application/xml, text/xml',
            'user-agent': 'fantasy-dashboard/1.0 (personal use)'
          }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const items = parseRSS(await response.text(), feed.name)
        console.log(`${feed.name}: ${items.length} items`)
        return items
      } catch (error) {
        console.warn(`${feed.name} feed unavailable: ${error.message}`)
        return []
      }
    })
  )

  return results.flat()
}

/**
 * A small RSS reader. Feeds here are plain RSS 2.0, so pulling item blocks out and
 * reading four tags is enough, and it avoids adding an XML parser dependency to a
 * project that has none.
 */
export function parseRSS(xml, source) {
  const items = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []

  for (const block of blocks) {
    const headline = clean(tag(block, 'title'))
    if (!headline) continue
    const published = Date.parse(tag(block, 'pubDate') || '') || null

    items.push({
      source,
      headline,
      summary: clean(tag(block, 'description')).slice(0, 400),
      url: clean(tag(block, 'link')) || null,
      published: published ? new Date(published).toISOString() : null
    })
  }

  return items
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? match[1] : ''
}

function clean(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
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
