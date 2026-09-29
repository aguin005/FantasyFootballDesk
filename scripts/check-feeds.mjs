import { FEEDS, FEED_HEADERS, parseFeed } from './lib/feeds.mjs'
import { timedFetch } from './lib/http.mjs'
import { WAIVER_HEADLINE, readArticle } from './lib/consensus.mjs'

/**
 * Checks every news feed and prints what each one returned, since a feed that
 * moves usually answers 404 or quietly starts serving a web page with no items,
 * and the refresh log only says how many items it got.
 *
 *   npm run feeds                   every feed the refresh reads, with fallbacks
 *   npm run feeds -- <url> ...      any other feed URLs, to try a replacement
 *   npm run feeds -- --find <page>  lists the feed links a web page advertises
 *   npm run feeds -- --columns      reads each waiver column the feeds link to,
 *                                   which is what Writers' picks is built from
 */

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--find') {
    for (const page of args.slice(1)) await find(page)
    return
  }
  if (args[0] === '--columns') {
    await columns()
    return
  }

  const targets = args.length
    ? args.map((url) => ({ name: new URL(url).hostname, url }))
    : FEEDS.flatMap((feed) => feed.urls.map((url) => ({ name: feed.name, url })))

  const results = await Promise.all(targets.map((target) => check(target)))
  for (const result of results) print(result)

  const dead = FEEDS.filter((feed) =>
    results.every((result) => result.name !== feed.name || !result.items)
  )
  if (!args.length) {
    console.log(dead.length ? `\nNo items from: ${dead.map((feed) => feed.name).join(', ')}` : '\nEvery feed answered.')
  }
}

async function check({ name, url, keep = false }) {
  const started = Date.now()
  try {
    const response = await timedFetch(url, { headers: FEED_HEADERS }, 20000)
    const text = await response.text()
    const items = response.ok ? parseFeed(text, name) : []
    const dates = items.map((item) => Date.parse(item.published || '')).filter(Number.isFinite)
    return {
      name,
      url,
      status: response.status,
      redirected: response.redirected ? response.url : null,
      type: (response.headers.get('content-type') || '').split(';')[0],
      items: items.length,
      newest: dates.length ? Math.max(...dates) : null,
      titles: items.slice(0, 3).map((item) => item.headline),
      start: items.length ? null : text.slice(0, 140).replace(/\s+/g, ' '),
      ms: Date.now() - started,
      all: keep ? items : undefined
    }
  } catch (error) {
    return { name, url, error: error.cause?.code || error.message, ms: Date.now() - started }
  }
}

function print(result) {
  console.log(`\n${result.name}  ${result.url}`)
  if (result.error) {
    console.log(`  failed: ${result.error}`)
    return
  }
  const age = result.newest ? `${((Date.now() - result.newest) / DAY_MS).toFixed(1)} days` : 'no dates'
  console.log(`  HTTP ${result.status}, ${result.type || 'no type'}, ${result.items} items, newest ${age}, ${result.ms} ms`)
  if (result.redirected) console.log(`  redirected to ${result.redirected}`)
  for (const title of result.titles) console.log(`  - ${title}`)
  if (result.start) console.log(`  body starts: ${result.start}`)
}

/** Whether each waiver column in the feeds can actually be read, and how much of it. */
async function columns() {
  const results = await Promise.all(FEEDS.map((feed) => check({ name: feed.name, url: feed.urls[0], keep: true })))
  for (const result of results) {
    const picks = (result.all || []).filter((item) => item.url && WAIVER_HEADLINE.test(item.headline))
    console.log(`\n${result.name}: ${picks.length} waiver columns`)
    for (const item of picks.slice(0, 3)) {
      const body = await readArticle(item.url)
      const middle = body ? body.slice(Math.floor(body.length / 3), Math.floor(body.length / 3) + 160) : ''
      console.log(`  ${item.headline}`)
      console.log(body ? `    read ${body.length} characters: ...${middle}...` : '    could not be read')
    }
  }
}

/** Feed links a page advertises, in its head or its body. */
async function find(page) {
  console.log(`\nFeeds linked from ${page}`)
  try {
    const response = await timedFetch(page, { headers: { ...FEED_HEADERS, accept: 'text/html' } }, 20000)
    const html = await response.text()
    const links = new Set()
    for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = match[1].replace(/&amp;/g, '&')
      if (!/(rss|feed|atom|\.xml)/i.test(href)) continue
      if (!/(nfl|football|fantasy|news|headlines)/i.test(href)) continue
      try {
        links.add(new URL(href, page).href)
      } catch {
        // Not a URL.
      }
    }
    console.log(`  HTTP ${response.status}, ${links.size} feed links`)
    for (const link of [...links].slice(0, 60)) console.log(`  ${link}`)
  } catch (error) {
    console.log(`  failed: ${error.cause?.code || error.message}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
