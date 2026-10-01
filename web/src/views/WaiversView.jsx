import { useMemo } from 'react'
import Portrait from '../components/Portrait.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Chips, PlayerRow, ScoreRing, EmptyState, LinkButton, Pill } from '../components/ui.jsx'
import { POSITIONS, coversRoster, isReserve, sortBySlot, slotLabel } from '../lib/lineup.js'
import { formatPoints, kickoffLabel } from '../lib/format.js'
import { rateDefenses, nextWeekLabel, defenseName, GRADE_LABEL, GRADE_TONE } from '../lib/streaming.js'
import { lastWeekRecord, resultLine, sumTally, tally, verdict } from '../lib/picks.js'

const POSITION_NAMES = {
  QB: 'Quarterbacks',
  RB: 'Running backs',
  WR: 'Wide receivers',
  TE: 'Tight ends',
  K: 'Kickers',
  DEF: 'Defenses'
}

// The chip that opens how the app's past top picks did.
const RECORD = 'RECORD'

// A free agent defense has to beat yours by this much before the board says swap.
// Smaller gaps are within the noise of a weekly matchup.
const STREAM_MARGIN = 10

/**
 * Free agents, organized the way you shop for them: by the hole you are filling.
 *
 * The overview leads with injury openings, the backup who inherits a job when the
 * starter goes down, then the best pickup at each position, then defenses to
 * stream. Each chip opens the full list for one position, and the defense chip
 * opens a board ranked on this week's matchup.
 */
export default function WaiversView({ league, position, onPosition, onOpenPlayer }) {
  const waivers = league.waivers || []
  const myIds = useMemo(() => new Set(league.roster.map((player) => player.playerId)), [league])
  const defenses = useMemo(
    () =>
      rateDefenses(
        waivers.filter((player) => player.position === 'DEF' && !myIds.has(player.playerId)),
        // Your starter first, so the board compares against the defense you play.
        sortBySlot(league.roster.filter((player) => player.position === 'DEF' && !isReserve(player)))
      ),
    [waivers, league, myIds]
  )

  if (waivers.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="waivers" title="No free agents">
          None came back for this league on the last refresh.
        </EmptyState>
      </div>
    )
  }

  const present = POSITIONS.filter((pos) => waivers.some((player) => player.position === pos))
  const report = league.pickReport
  const view = present.includes(position) || (position === RECORD && report) ? position : 'ALL'
  const shared = { league, waivers, myIds, onOpenPlayer }

  return (
    <>
      <Chips
        label="Position"
        value={view}
        onChange={onPosition}
        options={[
          { value: 'ALL', label: 'Best' },
          ...present.map((pos) => ({ value: pos, label: pos, position: pos })),
          ...(report ? [{ value: RECORD, label: 'Track record' }] : [])
        ]}
      />
      <div key={view} className="view">
        {view === 'ALL' && <Overview {...shared} defenses={defenses} onPosition={onPosition} />}
        {view === 'DEF' && <DefenseBoard defenses={defenses} onOpenPlayer={onOpenPlayer} />}
        {view === RECORD && <TrackRecord report={report} onOpenPlayer={onOpenPlayer} />}
        {POSITIONS.includes(view) && view !== 'DEF' && <PositionList {...shared} position={view} />}
      </div>
    </>
  )
}

function Overview({ league, waivers, myIds, defenses, onPosition, onOpenPlayer }) {
  // Openings that cover one of your own injured players come first.
  const openings = waivers
    .filter((player) => player.opportunity)
    .sort((a, b) => Number(coversRoster(b, myIds)) - Number(coversRoster(a, myIds)) || b.score - a.score)
    .slice(0, 5)
  const skill = POSITIONS.filter((pos) => pos !== 'DEF' && waivers.some((player) => player.position === pos))

  return (
    <>
      <RecordSummary report={league.pickReport} onOpen={() => onPosition(RECORD)} />

      {openings.length > 0 && (
        <Section
          title="Next man up"
          meta="injury openings"
          id="waivers-openings"
          foot="A teammate who ranked ahead of each of these players is out, doubtful, on IR, or suspended, which hands them the role this week."
        >
          <div className="card">
            <ul className="list">
              {openings.map((player) => (
                <li key={player.playerId}>
                  <WaiverRow player={player} myIds={myIds} onOpenPlayer={onOpenPlayer} accent />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {skill.map((pos) => {
        const list = waivers.filter((player) => player.position === pos)
        return (
          <Section
            key={pos}
            title={POSITION_NAMES[pos]}
            id={`waivers-${pos}`}
            action={
              list.length > 2 && <LinkButton onClick={() => onPosition(pos)}>See all {list.length}</LinkButton>
            }
          >
            <div className="card">
              <ul className="list">
                {list.slice(0, 2).map((player) => (
                  <li key={player.playerId}>
                    <WaiverRow player={player} myIds={myIds} onOpenPlayer={onOpenPlayer} />
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )
      })}

      {defenses.board.length > 0 && (
        <Section
          title="Stream a defense"
          id="waivers-stream"
          action={<LinkButton onClick={() => onPosition('DEF')}>See all {defenses.board.length}</LinkButton>}
          foot={
            defenses.mine[0]
              ? `Yours: the ${defenseName(defenses.mine[0].player.name)}, rated ${defenses.mine[0].score} this week.`
              : null
          }
        >
          <div className="card">
            <ul className="list">
              {defenses.board.slice(0, 3).map((rated) => (
                <li key={rated.player.playerId}>
                  <DefenseRow rated={rated} onOpenPlayer={onOpenPlayer} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      <WritersPicks consensus={league.consensus} onOpenPlayer={onOpenPlayer} />
    </>
  )
}

function PositionList({ league, waivers, myIds, position, onOpenPlayer }) {
  const list = waivers.filter((player) => player.position === position)
  const mine = sortBySlot(league.roster.filter((player) => player.position === position && !isReserve(player)))

  return (
    <>
      {mine.length > 0 && (
        <Section title={`Your ${position}s`} id="waivers-mine" meta="for comparison">
          <div className="roster-strip">
            {mine.map((player) => (
              <button
                key={player.playerId}
                type="button"
                className={player.starter ? 'player-chip press' : 'player-chip press is-bench'}
                data-pos={player.position}
                onClick={() => onOpenPlayer(player)}
              >
                <Portrait player={player} />
                <span className="chip-name">{player.name}</span>
                <span className="chip-meta">
                  {slotLabel(player)} · {formatPoints(player.projected)}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`Best available ${position}s`}
        meta={`${list.length} players`}
        id="waivers-list"
        foot="Scored 0 to 100 on projected points over your worst starter at the position, injury openings, role and snap share, adds across Sleeper, and roster percentage change."
      >
        <div className="card">
          <ul className="list">
            {list.map((player, index) => (
              <li key={player.playerId}>
                <WaiverRow player={player} rank={index + 1} myIds={myIds} onOpenPlayer={onOpenPlayer} />
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <WritersPicks
        consensus={(league.consensus || []).filter((player) => player.position === position)}
        onOpenPlayer={onOpenPlayer}
      />
    </>
  )
}

function DefenseBoard({ defenses, onOpenPlayer }) {
  const { board, mine } = defenses
  const current = mine[0] || null
  const best = board[0] || null

  if (!best) {
    return (
      <div className="card">
        <EmptyState icon="shield" title="No free agent defenses">
          None came back for this league on the last refresh.
        </EmptyState>
      </div>
    )
  }

  const swap = !current || best.score >= current.score + STREAM_MARGIN
  return (
    <>
      <div className="card all-clear">
        <span className="icon-disc" data-tone={swap ? 'green' : undefined}>
          <Icon name={swap ? 'swap' : 'shield'} strokeWidth={2.2} />
        </span>
        <div>
          <strong>
            {!current
              ? `Pick up the ${defenseName(best.player.name)}`
              : swap
                ? `Stream the ${defenseName(best.player.name)}`
                : `Keep the ${defenseName(current.player.name)}`}
          </strong>
          <p>
            {!current
              ? `The best matchup available: ${best.reasons[0] || best.player.game?.matchup || ''}.`
              : swap
                ? `Rated ${best.score} against ${current.score} for your ${defenseName(current.player.name)}. ${best.reasons[0] || ''}.`
                : `No free agent defense has a clearly better matchup this week. Yours is rated ${current.score}.`}
          </p>
        </div>
      </div>

      {current && (
        <Section title="Your defense" id="stream-mine">
          <div className="card">
            <ul className="list">
              {mine.map((rated) => (
                <li key={rated.player.playerId}>
                  <DefenseRow rated={rated} onOpenPlayer={onOpenPlayer} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      <Section
        title="Available this week"
        meta={`${board.length} defenses`}
        id="stream-board"
        foot="Rated on this week's projection, how many points the opponent is expected to score from the betting line, and the spread. Lines refresh daily and are left out until books post them."
      >
        <div className="card">
          <ul className="list">
            {board.map((rated) => (
              <li key={rated.player.playerId}>
                <DefenseRow rated={rated} onOpenPlayer={onOpenPlayer} />
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  )
}

function WaiverRow({ player, rank, myIds, onOpenPlayer, accent }) {
  return (
    <PlayerRow
      player={{ ...player, context: 'waiver' }}
      lead={rank ? <span className="rank">{rank}</span> : null}
      badge={openingBadge(player, myIds)}
      sub={[
        player.position,
        player.team,
        player.game ? player.game.matchup : 'Bye',
        player.percentOwned != null ? `${formatPoints(player.percentOwned)}% rostered` : null
      ]
        .filter(Boolean)
        .join(' · ')}
      note={player.reasons?.[0]}
      noteAccent={accent || Boolean(player.opportunity)}
      trail={<ScoreRing value={player.score} />}
      onSelect={onOpenPlayer}
      chevron={false}
    />
  )
}

function DefenseRow({ rated, onOpenPlayer }) {
  const { player } = rated
  return (
    <PlayerRow
      player={{ ...player, name: defenseName(player.name), context: player.starter === undefined ? 'waiver' : 'roster' }}
      badge={<Pill tone={GRADE_TONE[rated.grade]}>{GRADE_LABEL[rated.grade]}</Pill>}
      sub={player.game ? `${player.game.matchup} · ${kickoffLabel(player.game)}` : 'Bye this week'}
      note={[rated.reasons.slice(0, 2).join(' · '), nextWeekLabel(player)].filter(Boolean).join('. ')}
      trail={<ScoreRing value={rated.score} />}
      onSelect={onOpenPlayer}
      chevron={false}
    />
  )
}

function WritersPicks({ consensus, onOpenPlayer }) {
  if (!consensus?.length) return null
  return (
    <Section
      title="Writers' picks"
      id="waivers-writers"
      foot="The number is how many outlets named the player in this week's waiver columns. Your rank is where the model puts them."
    >
      <div className="card">
        <ul className="list">
          {consensus.slice(0, 6).map((player) => (
            <li key={player.playerId}>
              <PlayerRow
                player={{ ...player, context: 'consensus' }}
                lead={
                  <span className="tally" aria-label={`Named by ${player.count} outlets`}>
                    {player.count}
                  </span>
                }
                sub={`${player.position} · ${player.team} · ${player.sources.join(', ')}`}
                trail={
                  player.modelRank ? (
                    <span className="row-trail">
                      <span className="row-value">#{player.modelRank}</span>
                      <span className="row-caption">your rank</span>
                    </span>
                  ) : null
                }
                onSelect={onOpenPlayer}
                chevron={false}
              />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

/**
 * One line at the top of the overview: how last week's top picks did, or when
 * this week's lock in. Opens the full track record.
 */
function RecordSummary({ report, onOpen }) {
  if (!report) return null
  const last = lastWeekRecord(report)
  return (
    <section className="section" aria-label="Track record">
      <button type="button" className="card record-summary press" onClick={onOpen}>
        <span className="icon-disc" data-tone={toneFor(last)}>
          <Icon name="chart" strokeWidth={2.2} />
        </span>
        <span className="row-main">
          <strong>
            {last
              ? `Week ${last.week}'s top picks beat your starter ${tally(last)}`
              : report.weeks.length
                ? `Week ${report.weeks[0].week}'s top picks are locked in`
                : "This week's top picks lock at kickoff"}
          </strong>
          <span className="row-note">
            {last
              ? `Every week so far: ${tally(report.summary)}. See how each pick did.`
              : 'Each pick is graded against your lowest scoring starter at the position once the week is over.'}
          </span>
        </span>
        <Icon name="chevronRight" className="chev" strokeWidth={2.6} />
      </button>
    </section>
  )
}

// Green when the picks won at least half the time, orange when not, blue before any results.
function toneFor(record) {
  if (!record?.graded) return 'blue'
  return record.beat * 2 >= record.graded ? 'green' : 'orange'
}

/**
 * Every week's locked picks, newest first, each with its latest result against
 * your starter and its record since the pick.
 */
function TrackRecord({ report, onOpenPlayer }) {
  const { summary, weeks, nextLock } = report
  return (
    <>
      <div className="card all-clear">
        <span className="icon-disc" data-tone={toneFor(summary)}>
          <Icon name="chart" strokeWidth={2.2} />
        </span>
        <div>
          <strong>
            {summary.graded ? `Beat your starter ${tally(summary)}` : weeks.length ? 'Waiting on the first results' : 'Tracking starts this week'}
          </strong>
          <p>
            {summary.graded
              ? 'How often the app\'s top picks outscored your lowest scoring starter at their position, counting every week since each pick.'
              : nextLock
                ? `This week's top three picks lock at ${kickoffLabel({ kickoffISO: nextLock })} and are graded once the week's games are over.`
                : 'The picks are graded once the week\'s games are over.'}
          </p>
        </div>
      </div>

      {weeks.map(({ week, picks }) => (
        <Section
          key={week}
          title={`Week ${week} picks`}
          id={`record-week-${week}`}
          meta={sumTally(picks).graded ? `beat ${tally(sumTally(picks))}` : 'pending'}
        >
          <div className="card">
            <ul className="list">
              {picks.map((pick, index) => {
                const call = verdict(pick)
                return (
                  <li key={pick.playerId}>
                    <PlayerRow
                      player={{ ...pick, context: 'pick' }}
                      lead={<span className="rank">{index + 1}</span>}
                      badge={call ? <Pill tone={call.tone}>{call.label}</Pill> : null}
                      sub={[pick.position, pick.team, pick.perGame != null ? `${formatPoints(pick.perGame)} a game since` : null]
                        .filter(Boolean)
                        .join(' · ')}
                      note={resultLine(pick)}
                      trail={
                        pick.graded ? (
                          <span className="row-trail">
                            <span className="row-value">
                              {pick.beat}/{pick.graded}
                            </span>
                            <span className="row-caption">beat</span>
                          </span>
                        ) : null
                      }
                      onSelect={onOpenPlayer}
                      chevron={false}
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        </Section>
      ))}

      <p className="section-foot">
        The top three pickups lock at each week's first kickoff, from the board as it stood just before. Both
        sides are scored from Sleeper's weekly stats in your league's points per catch, so totals can differ a
        little from your league's own. A bye week is skipped, and a pick who did not play scores zero.
      </p>
    </>
  )
}

function openingBadge(player, myIds) {
  if (!player.opportunity) return null
  if (coversRoster(player, myIds)) {
    return <Pill tone="blue">{player.position === 'RB' ? 'Your handcuff' : `Covers your ${player.position}`}</Pill>
  }
  return <Pill tone="green">{player.opportunity.kind === 'backup' ? 'Moves up' : 'Next up'}</Pill>
}

