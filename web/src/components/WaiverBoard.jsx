import Portrait from './Portrait.jsx'

export default function WaiverBoard({ waivers, platform }) {
  if (!waivers || waivers.length === 0) {
    return <p className="empty">No free agents came back for this league on the last refresh.</p>
  }

  return (
    <div className="group">
      <h3>Best available</h3>
      {platform === 'sleeper' && (
        <p className="note">
          Sleeper does not publish projections, so this list ranks on how fast managers are adding
          each player and on their role with their NFL team.
        </p>
      )}
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
  )
}
