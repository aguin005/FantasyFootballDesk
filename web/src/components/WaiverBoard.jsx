import Portrait from './Portrait.jsx'

export default function WaiverBoard({ waivers, consensus }) {
  if (!waivers || waivers.length === 0) {
    return <p className="empty">No free agents came back for this league on the last refresh.</p>
  }

  return (
    <div className="stack">
      <ConsensusBoard rows={consensus} />

      <div className="group">
        <h3>Best available</h3>
        <ul className="rows">
          {waivers.map((player) => (
          <li key={player.playerId} className="row row-waiver" data-pos={player.position}>
            <span className="score">{player.score}</span>
            <Portrait player={player} />
            <span className="who">
              <span className="name">{player.name}</span>
              <span className="meta">
                {player.position} {player.team}
                {player.percentOwned != null ? `, rostered in ${player.percentOwned}%` : ''}
              </span>
              <span className="reasons">
                {player.reasons.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </span>
            </span>
          </li>
        ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * What the fantasy press is recommending, above your own ranking. The interesting
 * part is where the two disagree: a player five outlets like who your model ranks
 * fortieth is usually already widely rostered, and a player your model likes that
 * nobody wrote up is the one to claim before Tuesday.
 */
function ConsensusBoard({ rows }) {
  if (!rows || rows.length === 0) return null

  return (
    <div className="group">
      <h3>
        What the writers are saying <span className="day-count">outlets naming each player</span>
      </h3>
      <ul className="rows">
        {rows.map((player) => (
          <li key={player.playerId} className="row row-consensus" data-pos={player.position}>
            <span className="tally">{player.count}</span>
            <Portrait player={player} />
            <span className="who">
              <span className="name">{player.name}</span>
              <span className="meta">
                {player.position} {player.team}
              </span>
              <span className="outlets">{player.sources.join(', ')}</span>
            </span>
            <span className="model">
              {player.modelScore == null ? (
                <span className="model-none">unranked here</span>
              ) : (
                <>
                  <span className="model-score">{player.modelScore}</span>
                  <span className="model-rank">#{player.modelRank} yours</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
