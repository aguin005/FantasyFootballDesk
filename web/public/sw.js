/*
 * Offline support for the installed app.
 *
 * The page and the data are network first, so a new deploy or a fresh refresh
 * always wins when there is a connection, and the cached copy only answers when
 * the network cannot. Build assets carry a content hash in their file names, so
 * they never change under the same URL and are safe to serve from cache first.
 *
 * Only same origin requests are touched. Headshots come from ESPN and Sleeper,
 * and caching opaque cross origin images would eat storage quota for little gain.
 */

const CACHE = 'league-desk-v1'
// On a connection that has all but stalled, the saved page opens after this long
// instead of a blank screen. The slow answer still lands in the cache for next time.
const PAGE_WAIT_MS = 2500

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request, url))
  } else {
    event.respondWith(networkFirst(event, url))
  }
})

async function cacheFirst(request, url) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    await dropOlderBuilds(cache, url)
  }
  return response
}

/**
 * Every deploy that changes the code names its files with a new hash, and the
 * old ones would otherwise stay in the cache for good. Once a new build's file is
 * saved, earlier builds of the same file, "index-abc123.js" for "index-def456.js",
 * are removed.
 */
async function dropOlderBuilds(cache, url) {
  const stem = buildStem(url.pathname)
  if (!stem) return
  for (const request of await cache.keys()) {
    const other = new URL(request.url)
    if (other.pathname !== url.pathname && buildStem(other.pathname) === stem) await cache.delete(request)
  }
}

/** "/assets/index|.js" for "/assets/index-C0jFQQYX.js", or null without a hash. */
function buildStem(pathname) {
  const match = pathname.match(/^(.*\/assets\/.+)-[\w-]{8}(\.[a-z0-9]+)$/i)
  return match ? `${match[1]}|${match[2]}` : null
}

async function networkFirst(event, url) {
  const { request } = event
  const cache = await caches.open(CACHE)
  // The data URL carries a cache busting query string, so it is stored under its
  // bare path. Otherwise every refresh would add another copy and none would match.
  const key = url.origin + url.pathname
  const saved = () => cache.match(key).then((hit) => hit || (request.mode === 'navigate' ? cache.match(self.registration.scope) : undefined))

  const fresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(key, response.clone())
    return response
  })

  // Data waits for the network however long it takes, since the app already has
  // the saved copy on screen. Only the page itself falls back on a timer.
  if (request.mode !== 'navigate') {
    try {
      return await fresh
    } catch (error) {
      const hit = await saved()
      if (hit) return hit
      throw error
    }
  }

  const hit = await saved()
  if (!hit) return fresh
  // Keeps the worker alive until the slow answer has been cached.
  event.waitUntil(fresh.catch(() => {}))
  return Promise.race([fresh.catch(() => hit), new Promise((resolve) => setTimeout(() => resolve(hit), PAGE_WAIT_MS))])
}
