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
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(networkFirst(request, url))
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE)
  // The data URL carries a cache busting query string, so it is stored under its
  // bare path. Otherwise every refresh would add another copy and none would match.
  const key = url.origin + url.pathname
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(key, response.clone())
    return response
  } catch (error) {
    const hit = (await cache.match(key)) || (request.mode === 'navigate' && (await cache.match(`${self.registration.scope}`)))
    if (hit) return hit
    throw error
  }
}
