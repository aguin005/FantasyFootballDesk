// ESPN's fantasy host wants to look like a browser session, since that is the only
// way it is ever called. The public site.api host does the opposite and rejects
// requests that claim to be Chrome without the rest of a browser's fingerprint.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const PLAIN_UA = 'fantasy-dashboard/1.0 (personal use)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class AuthError extends Error {}
export class BlockedError extends Error {}

/**
 * GET a JSON endpoint with retries on transient failures.
 *
 * Pass authenticated: true for calls that carry your ESPN cookies. That flag only
 * changes how a 403 is reported, which matters because a refusal on a public feed
 * is a block and a refusal on a private league is an expired cookie. Treating both
 * as the same error sends you looking in the wrong place.
 */
export async function getJSON(url, options = {}) {
  const { headers = {}, retries = 3, label = url, authenticated = false } = options
  const userAgent = authenticated ? BROWSER_UA : PLAIN_UA
  let lastError

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': userAgent, ...headers }
      })

      if (response.status === 401 || response.status === 403) {
        if (authenticated) {
          throw new AuthError(
            `${label} returned ${response.status}. Your ESPN cookies are missing or expired, so grab fresh ones.`
          )
        }
        throw new BlockedError(
          `${label} returned ${response.status}. This endpoint takes no credentials, so ESPN refused the request itself.`
        )
      }
      if (!response.ok) {
        throw new Error(`${label} returned HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      if (error instanceof AuthError || error instanceof BlockedError) throw error
      lastError = error
      if (attempt < retries) await sleep(400 * 2 ** attempt)
    }
  }
  throw lastError
}
