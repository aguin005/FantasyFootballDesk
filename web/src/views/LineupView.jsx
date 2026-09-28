import Icon from '../components/Icon.jsx'
import {
  Section,
  Segmented,
  PlayerRow,
  SlotPill,
  Points,
  Pill,
  EmptyState,
  InjuryPill,
  matchupText
} from '../components/ui.jsx'
import Portrait from '../components/Portrait.jsx'
import { formatPoints, signed, plural, clockTime, localDayKey } from '../lib/format.js'
import { sortBySlot, slotLabel, slotOf, gameState } from '../lib/lineup.js'

const SEGMENTS = [
  { value: 'roster', label: 'Roster' },
  { value: 'startsit', label: 'Start / Sit' },
  { value: 'schedule', label: 'Schedule' }
]

const REASON_LABEL = { out: 'Out', doubtful: 'Doubtful', bye: 'On bye', upgrade: 'Upgrade' }

export default function LineupView({ league, report, segment, onSegment, now, onOpenPlayer, onNavigate }) {
  const current = SEGMENTS.some((option) => option.value === segment) ? segment : 'roster'
  const options = SEGMENTS.map((option) =>
    option.value === 'startsit' && report.swaps.length + report.stranded.length > 0
      ? { ...option, count: report.swaps.length + report.stranded.length }
      : option
  )

  return (
    <>
      <Segmented options={options} value={current} onChange={onSegment} label="Lineup view" />
      <div key={current} className="view">
        {current === 'roster' && <Roster report={report} now={now} onOpenPlayer={onOpenPlayer} />}
        {current === 'startsit' && (
          <StartSit report={report} now={now} onOpenPlayer={onOpenPlayer} onNavigate={onNavigate} />
        )}
        {current === 'schedule' && <Schedule league={league} report={report} now={now} onOpenPlayer={onOpenPlayer} />}
      </div>
    </>
  )
}

function Roster({ report, now, onOpenPlayer }) {
  const groups = [
    ['Starters', report.starters, report.hasProjections ? `${formatPoints(report.projectedTotal)} pts` : null],
    ['Bench', report.bench, plural(report.bench.length, 'player')],
    ['Reserve', report.reserve, null]
  ]

  return groups.map(([title, players, meta]) =>
    players.length === 0 ? null : (
      <Section key={title} title={title} meta={meta} id={`roster-${title}`}>
        <div className="card">
          <ul className="list">
            {sortBySlot(players).map((player) => (
              <li key={player.playerId}>
                <PlayerRow
                  player={player}
                  lead={<SlotPill label={slotLabel(player)} position={player.position} />}
                  sub={[player.team, matchupText(player, now)].join(' · ')}
                  note={player.injuryNote || null}
                  trail={<Points value={player.projected} />}
                  onSelect={onOpenPlayer}
                  chevron={false}
                  newsDot
                />
              </li>
            ))}
          </ul>
        </div>
      </Section>
    )
  )
}

function StartSit({ report, now, onOpenPlayer, onNavigate }) {
  if (!report.hasProjections) {
    return (
      <div className="card">
        <EmptyState icon="chart" title="No projections yet">
          Nothing came back from the projection feeds on the last refresh, so there is nothing to compare.
        </EmptyState>
      </div>
    )
  }

  const { swaps, stranded, watch, lockedCount } = report
  const optimal = swaps.length === 0 && stranded.length === 0

  return (
    <>
      <div className="card all-clear">
        <span className="icon-disc" data-tone={optimal ? 'green' : stranded.length || swaps.some((s) => s.urgent) ? 'red' : 'green'}>
          <Icon name={optimal ? 'check' : 'swap'} strokeWidth={2.4} />
        </span>
        <div>
          <strong>
            {optimal ? 'Your lineup is optimal' : `${plural(swaps.length + stranded.length, 'change')} to make`}
          </strong>
          <p>
            {optimal
              ? 'Every open slot starts your best available projected player.'
              : report.pointsAdded > 0
                ? `Worth ${signed(report.pointsAdded)} projected points.`
                : 'Some starters will not play this week.'}
          </p>
        </div>
      </div>

      {swaps.length > 0 && (
        <Section
          title="Suggested swaps"
          id="startsit-swaps"
          foot="Upgrades under 1 projected point are left out, since projections are not that precise."
        >
          {swaps.map((swap) => (
            <SwapCard key={swap.starter.playerId} swap={swap} now={now} onOpenPlayer={onOpenPlayer} />
          ))}
        </Section>
      )}

      {stranded.length > 0 && (
        <Section title="Nobody to cover" id="startsit-stranded">
          <div className="card">
            <ul className="list">
              {stranded.map(({ starter, reason }) => (
                <li key={starter.playerId}>
                  <PlayerRow
                    player={starter}
                    lead={<SlotPill label={slotOf(starter)} position={starter.position} />}
                    sub={`${REASON_LABEL[reason]}. No eligible bench player.`}
                    trail={
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm press"
                        onClick={(event) => {
                          event.stopPropagation()
                          onNavigate('waivers', null, starter.position)
                        }}
                      >
                        Waivers
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {watch.length > 0 && (
        <Section
          title="Game time decisions"
          id="startsit-watch"
          foot="Questionable players usually play. Check the inactive list about 90 minutes before kickoff."
        >
          <div className="card">
            <ul className="list">
              {watch.map(({ starter, backup }) => (
                <li key={starter.playerId}>
                  <PlayerRow
                    player={starter}
                    lead={<SlotPill label={slotOf(starter)} position={starter.position} />}
                    sub={matchupText(starter, now)}
                    note={backup ? `Backup: ${backup.name}, ${formatPoints(backup.projected)} projected` : 'No healthy backup on the bench'}
                    trail={<Points value={starter.projected} />}
                    onSelect={onOpenPlayer}
                    chevron={false}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {lockedCount > 0 && (
        <p className="section-foot">
          {plural(lockedCount, 'starter')} already kicked off and {lockedCount === 1 ? 'is' : 'are'} locked,
          so {lockedCount === 1 ? 'that slot is' : 'those slots are'} left alone.
        </p>
      )}
    </>
  )
}

function SwapCard({ swap, now, onOpenPlayer }) {
  const { starter, replacement, gain, urgent, reason } = swap
  return (
    <div className="card swap">
      <div className="swap-head">
        <span className="swap-tags">
          <SlotPill label={slotOf(starter)} position={starter.position} />
          <Pill tone={urgent ? 'red' : 'green'} icon={urgent ? 'alert' : 'trendUp'}>
            {REASON_LABEL[reason]}
          </Pill>
        </span>
        {gain > 0 && <span className="swap-gain">{signed(gain)}</span>}
      </div>
      <div className="swap-pair">
        <SwapSide verb="Start" player={replacement} now={now} onOpenPlayer={onOpenPlayer} />
        <SwapSide verb="Bench" player={starter} now={now} onOpenPlayer={onOpenPlayer} out />
      </div>
    </div>
  )
}

function SwapSide({ verb, player, now, onOpenPlayer, out }) {
  return (
    <button
      type="button"
      className={out ? 'swap-side is-out press' : 'swap-side press'}
      data-pos={player.position}
      onClick={() => onOpenPlayer(player)}
    >
      <span className="swap-verb">{verb}</span>
      <Portrait player={player} size="sm" />
      <span className="row-main">
        <span className="row-title">
          <span className="name">{player.name}</span>
          <InjuryPill status={player.injuryStatus} />
        </span>
        <span className="row-sub">{[player.position, player.team, matchupText(player, now)].join(' · ')}</span>
      </span>
      <Points value={player.projected} caption={null} />
    </button>
  )
}

/**
 * Your roster by the day each player's team kicks off, earliest first. Days are
 * ordered by their first kickoff rather than a fixed weekday list, since the NFL
 * schedules games on Wednesdays, Saturdays, and in Europe at 6:30 in the morning.
 */
function Schedule({ league, report, now, onOpenPlayer }) {
  if (!report.scheduleKnown) {
    return (
      <div className="card">
        <EmptyState icon="calendar" title="Schedule unavailable">
          The NFL schedule did not load on the last refresh. It will be back on the next one.
        </EmptyState>
      </div>
    )
  }

  const byDay = new Map()
  const bye = []
  for (const player of league.roster) {
    if (!player.game) {
      bye.push(player)
      continue
    }
    const key = player.game.kickoffISO ? localDayKey(player.game.kickoffISO) : player.game.weekday
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(player)
  }

  const kickoff = (player) => Date.parse(player.game?.kickoffISO) || Number.MAX_SAFE_INTEGER
  const days = [...byDay.values()]
    .map((players) => players.sort((a, b) => kickoff(a) - kickoff(b) || Number(b.starter) - Number(a.starter)))
    .sort((a, b) => kickoff(a[0]) - kickoff(b[0]))

  return (
    <>
      {days.map((players) => {
        const first = players[0].game
        const title = first.kickoffISO
          ? new Date(first.kickoffISO).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
          : first.weekday
        const starting = players.filter((player) => player.starter).length
        return (
          <Section key={title} title={title} meta={`${starting} starting`} id={`day-${title}`}>
            <div className="card">
              <ul className="list">
                {players.map((player) => (
                  <li key={player.playerId}>
                    <PlayerRow
                      player={player}
                      lead={<SlotPill label={slotLabel(player)} position={player.position} />}
                      sub={`${player.game.matchup} · ${player.team}`}
                      trail={<GameTime player={player} now={now} />}
                      onSelect={onOpenPlayer}
                      chevron={false}
                      dim={!player.starter}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )
      })}

      {bye.length > 0 && (
        <Section title="Bye week" meta={plural(bye.length, 'player')} id="day-bye">
          <div className="card">
            <ul className="list">
              {bye.map((player) => (
                <li key={player.playerId}>
                  <PlayerRow
                    player={player}
                    lead={<SlotPill label={slotLabel(player)} position={player.position} />}
                    sub={player.team === 'FA' ? 'Free agent, no team' : player.team}
                    trail={player.starter ? <Pill tone="red">In lineup</Pill> : null}
                    onSelect={onOpenPlayer}
                    chevron={false}
                    dim={!player.starter}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
    </>
  )
}

function GameTime({ player, now }) {
  const state = gameState(player, now)
  if (state === 'live') return <Pill tone="green">Live</Pill>
  if (state === 'played') return <Pill>Played</Pill>
  if (!player.game.kickoffISO) return null
  return (
    <span className="row-trail">
      <span className="row-value is-time">{clockTime(player.game.kickoffISO)}</span>
    </span>
  )
}
