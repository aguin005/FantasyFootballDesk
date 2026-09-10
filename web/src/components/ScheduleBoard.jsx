import Portrait from './Portrait.jsx'

const DAY_ORDER = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']

/** Your roster grouped by the day each player's NFL team actually kicks off. */
export default function ScheduleBoard({ roster }) {
  const byDay = new Map()
  const bye = []

  for (const player of roster) {
    if (!player.game) {
      bye.push(player)
      continue
    }
    const key = player.game.weekday
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(player)
  }

  const days = [...byDay.entries()].sort(
    (a, b) => DAY_ORDER.indexOf(a[0]) - DAY_ORDER.indexOf(b[0])
  )

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
            {players
              .sort((a, b) => Number(b.starter) - Number(a.starter))
              .map((player) => (
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
                  <span className="kickoff">{player.game.kickoff} ET</span>
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
