import { getJSON } from './http.mjs'

const NEWS_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50'
const FANTASY_NEWS_URL =
  'https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=50'
const INJURY_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'

/**
 * ESPN tags each article with the athletes it mentions, and those athlete ids are
 * the same ids the fantasy API uses. That tagging is what lets us attach a story
 * to a specific player instead of fuzzy matching on headlines.
 *
 * Two sources are tried, because the general news feed is the one ESPN blocks most
 * often. Neither is essential, so a total failure returns an empty map and the rest
 * of the refresh carries on with rosters and waivers intact.
 */
export async function fetchNews() {
  for (const [label, url] of [['ESPN news', NEWS_URL], ['ESPN fantasy news', FANTASY_NEWS_URL]]) {
    try {
      const data = await getJSON(url, { label })
      const articles = data.articles || data.feed || []
      if (articles.length > 0) return indexByAthlete(articles)
    } catch (error) {
      console.warn(`${label} unavailable: ${error.message}`)
    }
  }
  console.warn('No news feed responded. Injuries and waivers still work.')
  return new Map()
}

function indexByAthlete(articles) {
  const byPlayer = new Map()

  for (const article of articles) {
    const item = {
      headline: article.headline,
      summary: article.description || article.story || '',
      published: article.published,
      url: article.links?.web?.href || null
    }

    const athleteIds = new Set()
    for (const category of article.categories || []) {
      const id = category.athleteId ?? category.athlete?.id
      if (id) athleteIds.add(String(id))
    }
    // The fantasy feed nests its player ids differently from the general feed.
    for (const athlete of article.athletes || []) {
      if (athlete.id) athleteIds.add(String(athlete.id))
    }

    for (const id of athleteIds) {
      if (!byPlayer.has(id)) byPlayer.set(id, [])
      byPlayer.get(id).push(item)
    }
  }

  return byPlayer
}

/** Current injury designations keyed by ESPN athlete id. */
export async function fetchInjuries() {
  const byPlayer = new Map()
  try {
    const data = await getJSON(INJURY_URL, { label: 'ESPN injuries' })
    for (const team of data.injuries || []) {
      for (const record of team.injuries || []) {
        const athleteId = record.athlete?.id
        if (!athleteId) continue
        byPlayer.set(String(athleteId), {
          status: record.status || null,
          detail: record.shortComment || record.longComment || record.details?.type || null,
          date: record.date || null
        })
      }
    }
  } catch (error) {
    console.warn(`Injury feed unavailable: ${error.message}`)
  }
  return byPlayer
}

const RECENT_WINDOW_MS = 72 * 60 * 60 * 1000

export function attachNews(player, newsByPlayer, injuriesByPlayer) {
  const stories = player.espnId ? newsByPlayer.get(player.espnId) || [] : []
  player.news = stories
    .filter((item) => !item.published || Date.now() - Date.parse(item.published) < RECENT_WINDOW_MS)
    .slice(0, 3)

  const injury = player.espnId ? injuriesByPlayer.get(player.espnId) : null
  if (injury) {
    player.injuryStatus = player.injuryStatus || injury.status
    player.injuryNote = player.injuryNote || injury.detail
  }
  return player
}
