import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import { Pill, Section, SlotPill } from './ui.jsx'
import { clockTime, formatPoints, kickoffLabel, plural, signed } from '../lib/format.js'
import { lastResult } from '../lib/matchup.js'
import { chanceLabel, gainLabel, itemLine, itemNote, playerLabel, swapLine } from '../lib/prep.js'

const OUTCOME_TONE = { ahead: 'is-up', behind: 'is-down', even: '' }
const LAST_OUTCOME = { won: 'Won', lost: 'Lost', tied: 'Tied' }

/**
 * This week's matchup at the top of Today. Before kickoff the big numbers are the
 * projections, and once games start they become the live score, with the projected
 * final underneath. Tapping it opens the head to head.
 */
export function MatchupCard({ matchup, league, prep, nextKickoff, onOpen }) {
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

        {prep && <PrepLine prep={prep} />}

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

/**
 * The card's prep line: your chance to win, after the to-do list when there is
 * one, and how many items are left on it.
 */
function PrepLine({ prep }) {
  return (
    <span className="matchup-prep">
      <span className="matchup-chance">
        <strong>{chanceLabel(prep.todo ? prep.planned : prep.chance)}</strong>
        {prep.todo ? ' to win after your to-do list' : ' to win'}
      </span>
      <span className={prep.todo ? 'matchup-todo' : 'matchup-todo is-done'}>
        {prep.todo ? `${prep.todo} to do` : 'Lineup set'}
      </span>
    </span>
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
export function MatchupSheet({ open, matchup, prep, now, onClose }) {
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

          {prep && <WinChance prep={prep} />}
          {prep && <ToDo prep={prep} />}

          <Section title="Head to head" id="prep-h2h">
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
          </Section>

          {prep && <Scouting prep={prep} />}
          {prep && <Series prep={prep} />}

          <p className="section-foot">
            Scores are as of the last refresh. Projections blend points scored so far with what is left
            of each game.
            {prep &&
              " The win chance treats each starter's score as a spread around their projection, wider for players whose weekly scores swing more, and narrower as their game is played."}
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

/** Your chance to win, before and after the to-do list, and what it assumes. */
function WinChance({ prep }) {
  const shown = prep.todo ? prep.planned : prep.chance
  const moved = Math.round(prep.planned * 100) !== Math.round(prep.chance * 100)
  const covered = prep.theirSwaps.filter((swap) => swap.replacement).length
  const notes = []
  if (prep.todo && moved) notes.push(`${chanceLabel(prep.chance)} with your lineup as it is set now.`)
  if (covered) notes.push(`Counts the ${plural(covered, 'swap')} ${prep.opponent} will likely make, listed under Scouting.`)
  notes.push(
    prep.status === 'underdog'
      ? "You're the underdog."
      : prep.status === 'favorite'
        ? "You're the favorite."
        : "It's close to even."
  )
  return (
    <div className="card prep-chance">
      <div className="prep-chance-top">
        <span className="prep-chance-value">{chanceLabel(shown)}</span>
        <span className="prep-chance-label">{prep.todo && moved ? 'to win after your to-do list' : 'to win'}</span>
      </div>
      <div
        className="prep-meter"
        role="img"
        aria-label={`${chanceLabel(shown)} chance to win`}
      >
        <span style={{ width: `${Math.round(shown * 100)}%` }} />
      </div>
      <p className="prep-chance-note">{notes.join(' ')}</p>
    </div>
  )
}

const ITEM_LOOK = {
  start: { icon: 'swap', tone: 'orange' },
  pickup: { icon: 'waivers', tone: 'orange' },
  hole: { icon: 'alert', tone: 'red' },
  upgrade: { icon: 'waivers', tone: 'green' },
  swing: { icon: 'bolt' }
}

/** Everything to do before kickoff, each with what it adds to your chance. */
function ToDo({ prep }) {
  return (
    <Section title="Before kickoff" id="prep-todo">
      <div className="card">
        {prep.items.length === 0 ? (
          <div className="all-clear">
            <span className="icon-disc" data-tone="green">
              <Icon name="check" strokeWidth={2.6} />
            </span>
            <div>
              <strong>Your lineup is set</strong>
              <p>Nothing to do before kickoff.</p>
            </div>
          </div>
        ) : (
          <ul className="list">
            {prep.items.map((item, index) => {
              const look = item.kind === 'start' && item.reason === 'upgrade' ? { icon: 'swap', tone: 'green' } : ITEM_LOOK[item.kind]
              const gain = gainLabel(item.gain)
              return (
                <li key={`${item.kind}-${index}`}>
                  <div className="row prep-item">
                    <span className="icon-disc" data-tone={look.tone}>
                      <Icon name={item.kind === 'swing' && item.status === 'favorite' ? 'shield' : look.icon} strokeWidth={2.4} />
                    </span>
                    <span className="row-body">
                      <span className="row-main">
                        <span className="row-title is-wrap">
                          <span className="name">{itemLine(item)}</span>
                        </span>
                        <span className="row-note">{itemNote(item)}</span>
                      </span>
                      {gain ? (
                        <span className="row-trail">
                          <Pill tone="green">{gain}</Pill>
                        </span>
                      ) : item.kind === 'swing' ? (
                        <span className="row-trail">
                          <Pill tone="purple">Tip</Pill>
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Section>
  )
}

/** The team you face: their likely changes, where each side is stronger, and recent scores. */
function Scouting({ prep }) {
  const facts = []
  if (prep.theirSwaps.length) {
    facts.push({ label: 'Likely changes', lines: prep.theirSwaps.map(swapLine) })
  }
  if (prep.edges.mine.length) {
    facts.push({
      label: 'Your edge',
      lines: prep.edges.mine.map(
        (edge) => `${edge.slot}: ${playerLabel(edge.mine)} over ${playerLabel(edge.theirs)} by\u00a0${formatPoints(edge.diff)}`
      )
    })
  }
  if (prep.edges.theirs.length) {
    facts.push({
      label: 'Their edge',
      lines: prep.edges.theirs.map(
        (edge) => `${edge.slot}: ${playerLabel(edge.theirs)} over ${playerLabel(edge.mine)} by\u00a0${formatPoints(-edge.diff)}`
      )
    })
  }
  const form = (side) =>
    side.games.length
      ? `${side.games.map((game) => formatPoints(game.points)).join(', ')}, averaging\u00a0${formatPoints(side.average)}`
      : null
  const theirs = form(prep.recent.them)
  if (theirs) {
    const mine = form(prep.recent.me)
    facts.push({
      label: `Last ${plural(prep.recent.them.games.length, 'week')}`,
      lines: [`${prep.opponent}: ${theirs}`, mine && `You: ${mine}`].filter(Boolean)
    })
  }
  facts.push({
    label: 'Projected',
    lines: [
      `${prep.opponent} ${formatPoints(prep.theirProjection)}, you ${formatPoints(prep.myProjection)}${prep.todo ? ' after your to-do list' : ''}`
    ]
  })

  return (
    <Section title={`Scouting ${prep.opponent}`} id="prep-scouting">
      <div className="card">
        <ul className="list">
          {facts.map((fact) => (
            <li key={fact.label}>
              <div className="row prep-fact">
                <span className="row-body">
                  <span className="row-main">
                    <span className="row-caption">{fact.label}</span>
                    {fact.lines.map((line) => (
                      <span key={line} className="prep-fact-line">
                        {line}
                      </span>
                    ))}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

const SERIES_WORDS = { won: 'Won', lost: 'Lost', tied: 'Tied' }

/** Your earlier meetings with this team this season. */
function Series({ prep }) {
  return (
    <Section title="Season series" id="prep-series">
      <div className="card">
        {prep.series.length === 0 ? (
          <p className="prep-empty">This is your first meeting with {prep.opponent} this season.</p>
        ) : (
          <ul className="list">
            {prep.series.map((game) => (
              <li key={game.week}>
                <div className="row prep-fact">
                  <span className="row-body">
                    <span className="row-main">
                      <span className="row-title">
                        <span className="name">Week {game.week}</span>
                      </span>
                    </span>
                    <span className="row-trail">
                      <span className={`prep-result is-${game.outcome}`}>
                        {SERIES_WORDS[game.outcome]} {formatPoints(game.points)} to {formatPoints(game.against)}
                      </span>
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
