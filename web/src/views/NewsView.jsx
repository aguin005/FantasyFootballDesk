import { useState } from 'react'
import Portrait from '../components/Portrait.jsx'
import { Chips, EmptyState } from '../components/ui.jsx'
import { timeAgo } from '../lib/format.js'

/**
 * Every story that names someone on this roster. The refresh script drops
 * anything about players you do not own, so this is already the short list.
 */
export default function NewsView({ news, league, now, onOpenPlayer }) {
  const [filter, setFilter] = useState('all')

  const items = news
    .map((item) => ({ ...item, mine: item.players.filter((player) => player.leagueId === league.id) }))
    .filter((item) => item.mine.length > 0)
  const starters = items.filter((item) => item.mine.some((player) => player.starter))
  const shown = filter === 'starters' ? starters : items

  if (items.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="news" title="No stories this week">
          This tab only shows news that names someone on your roster.
        </EmptyState>
      </div>
    )
  }

  return (
    <>
      <Chips
        label="Filter stories"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All stories', count: items.length },
          { value: 'starters', label: 'Starters', count: starters.length }
        ]}
      />

      {shown.length === 0 && (
        <div className="card">
          <EmptyState icon="news" title="Nothing on your starters">
            Every story this week is about a bench player.
          </EmptyState>
        </div>
      )}

      {shown.map((item) => (
        <article className="card story" key={item.url || item.headline}>
          <div className="story-top">
            <span className="story-source">{item.source}</span>
            {item.published && <span>{timeAgo(item.published, now)}</span>}
          </div>
          {item.url ? (
            <a className="story-headline" href={item.url} target="_blank" rel="noreferrer">
              {item.headline}
            </a>
          ) : (
            <span className="story-headline">{item.headline}</span>
          )}
          {item.summary && item.summary !== item.headline && <p className="story-summary">{item.summary}</p>}
          <div className="story-players">
            {item.mine.map((player) => (
              <button
                key={player.playerId}
                type="button"
                className="player-chip press"
                data-pos={player.position}
                onClick={() => onOpenPlayer(player)}
              >
                <Portrait player={player} />
                {player.name}
                <span className="chip-meta">
                  {player.position}
                  {player.starter ? ', starting' : ''}
                </span>
              </button>
            ))}
          </div>
        </article>
      ))}
    </>
  )
}
