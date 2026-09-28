import { useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon.jsx'
import { Section, Segmented, PlayerRow, Points, EmptyState, LinkButton } from '../components/ui.jsx'
import { formatPoints, signed } from '../lib/format.js'

/**
 * Trade evaluation on season projections, since a trade is a claim about the rest
 * of the schedule rather than about Sunday.
 *
 * The number is the change in projected points for your side. It deliberately does
 * not price positional scarcity or roster construction, because one confident
 * number would be more misleading than a rough one you interpret yourself.
 */
export default function TradeView({ league }) {
  const teams = league.teams || []
  const mine = teams.find((team) => team.isMine)
  const others = teams.filter((team) => !team.isMine)

  const [partnerId, setPartnerId] = useState(others[0]?.teamId ?? null)
  const [giving, setGiving] = useState(() => new Set())
  const [getting, setGetting] = useState(() => new Set())
  const [side, setSide] = useState('give')

  if (!mine || others.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="trade" title="Trades unavailable">
          Pricing a trade needs every team's roster, which this league did not return.
        </EmptyState>
      </div>
    )
  }

  const partner = others.find((team) => String(team.teamId) === String(partnerId)) || others[0]
  const givingValue = total(mine.roster, giving)
  const gettingValue = total(partner.roster, getting)
  const net = gettingValue - givingValue
  const anything = giving.size + getting.size > 0
  const scale = Math.max(givingValue, gettingValue, 1)

  const reset = () => {
    setGiving(new Set())
    setGetting(new Set())
  }

  return (
    <>
      <div className="card picker">
        <label className="picker-label" htmlFor="trade-partner">
          Trade with
        </label>
        <select
          id="trade-partner"
          value={partner.teamId}
          onChange={(event) => {
            setPartnerId(event.target.value)
            setGetting(new Set())
          }}
        >
          {others.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              {team.name}
            </option>
          ))}
        </select>
        <Icon name="chevronUpDown" strokeWidth={2.2} />
      </div>

      <Segmented
        className="trade-seg"
        label="Trade side"
        value={side}
        onChange={setSide}
        options={[
          { value: 'give', label: 'You give', count: giving.size || null },
          { value: 'get', label: 'You get', count: getting.size || null }
        ]}
      />

      <div className="trade-columns">
        <TradeSide
          title="You give"
          hidden={side !== 'give'}
          players={mine.roster}
          selected={giving}
          onToggle={(id) => setGiving(toggle(giving, id))}
          action={
            anything && (
              <LinkButton icon={null} onClick={reset}>
                Clear
              </LinkButton>
            )
          }
        />
        <TradeSide
          title={`${partner.name} gives`}
          hidden={side !== 'get'}
          players={partner.roster}
          selected={getting}
          onToggle={(id) => setGetting(toggle(getting, id))}
        />
      </div>

      {createPortal(
        <div className="dock glass" role="status" aria-live="polite">
          {anything ? (
            <div className="dock-trade">
              <div className="dock-sides">
                <DockBar label="Give" value={givingValue} scale={scale} />
                <DockBar label="Get" value={gettingValue} scale={scale} get />
              </div>
              <div className={net > 0.05 ? 'dock-net is-up' : net < -0.05 ? 'dock-net is-down' : 'dock-net'}>
                <span className="stat-label">Net</span>
                <span className="stat-value">{signed(net)}</span>
              </div>
            </div>
          ) : (
            <p className="dock-hint">Pick players on both sides to compare their season projections.</p>
          )}
        </div>,
        // Rendered at the body so no animated or transformed ancestor can trap
        // its fixed position.
        document.body
      )}
    </>
  )
}

function TradeSide({ title, hidden, players, selected, onToggle, action }) {
  const sorted = [...players].sort((a, b) => (b.seasonProjected ?? 0) - (a.seasonProjected ?? 0))
  return (
    <div className="trade-side" hidden={hidden}>
      <Section title={title} action={action} id={`trade-${title}`}>
        <div className="card">
          <ul className="list">
            {sorted.map((player) => (
              <li key={player.playerId}>
                <PlayerRow
                  player={player}
                  lead={
                    <span className="check" aria-hidden="true">
                      <Icon name="check" strokeWidth={3} />
                    </span>
                  }
                  sub={`${player.position} · ${player.team}`}
                  trail={<Points value={player.seasonProjected} caption="season" digits={0} />}
                  selected={selected.has(player.playerId)}
                  onSelect={() => onToggle(player.playerId)}
                  chevron={false}
                />
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  )
}

function DockBar({ label, value, scale, get }) {
  return (
    <div className={get ? 'dock-bar is-get' : 'dock-bar'}>
      <span>{label}</span>
      <span className="bar">
        <span style={{ width: `${(value / scale) * 100}%` }} />
      </span>
      <span className="num">{formatPoints(value, 0)}</span>
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
