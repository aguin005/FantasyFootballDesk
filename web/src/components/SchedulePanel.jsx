import { useEffect, useRef } from 'react'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import TeamLogo from './TeamLogo.jsx'
import { EmptyState, Pill } from './ui.jsx'
import { clockTime, plural } from '../lib/format.js'
import { teamCode, teamFullName, teamNickname } from '../lib/teams.js'
import { playersInGame, rosterByTeam, scheduleDays, shortName } from '../lib/nflSchedule.js'

// A horizontal drag this far on the tab opens the panel, the way a drawer pulls out.
const PULL_PX = 24

/**
 * The slim tab on the right edge that pulls out the NFL schedule. A tap opens it
 * too, and so does a drag toward the middle of the screen.
 */
export function ScheduleTab({ onOpen, inert }) {
  const start = useRef(null)
  return (
    <button
      type="button"
      className="schedule-tab glass press"
      aria-label="NFL schedule"
      aria-haspopup="dialog"
      inert={inert ? '' : undefined}
      onClick={onOpen}
      onPointerDown={(event) => {
        start.current = event.clientX
        // The tab is narrow, so the drag leaves it at once. Capturing keeps the
        // moves coming here. Touch captures on its own, a mouse has to ask.
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current != null && start.current - event.clientX > PULL_PX) {
          start.current = null
          onOpen()
        }
      }}
      onPointerUp={() => {
        start.current = null
      }}
      onPointerCancel={() => {
        start.current = null
      }}
    >
      <Icon name="calendar" strokeWidth={2.2} />
    </button>
  )
}

/**
 * Every game this week in kickoff order, grouped by day in your own time zone,
 * with the teams on bye at the end. Games with your players list them, since
 * that is usually why you are looking. Each game links to ESPN's game page, which
 * is where live scores are.
 */
export default function SchedulePanel({ open, onClose, schedule, league, now }) {
  const list = useRef(null)
  const days = scheduleDays(schedule?.games, now)
  const mine = rosterByTeam(league?.roster)
  const byes = schedule?.byes || []

  // Open at the day of the first game still to finish, its heading just below the
  // sticky title. The first day needs no scrolling at all.
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => {
      const target = list.current?.querySelector('[data-current]')
      const container = list.current?.closest('.sheet-body')
      const head = container?.querySelector('.schedule-head')
      if (!target || !container || target === list.current.firstElementChild) return
      const below = head ? head.getBoundingClientRect().bottom : container.getBoundingClientRect().top
      container.scrollTop += target.getBoundingClientRect().top - below - 8
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} labelledBy="schedule-title" side>
      <header className="schedule-head">
        <h2 id="schedule-title" className="sheet-title">
          NFL schedule
        </h2>
        <p className="schedule-sub">
          {schedule?.week ? `Week ${schedule.week} · ` : ''}Times in your time zone
        </p>
      </header>

      {days.length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="Schedule unavailable">
            The NFL schedule did not load on the last refresh. It will be back on the next one.
          </EmptyState>
        </div>
      ) : (
        <div ref={list}>
          {days.map((day) => (
            <section
              key={day.key}
              className="schedule-day"
              aria-label={day.label}
              data-current={day.games.some((game) => game.current) ? '' : undefined}
            >
              <h3>
                {day.label}
                <span>{plural(day.games.length, 'game')}</span>
              </h3>
              <ul className="card schedule-list">
                {day.games.map((game) => (
                  <li key={`${game.away}-${game.home}`}>
                    <GameRow game={game} mine={playersInGame(mine, game)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {byes.length > 0 && (
            <section className="schedule-day" aria-label="On bye">
              <h3>
                On bye
                <span>{plural(byes.length, 'team')}</span>
              </h3>
              <ul className="card bye-list">
                {byes.map((team) => {
                  const yours = mine.get(teamCode(team)) || []
                  return (
                    <li key={team}>
                      <TeamLogo team={team} size={26} />
                      <span className="bye-name">
                        {teamNickname(team)}
                        {yours.length > 0 && <Yours players={yours} />}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  )
}

function GameRow({ game, mine }) {
  const { status } = game
  const final = status === 'final' && game.awayScore != null && game.homeScore != null
  const body = (
    <>
      <span className="game-teams">
        <TeamLine team={game.away} score={final ? game.awayScore : null} lost={final && game.awayScore < game.homeScore} />
        <span className="visually-hidden"> at </span>
        <TeamLine team={game.home} score={final ? game.homeScore : null} lost={final && game.homeScore < game.awayScore} />
      </span>
      <span className="game-state">
        {status === 'live' ? (
          <Pill tone="green">Live</Pill>
        ) : status === 'final' ? (
          <span className="game-final">Final</span>
        ) : game.kickoffISO ? (
          <span className="game-time">{clockTime(game.kickoffISO)}</span>
        ) : (
          <span className="game-final">TBD</span>
        )}
        {game.current && status === 'upcoming' && <span className="game-next">Up next</span>}
      </span>
      {mine.length > 0 && <Yours players={mine} />}
    </>
  )

  if (!game.espnGameId) return <div className="game">{body}</div>
  return (
    <a
      className="game press"
      href={`https://www.espn.com/nfl/game/_/gameId/${game.espnGameId}`}
      target="_blank"
      rel="noreferrer"
      title={`${teamFullName(game.away)} at ${teamFullName(game.home)} on ESPN`}
    >
      {body}
    </a>
  )
}

function TeamLine({ team, score, lost }) {
  return (
    <span className={lost ? 'game-team is-lost' : 'game-team'}>
      <TeamLogo team={team} />
      <span className="game-name">{teamNickname(team)}</span>
      {score != null && <span className="game-score">{score}</span>}
    </span>
  )
}

/** "Yours: J. Allen, J. Cook", starters first and bench players muted. */
function Yours({ players }) {
  return (
    <span className="game-mine">
      Yours:{' '}
      {players.map((player, index) => (
        <span key={player.playerId} className={player.starter ? undefined : 'is-bench'}>
          {index > 0 ? ', ' : ''}
          {shortName(player)}
          {player.starter ? '' : ' (bench)'}
        </span>
      ))}
    </span>
  )
}
