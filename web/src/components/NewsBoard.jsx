import Portrait from './Portrait.jsx'

/**
 * Every story that mentions someone on this league's roster. Items arrive already
 * filtered by the refresh script, so nothing about players you do not own reaches
 * the browser at all.
 */
export default function NewsBoard({ news, leagueId }) {
  const items = (news || []).filter((item) =>
    item.players.some((player) => player.leagueId === leagueId)
  )

  if (items.length === 0) {
    return (
      <p className="empty">
        No stories about your players in the last week. This tab only shows news that names someone
        on your roster.
      </p>
    )
  }

  return (
    <div className="group">
      <h3>
        Your players <span className="day-count">{items.length} stories</span>
      </h3>
      <ul className="news-list">
        {items.map((item) => {
          const mine = item.players.filter((player) => player.leagueId === leagueId)
          return (
            <li className="news-item" key={item.url || item.headline}>
              <div className="news-top">
                <span className="news-source">{item.source}</span>
                {item.published && <span className="news-when">{ago(item.published)}</span>}
              </div>

              {item.url ? (
                <a className="news-headline" href={item.url} target="_blank" rel="noreferrer">
                  {item.headline}
                </a>
              ) : (
                <span className="news-headline">{item.headline}</span>
              )}

              {item.summary && <p className="news-summary">{item.summary}</p>}

              <div className="news-players">
                {mine.map((player) => (
                  <span className="news-chip" key={player.playerId} data-pos={player.position}>
                    <Portrait player={player} />
                    <span>
                      <span className="news-chip-name">{player.name}</span>
                      <span className="news-chip-meta">
                        {player.position} {player.team}
                        {player.starter ? ', starting' : ''}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ago(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}
