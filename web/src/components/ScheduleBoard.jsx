import Portrait from './Portrait.jsx'

/**
 * Your roster grouped by the day each player's NFL team kicks off, in your own time
 * zone rather than Eastern. The day label is derived from the kickoff instant, so a
 * late game that lands on a different local date groups where it belongs.
 */
export default function ScheduleBoard({ roster, timezone }) {
  const byDay = new Map()
  const bye = []

  for (const player of roster) {
    if (!player.game) {
      bye.push(player)
      continue
    }
    const key = localDay(player.game, timezone)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(player)
  }

  // Days are ordered by their earliest kickoff rather than by a fixed list of
  // weekdays. A hardcoded order breaks the moment the league schedules something
  // unusual, and week 1 of this season opens on a Wednesday.
  const days = [...byDay.entries()].sort((a, b) => earliest(a[1]) - earliest(b[1]))

  if (days.length === 0 && bye.length === 0) {
    return <p className="empty">No schedule data on the last refresh.</p>
  }

  return (
    <div className="stack">
      {days.map(([day, players]) => (
        <div className="group" key={day}>
          <h3>
            {day} <span className="day-count">{starterCount(players)} starting</span>
          </h3>
          <ul className="rows">
            {[...players].sort(byKickoff).map((player) => (
                <li key={player.playerId} className="row row-game" data-pos={player.position}>
                  <span className="slot">{player.slot || player.position}</span>
                  <Portrait player={player} />
                  <span className="who">
                    <span className={player.starter ? 'name' : 'name name-bench'}>
                      {player.name}
                    </span>
                    <span className="meta">
                      {player.position} {player.team} {player.game.matchup}
                      {player.injuryStatus ? `, ${player.injuryStatus}` : ''}
                    </span>
                  </span>
                  <span className="kickoff">{localTime(player.game, timezone)}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}

      {bye.length > 0 && (
        <div className="group">
          <h3>
            On bye <span className="day-count">{bye.length} players</span>
          </h3>
          <ul className="rows">
            {bye.map((player) => (
              <li key={player.playerId} className="row row-game" data-pos={player.position}>
                <span className="slot">{player.slot || player.position}</span>
                <Portrait player={player} />
                <span className="who">
                  <span className={player.starter ? 'name' : 'name name-bench'}>{player.name}</span>
                  <span className="meta">
                    {player.position} {player.team}
                  </span>
                </span>
                {player.starter && <span className="tag">In your lineup</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function starterCount(players) {
  return players.filter((player) => player.starter).length
}

function kickoffValue(player) {
  const iso = player.game?.kickoffISO
  return iso ? Date.parse(iso) : Number.MAX_SAFE_INTEGER
}

function earliest(players) {
  return Math.min(...players.map(kickoffValue))
}

/** Earliest kickoff first, then starters ahead of bench within the same game slot. */
function byKickoff(a, b) {
  const difference = kickoffValue(a) - kickoffValue(b)
  if (difference !== 0) return difference
  return Number(b.starter) - Number(a.starter)
}

function localDay(game, timezone) {
  if (!game.kickoffISO) return game.weekday
  return new Date(game.kickoffISO).toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' })
}

/** The zone name comes from the formatter, so it reads PDT or PST on its own. */
function localTime(game, timezone) {
  if (!game.kickoffISO) return ''
  return new Date(game.kickoffISO).toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}
