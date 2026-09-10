import Portrait from './Portrait.jsx'

const FLEX = new Set(['RB', 'WR', 'TE'])

/**
 * Compares each starter against the bench players who could legally replace them,
 * meaning the same position, or any flex position when the starter is in a flex
 * slot. Only swaps that gain at least a point are shown, since projections are not
 * precise enough for anything tighter to mean much.
 */
export default function StartSitBoard({ roster }) {
  const hasProjections = roster.some((player) => player.projected != null)
  if (!hasProjections) {
    return (
      <p className="empty">
        This league does not publish projections, so there is nothing to compare. The lineup and
        schedule tabs still work.
      </p>
    )
  }

  const starters = roster.filter((player) => player.starter)
  const bench = roster.filter((player) => !player.starter && player.slot !== 'IR')
  const swaps = []

  for (const starter of starters) {
    const eligible = bench.filter((player) => canReplace(starter, player))
    const best = eligible
      .filter((player) => player.projected != null)
      .sort((a, b) => b.projected - a.projected)[0]

    if (!best) continue
    const gain = (best.projected ?? 0) - (starter.projected ?? 0)
    const benched = Boolean(starter.injuryStatus) || !starter.game

    if (gain >= 1 || benched) {
      swaps.push({ starter, replacement: best, gain, benched })
    }
  }

  swaps.sort((a, b) => Number(b.benched) - Number(a.benched) || b.gain - a.gain)

  if (swaps.length === 0) {
    return <p className="empty">Your lineup already starts your best projected player at every slot.</p>
  }

  return (
    <div className="group">
      <h3>Suggested changes</h3>
      <ul className="swaps">
        {swaps.map(({ starter, replacement, gain, benched }) => (
          <li className="swap" key={starter.playerId}>
            <span className="swap-slot">{starter.slot || starter.position}</span>
            <div className="swap-pair">
              <Side player={replacement} label="Start" />
              <Side player={starter} label="Sit" muted />
            </div>
            <span className="swap-gain">
              {gain > 0 ? `+${gain.toFixed(1)}` : reason(starter, benched)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Side({ player, label, muted }) {
  return (
    <div className={muted ? 'swap-side is-muted' : 'swap-side'}>
      <span className="swap-label">{label}</span>
      <Portrait player={player} />
      <span className="who">
        <span className="name">{player.name}</span>
        <span className="meta">
          {player.position} {player.team}
          {player.game ? ` ${player.game.matchup}` : ', bye'}
          {player.projected != null ? `, ${player.projected} projected` : ''}
          {player.injuryStatus ? `, ${player.injuryStatus}` : ''}
        </span>
      </span>
    </div>
  )
}

function canReplace(starter, candidate) {
  const slot = starter.slot || starter.position
  if (slot === 'FLEX') return FLEX.has(candidate.position)
  return candidate.position === starter.position
}

function reason(starter, benched) {
  if (!benched) return ''
  return starter.injuryStatus ? starter.injuryStatus : 'On bye'
}
