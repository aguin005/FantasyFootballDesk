import { useState } from 'react'
import Portrait from './Portrait.jsx'

/**
 * Trade evaluation runs on rest of season projections rather than weekly ones,
 * since a trade is a claim about the remaining schedule, not about Sunday.
 *
 * The number shown is the change in projected points for each side. It deliberately
 * does not pretend to price positional scarcity or roster construction, because a
 * single confident number would be more misleading than useful.
 */
export default function TradeBoard({ league }) {
  const teams = league.teams || []
  const mine = teams.find((team) => team.isMine)
  const others = teams.filter((team) => !team.isMine)

  const [partnerId, setPartnerId] = useState(others[0]?.teamId ?? null)
  const [giving, setGiving] = useState(new Set())
  const [getting, setGetting] = useState(new Set())

  if (!mine || others.length === 0) {
    return <p className="empty">Trade evaluation needs every team's roster, which this league did not return.</p>
  }

  const partner = others.find((team) => team.teamId === partnerId) || others[0]
  const givingValue = total(mine.roster, giving)
  const gettingValue = total(partner.roster, getting)
  const net = gettingValue - givingValue

  return (
    <div className="trade">
      <div className="trade-head">
        <select
          className="trade-partner"
          value={partner.teamId}
          onChange={(event) => {
            setPartnerId(Number(event.target.value))
            setGetting(new Set())
          }}
        >
          {others.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.name}
            </option>
          ))}
        </select>
        <span className={net >= 0 ? 'trade-net is-good' : 'trade-net'}>
          {net >= 0 ? '+' : ''}
          {net.toFixed(1)}
        </span>
      </div>

      <p className="note">
        Projected points for the rest of the season. Positive means you come out ahead on raw
        projection, which is one input rather than an answer.
      </p>

      <div className="trade-columns">
        <TradeSide
          title="You give"
          players={mine.roster}
          selected={giving}
          onToggle={(id) => setGiving(toggle(giving, id))}
          value={givingValue}
        />
        <TradeSide
          title="You get"
          players={partner.roster}
          selected={getting}
          onToggle={(id) => setGetting(toggle(getting, id))}
          value={gettingValue}
        />
      </div>
    </div>
  )
}

function TradeSide({ title, players, selected, onToggle, value }) {
  const sorted = [...players].sort(
    (a, b) => (b.seasonProjected ?? 0) - (a.seasonProjected ?? 0)
  )

  return (
    <div className="trade-side">
      <h3>
        {title} <span className="day-count">{value.toFixed(1)} points</span>
      </h3>
      <ul className="rows">
        {sorted.map((player) => (
          <li
            key={player.playerId}
            className={selected.has(player.playerId) ? 'row row-pick is-picked' : 'row row-pick'}
            data-pos={player.position}
            onClick={() => onToggle(player.playerId)}
          >
            <span className="slot">{player.position}</span>
            <Portrait player={player} />
            <span className="who">
              <span className="name">{player.name}</span>
              <span className="meta">
                {player.team}
                {player.injuryStatus ? `, ${player.injuryStatus}` : ''}
              </span>
            </span>
            <span className="points">
              {player.seasonProjected != null ? player.seasonProjected.toFixed(0) : '--'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function toggle(set, id) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function total(players, selected) {
  return players
    .filter((player) => selected.has(player.playerId))
    .reduce((sum, player) => sum + (player.seasonProjected ?? 0), 0)
}
