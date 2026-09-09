import Portrait from './Portrait.jsx'

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'K', 'BE', 'IR']

export default function RosterBoard({ roster }) {
  const starters = roster.filter((player) => player.starter)
  const bench = roster.filter((player) => !player.starter)

  return (
    <div className="stack">
      <PlayerGroup title="Starting" players={sortBySlot(starters)} />
      <PlayerGroup title="Bench" players={sortBySlot(bench)} />
    </div>
  )
}

function PlayerGroup({ title, players }) {
  if (players.length === 0) return null
  return (
    <div className="group">
      <h3>{title}</h3>
      <ul className="rows">
        {players.map((player) => (
          <li key={player.playerId} className="row" data-pos={player.position}>
            <span className="slot">{player.slot || player.position}</span>
            <Portrait player={player} />
            <span className="who">
              <span className="name">{player.name}</span>
              <span className="meta">
                {player.position} {player.team}
                {player.injuryNote ? `, ${player.injuryNote}` : ''}
              </span>
              {player.usageNotes?.length > 0 && (
                <span className="usage">{player.usageNotes.join('. ')}</span>
              )}
              {player.news?.length > 0 && (
                <a className="story" href={player.news[0].url} target="_blank" rel="noreferrer">
                  {player.news[0].headline}
                </a>
              )}
            </span>
            {player.injuryStatus && <span className="tag tag-bad">{player.injuryStatus}</span>}
            {player.projected != null && <span className="points">{player.projected}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function sortBySlot(players) {
  return [...players].sort((a, b) => {
    const left = SLOT_ORDER.indexOf(a.slot || a.position)
    const right = SLOT_ORDER.indexOf(b.slot || b.position)
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right)
  })
}
