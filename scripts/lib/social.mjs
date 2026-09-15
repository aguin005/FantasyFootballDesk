/**
 * Social accounts as a news source.
 *
 * Underdog's NFL account posts player updates faster than most wires, but X killed
 * free API reads in February 2026 and now bills $0.005 per post read. Polling one
 * account every 30 minutes costs roughly $145 a month, which is absurd for a
 * personal dashboard, so the official API is not an option here.
 *
 * Two routes that do work:
 *
 *   bluesky     Free and unauthenticated. Bluesky's public AppView serves any
 *               account's posts with no key and no signup.
 *   twitterapi  A third-party X reader, around $0.15 per 1,000 posts, roughly
 *               $4 a month at this polling rate. Needs an API key, and reading X
 *               through a third party is against X's terms of service, which is
 *               your call to make rather than mine.
 *
 * Nothing is configured by default. An empty social array means this file does
 * nothing at all.
 */

const BLUESKY = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed'
const TWITTERAPI = 'https://api.twitterapi.io/twitter/user/last_tweets'

export async function fetchSocial(accounts = []) {
  if (accounts.length === 0) return []

  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const posts =
          account.provider === 'bluesky'
            ? await fetchBluesky(account)
            : account.provider === 'twitterapi'
              ? await fetchTwitterApi(account)
              : null

        if (posts === null) {
          console.warn(`Unknown social provider: ${account.provider}`)
          return []
        }

        console.log(`${account.label || account.handle}: ${posts.length} posts`)
        return posts
      } catch (error) {
        console.warn(`${account.label || account.handle} unavailable: ${error.message}`)
        return []
      }
    })
  )

  return results.flat()
}

async function fetchBluesky(account) {
  const url = `${BLUESKY}?actor=${encodeURIComponent(account.handle)}&limit=50&filter=posts_no_replies`
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'fantasy-dashboard/1.0 (personal use)' }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const data = await response.json()

  return (data.feed || [])
    .filter((entry) => entry.post?.record?.text)
    .map((entry) => {
      const post = entry.post
      // Aggregator accounts exist to repost other people, so reposts are the point
      // rather than noise. Credit goes to whoever wrote the post, and the link
      // points at their copy of it rather than the account that boosted it.
      const author = post.author?.handle || account.handle
      const reposted = Boolean(entry.reason)
      const credit = post.author?.displayName || author
      const label = account.label || account.handle
      const id = String(post.uri).split('/').pop()

      return toItem(
        { ...account, label: reposted ? `${label} / ${credit}` : label },
        post.record.text,
        post.record.createdAt,
        `https://bsky.app/profile/${author}/post/${id}`
      )
    })
}

async function fetchTwitterApi(account) {
  const key = process.env[account.keyEnv || 'TWITTERAPI_KEY']
  if (!key) throw new Error(`${account.keyEnv || 'TWITTERAPI_KEY'} is not set`)

  const response = await fetch(`${TWITTERAPI}?userName=${encodeURIComponent(account.handle)}`, {
    headers: { accept: 'application/json', 'X-API-Key': key }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const data = await response.json()
  const posts = data.data?.tweets || data.tweets || []
  return posts
    .filter((post) => post.text)
    .map((post) =>
      toItem(
        account,
        post.text,
        post.createdAt || post.created_at,
        post.url || `https://x.com/${account.handle}/status/${post.id}`
      )
    )
}

/**
 * Posts become news items in the same shape as the RSS ones, so roster matching,
 * deduplication, and the news tab all treat them identically.
 *
 * The first sentence becomes the headline, since these posts read as
 * "Player Name (TEAM) is questionable for Sunday" and the whole text as a headline
 * would swamp the layout.
 */
function toItem(account, text, created, url) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const split = clean.match(/^(.{0,140}?[.!?])(\s|$)/)
  const headline = split ? split[1] : clean.slice(0, 140)

  return {
    source: account.label || account.handle,
    headline,
    summary: clean.length > headline.length ? clean.slice(headline.length).trim().slice(0, 400) : '',
    url,
    published: created ? new Date(created).toISOString() : null
  }
}
