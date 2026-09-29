import { useId, useState } from 'react'
import { formatPoints } from '../lib/format.js'

const PLOT_HEIGHT = 132

/**
 * Fantasy points by week, one column per week of the season so far.
 *
 * One series, so one color and no legend: the title says what is plotted. Only
 * the best week carries a label on the chart. Every other value is one tap away
 * in the readout under the plot, and all of them are in the table view, so no
 * number depends on hovering. Weeks without a game keep their slot, which is how
 * a bye or a missed game shows as a gap instead of silently closing up.
 */
export default function PointsChart({ log, scoringLabel }) {
  const titleId = useId()
  const games = log.weeks.map(([week, opponent, points]) => ({ week, opponent, points }))
  const lastWeek = games[games.length - 1].week
  const slots = Array.from({ length: lastWeek }, (_, index) => {
    const week = index + 1
    return games.find((game) => game.week === week) || { week, opponent: null, points: null }
  })

  const played = games.map((game) => game.points)
  const average = played.reduce((sum, value) => sum + value, 0) / played.length
  const best = games.reduce((top, game) => (game.points > top.points ? game : top), games[0])
  const recent = games.slice(-3)
  const recentAverage = recent.reduce((sum, game) => sum + game.points, 0) / recent.length
  const top = niceMax(Math.max(...played, 1))

  const [active, setActive] = useState(games[games.length - 1].week)
  const shown = slots[active - 1]

  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption className="chart-head">
        <span id={titleId} className="chart-title">
          Points by week
        </span>
        <span className="chart-sub">
          {log.season}
          {scoringLabel ? ` · ${scoringLabel}` : ''}
        </span>
      </figcaption>

      <div className="stat-grid chart-stats">
        <Stat label="Average" value={formatPoints(average)} note={`${games.length} ${games.length === 1 ? 'game' : 'games'}`} />
        <Stat label="Best" value={formatPoints(best.points)} note={`Week ${best.week}`} />
        <Stat label={`Last ${recent.length}`} value={formatPoints(recentAverage)} note="average" />
      </div>

      <div className="chart-plot" style={{ height: PLOT_HEIGHT }}>
        <span className="chart-grid" style={{ bottom: '100%' }} aria-hidden="true">
          <span>{top}</span>
        </span>
        <span className="chart-grid" style={{ bottom: '50%' }} aria-hidden="true">
          <span>{top / 2}</span>
        </span>
        <span className="chart-grid is-base" style={{ bottom: 0 }} aria-hidden="true">
          <span>0</span>
        </span>
        <span className="chart-avg" style={{ bottom: `${(average / top) * 100}%` }} aria-hidden="true">
          <span>Avg {formatPoints(average)}</span>
        </span>

        <div className="chart-cols" role="group" aria-label="Weeks">
          {slots.map((slot) => {
            const height = slot.points == null ? 0 : Math.max(0, slot.points / top) * 100
            const label =
              slot.points == null
                ? `Week ${slot.week}, no game`
                : `Week ${slot.week} against ${slot.opponent}, ${formatPoints(slot.points)} points`
            return (
              <button
                key={slot.week}
                type="button"
                className={slot.week === active ? 'chart-col is-active' : 'chart-col'}
                aria-label={label}
                aria-pressed={slot.week === active}
                onPointerEnter={() => setActive(slot.week)}
                onFocus={() => setActive(slot.week)}
                onClick={() => setActive(slot.week)}
              >
                {slot.points != null && <span className="chart-bar" style={{ height: `${height}%` }} />}
                {slot.week === best.week && (
                  <span className="chart-value" style={{ bottom: `${height}%` }}>
                    {formatPoints(slot.points)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="chart-x" aria-hidden="true">
        {slots.map((slot) => (
          <span key={slot.week} className={slot.week === active ? 'is-active' : undefined}>
            {slot.week}
          </span>
        ))}
      </div>

      <p className="chart-readout" role="status">
        <strong>{shown.points == null ? 'No game' : `${formatPoints(shown.points)} points`}</strong>
        <span>
          Week {shown.week}
          {shown.opponent ? ` against ${shown.opponent}` : ', bye or did not play'}
        </span>
      </p>

      <details className="chart-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Opponent</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.week}>
                <td>{slot.week}</td>
                <td>{slot.opponent || 'No game'}</td>
                <td>{slot.points == null ? '-' : formatPoints(slot.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-delta">{note}</span>
    </div>
  )
}

/** A clean top for the axis, 10, 20, 30, 40, so the ticks read as round numbers. */
function niceMax(value) {
  const step = value > 60 ? 20 : 10
  return Math.ceil(value / step) * step
}
