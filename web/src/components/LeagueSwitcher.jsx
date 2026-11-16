/**
 * One chip per league. The badge counts the changes you have not seen yet in
 * leagues you are not looking at, so something happening elsewhere is never out
 * of sight.
 */
export default function LeagueSwitcher({ leagues, activeId, onChange, unseen }) {
  if (leagues.length < 2) return null

  return (
    <div className="leagues" role="radiogroup" aria-label="Leagues">
      {leagues.map((league) => {
        const on = league.id === activeId
        const count = on ? 0 : unseen?.get(league.id) || 0
        return (
          <button
            key={league.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? 'league-chip press is-active' : 'league-chip press'}
            data-platform={league.platform}
            onClick={() => onChange(league.id)}
          >
            <span className="platform-dot" aria-label={league.platform === 'espn' ? 'ESPN' : 'Sleeper'} />
            <span className="league-label">{league.name}</span>
            <span className="league-record">{league.record}</span>
            {count > 0 && (
              <span className="count-badge" aria-label={`${count} new changes`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
