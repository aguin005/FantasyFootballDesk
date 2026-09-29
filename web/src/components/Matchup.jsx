import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import { Pill, SlotPill } from './ui.jsx'
import { clockTime, formatPoints, kickoffLabel, signed } from '../lib/format.js'
import { lastResult } from '../lib/matchup.js'

const OUTCOME_TONE = { ahead: 'is-up', behind: 'is-down', even: '' }
const LAST_OUTCOME = { won: 'Won', lost: 'Lost', tied: 'Tied' }

/**
 * This week's matchup at the top of Today. Before kickoff the big numbers are the
 * projections, and once games start they become the live score, with the projected
 * final underneath. Tapping it opens the head to head.
 */
export function MatchupCard({ matchup, league, nextKickoff, onOpen }) {
  const { me, them, started, live, final, outcome } = matchup
  // The side that recedes follows the numbers on screen, the live score once games
  // start, while the verdict below keeps judging the projection. Trailing now and
  // projected to win is a real and common state on a Sunday afternoon.
  const lead = started ? me.score - them.score : me.projection - them.projection
  const last = started ? null : lastResult(league)
  return (
    <section className="section" aria-label="This week's matchup">
      <button type="button" className="card matchup press" onClick={onOpen}>
        <span className="matchup-top">
          <span>
            Week {matchup.week} · {league.name}
          </span>
          {final ? <Pill>Final</Pill> : live ? <Pill tone="green">Live</Pill> : null}
        </span>

        <span className="matchup-sides">
          <Side side={me} started={started} behind={lead < -0.05} />
          <span className="matchup-vs" aria-hidden="true">
            vs
          </span>
          <Side side={them} started={started} behind={lead > 0.05} end />
        </span>

        <span className="matchup-bar" aria-hidden="true">
          <span className="is-me" style={{ flexGrow: Math.max(me.projection, 0.1) }} />
          <span className="is-them" style={{ flexGrow: Math.max(them.projection, 0.1) }} />
        </span>

        <span className="matchup-foot">
          <span className={OUTCOME_TONE[outcome]}>{verdict(matchup)}</span>
          <span className="matchup-link">
            Head to head
            <Icon name="chevronRight" strokeWidth={2.4} />
          </span>
        </span>

        {!final && nextKickoff && (
          <span className="matchup-next">Next kickoff {kickoffLabel({ kickoffISO: nextKickoff })}</span>
        )}

        {last && (
          <span className="matchup-last">
            <span className={last.outcome === 'won' ? 'is-up' : last.outcome === 'lost' ? 'is-down' : undefined}>
              Week {last.week}: {LAST_OUTCOME[last.outcome]}
            </span>{' '}
            {formatPoints(last.score)} to {formatPoints(last.opponentScore)}
            {last.opponent ? ` against ${last.opponent}` : ''}
          </span>
        )}
      </button>
    </section>
  )
}

function Side({ side, started, behind, end }) {
  const className = ['matchup-side', end && 'is-end', behind && 'is-behind'].filter(Boolean).join(' ')
  return (
    <span className={className}>
      <span className="matchup-name">{side.name}</span>
      <span className="matchup-score">{formatPoints(started ? side.score : side.projection)}</span>
      <span className="matchup-sub">
        {started ? `Proj ${formatPoints(side.projection)}` : 'Projected'}
        {side.left > 0 ? ` · ${side.left} to play` : ''}
      </span>
    </span>
  )
}

function verdict({ final, outcome, margin }) {
  const by = formatPoints(Math.abs(margin))
  if (final) return outcome === 'even' ? 'Tied' : outcome === 'ahead' ? `Won by ${by}` : `Lost by ${by}`
  if (outcome === 'even') return 'Dead even on projection'
  return outcome === 'ahead' ? `Projected to win by ${by}` : `Projected to lose by ${by}`
}

/**
 * Both lineups slot against slot. The projected column is where each starter is
 * headed by the end of their game, so a player halfway through a big day reads
 * higher than their pregame projection.
 */
export function MatchupSheet({ open, matchup, now, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="matchup-sheet-title">
      {matchup && (
        <>
          <h2 id="matchup-sheet-title" className="sheet-title">
            Week {matchup.week} matchup
          </h2>
          <div className="h2h-head">
            <TeamTotal side={matchup.me} started={matchup.started} />
            <span className={`h2h-margin ${OUTCOME_TONE[matchup.outcome]}`}>
              {signed(matchup.margin)}
              <small>{matchup.final ? 'final' : 'proj'}</small>
            </span>
            <TeamTotal side={matchup.them} started={matchup.started} end />
          </div>

          <div className="card">
            <ul className="h2h-list">
              {matchup.pairs.map((pair, index) => (
                <li key={`${pair.slot}-${index}`}>
                  <Starter row={pair.mine} now={now} />
                  <SlotPill label={pair.slot} position={(pair.mine || pair.theirs)?.player.position} />
                  <Starter row={pair.theirs} now={now} end />
                </li>
              ))}
            </ul>
          </div>
          <p className="section-foot">
            Scores are as of the last refresh. Projections blend points scored so far with what is left
            of each game.
          </p>
        </>
      )}
    </Sheet>
  )
}

function TeamTotal({ side, started, end }) {
  return (
    <div className={end ? 'h2h-team is-end' : 'h2h-team'}>
      <span className="matchup-name">{side.name}</span>
      <span className="h2h-total">{formatPoints(started ? side.score : side.projection)}</span>
      <span className="matchup-sub">{started ? `Proj ${formatPoints(side.projection)}` : 'Projected'}</span>
    </div>
  )
}

function Starter({ row, now, end }) {
  if (!row) return <span className={end ? 'h2h-player is-end is-empty' : 'h2h-player is-empty'}>Empty</span>
  const { player, expected, state } = row
  const started = state === 'live' || state === 'played'
  return (
    <span className={end ? 'h2h-player is-end' : 'h2h-player'}>
      <span className="h2h-name">{shortName(player)}</span>
      <span className="h2h-meta">
        {player.team} · {status(player, state, now)}
      </span>
      <span className="h2h-points">
        <span className="h2h-score">{started ? formatPoints(player.points ?? 0) : '-'}</span>
        <span className="h2h-proj">proj {formatPoints(expected)}</span>
      </span>
    </span>
  )
}

function status(player, state, now) {
  if (state === 'live') return 'Live'
  if (state === 'played') return 'Played'
  if (!player.game) return 'Bye'
  if (!player.game.kickoffISO) return player.game.weekday || ''
  const kickoff = new Date(player.game.kickoffISO)
  const sameDay = kickoff.toDateString() === new Date(now).toDateString()
  return sameDay ? clockTime(player.game.kickoffISO) : kickoffLabel(player.game)
}

/** "J. Allen", so two names fit side by side on a phone. Defenses keep their team. */
function shortName(player) {
  if (player.position === 'DEF') return `${player.team} D/ST`
  const parts = String(player.name || '').split(' ')
  return parts.length < 2 ? player.name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}
