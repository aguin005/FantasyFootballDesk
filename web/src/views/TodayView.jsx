import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Portrait from '../components/Portrait.jsx'
import { Section, LinkButton, PlayerRow, Pill, ScoreRing, EmptyState } from '../components/ui.jsx'
import { clockTime, formatPoints, localDayKey, shortAgo, timeAgo, signed, plural, weekday } from '../lib/format.js'
import { slotOf } from '../lib/lineup.js'
import { MatchupCard } from '../components/Matchup.jsx'

const CHANGE_KINDS = {
  downgrade: { label: 'Injury', tone: 'red' },
  upgrade: { label: 'Healthier', tone: 'green' },
  news: { label: 'News', tone: 'blue' },
  added: { label: 'Added', tone: 'green' },
  dropped: { label: 'Dropped' },
  waiver: { label: 'Pickup', tone: 'purple' }
}

const REASON_TEXT = { out: 'is out', doubtful: 'is doubtful', bye: 'is on bye' }

const SCORING = {
  H2H_POINTS: 'Head to head points',
  H2H_CATEGORY: 'Head to head categories',
  TOTAL_POINTS: 'Total points',
  ROTO: 'Rotisserie'
}

/**
 * The first screen. It answers the questions you open the app with, in order:
 * how is my matchup going, is my lineup safe, what changed since I last looked,
 * and is there anyone worth grabbing. Every block links through to the detail.
 */
export default function TodayView({
  league,
  report,
  matchup,
  changes,
  news,
  now,
  onOpenPlayer,
  onOpenMatchup,
  onNavigate
}) {
  const leagueChanges = changes.filter((entry) => entry.leagueId === league.id)
  const leagueNews = news.filter((item) => item.players.some((player) => player.leagueId === league.id))

  return (
    <>
      {matchup ? (
        <MatchupCard matchup={matchup} league={league} nextKickoff={report.nextKickoff} onOpen={onOpenMatchup} />
      ) : (
        <Summary league={league} report={report} now={now} />
      )}
      <LineupCheck report={report} onOpenPlayer={onOpenPlayer} onNavigate={onNavigate} />
      <Changes entries={leagueChanges} now={now} onOpenPlayer={onOpenPlayer} />

      {league.waivers?.length > 0 && (
        <Section
          title="Top pickups"
          id="today-pickups"
          action={<LinkButton onClick={() => onNavigate('waivers')}>See all</LinkButton>}
        >
          <div className="card">
            <ul className="list">
              {league.waivers.slice(0, 3).map((player) => (
                <li key={player.playerId}>
                  <PlayerRow
                    player={player}
                    sub={[player.position, player.team, player.reasons?.[0]].filter(Boolean).join(' · ')}
                    trail={<ScoreRing value={player.score} />}
                    onSelect={onOpenPlayer}
                    chevron={false}
                  />
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {leagueNews.length > 0 && (
        <Section
          title="Latest news"
          id="today-news"
          action={<LinkButton onClick={() => onNavigate('news')}>See all</LinkButton>}
        >
          <div className="card">
            <ul className="list">
              {leagueNews.slice(0, 3).map((item) => (
                <li key={item.url || item.headline}>
                  <a className="story-link" href={item.url || undefined} target="_blank" rel="noreferrer">
                    <span className="story-meta">
                      {item.source}
                      {item.published ? ` · ${timeAgo(item.published, now)}` : ''}
                    </span>
                    <span className="story-title">{item.headline}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
    </>
  )
}

function Summary({ league, report, now }) {
  const { progress, starters } = report
  const toPlay = progress.upcoming + progress.live
  const scoring = SCORING[league.scoring] || league.scoring
  const next = report.nextKickoff

  return (
    <section className="section" aria-label="Your team">
      <div className="card summary">
        <h2 className="summary-team">{league.teamName}</h2>
        <p className="summary-league">{[league.name, league.record, scoring].filter(Boolean).join(' · ')}</p>

        <div className="summary-stats">
          <div className="summary-stat">
            <span className="stat-label">Projected</span>
            <span className="stat-value">{report.hasProjections ? formatPoints(report.projectedTotal) : '-'}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">To play</span>
            <span className="stat-value">
              {report.scheduleKnown ? toPlay : '-'}
              {report.scheduleKnown && <small>/{starters.length}</small>}
            </span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Next up</span>
            <span className={next ? 'stat-value is-text' : 'stat-value'}>
              {next ? clockTime(next) : report.scheduleKnown && toPlay === 0 ? 'Done' : '-'}
            </span>
            {next && <span className="stat-caption">{dayWord(next, now)}</span>}
          </div>
        </div>

        {report.scheduleKnown && starters.length > 0 && (
          <>
            <div className="progress" role="img" aria-label={`${progress.played} played, ${progress.live} in progress, ${progress.upcoming} still to play`}>
              {progress.played > 0 && <span className="is-played" style={{ flexGrow: progress.played }} />}
              {progress.live > 0 && <span className="is-live" style={{ flexGrow: progress.live }} />}
              {progress.upcoming > 0 && <span className="is-upcoming" style={{ flexGrow: progress.upcoming }} />}
            </div>
            <div className="legend">
              <span style={{ '--dot': 'var(--label-3)' }}>{progress.played} played</span>
              {progress.live > 0 && <span style={{ '--dot': 'var(--green)' }}>{progress.live} in progress</span>}
              <span style={{ '--dot': 'var(--tint)' }}>{progress.upcoming} to play</span>
              {progress.bye > 0 && <span style={{ '--dot': 'var(--orange)' }}>{progress.bye} on bye</span>}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/** "Today", "Tomorrow", or the weekday, for the next kickoff. */
function dayWord(iso, now) {
  const day = localDayKey(iso)
  if (day === localDayKey(new Date(now).toISOString())) return 'Today'
  if (day === localDayKey(new Date(now + 24 * 60 * 60 * 1000).toISOString())) return 'Tomorrow'
  return weekday(iso)
}

function LineupCheck({ report, onOpenPlayer, onNavigate }) {
  const urgent = report.swaps.filter((swap) => swap.urgent)
  const upgrades = report.swaps.filter((swap) => !swap.urgent)
  const nothing = urgent.length + upgrades.length + report.stranded.length + report.watch.length === 0
  const allLocked = report.scheduleKnown && report.progress.upcoming === 0 && report.starters.length > 0

  return (
    <Section
      title="Lineup check"
      id="today-lineup"
      action={<LinkButton onClick={() => onNavigate('lineup', 'startsit')}>Start / sit</LinkButton>}
    >
      {nothing ? (
        <div className="card all-clear">
          <span className="icon-disc" data-tone="green">
            <Icon name="check" strokeWidth={2.6} />
          </span>
          <div>
            <strong>{allLocked ? 'Every game has kicked off' : 'Your lineup is set'}</strong>
            <p>
              {allLocked
                ? 'Nothing left to change this week.'
                : 'Every starter is playing and is your best projected option.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <ul className="list">
            {urgent.map(({ starter, replacement, reason }) => (
              <li key={starter.playerId}>
                <AlertRow
                  tone="red"
                  icon="alert"
                  title={`${starter.name} ${REASON_TEXT[reason]}`}
                  sub={`Start ${replacement.name} at ${slotOf(starter)}${replacement.projected != null ? `, ${formatPoints(replacement.projected)} projected` : ''}`}
                  onClick={() => onNavigate('lineup', 'startsit')}
                />
              </li>
            ))}
            {report.stranded.map(({ starter, reason }) => (
              <li key={starter.playerId}>
                <AlertRow
                  tone="red"
                  icon="alert"
                  title={`${starter.name} ${REASON_TEXT[reason]}`}
                  sub={`Nobody on your bench can play ${slotOf(starter)}. Check waivers.`}
                  onClick={() => onNavigate('waivers', null, starter.position)}
                />
              </li>
            ))}
            {report.watch.map(({ starter, backup }) => (
              <li key={starter.playerId}>
                <AlertRow
                  tone="orange"
                  icon="clock"
                  title={`${starter.name} is questionable`}
                  sub={backup ? `Check before kickoff. ${backup.name} is your backup.` : 'Check before kickoff.'}
                  onClick={() => onOpenPlayer(starter)}
                />
              </li>
            ))}
            {upgrades.length > 0 && (
              <li>
                <AlertRow
                  tone="green"
                  icon="trendUp"
                  title={`${plural(upgrades.length, 'upgrade')} available`}
                  sub={`${signed(upgrades.reduce((sum, swap) => sum + swap.gain, 0))} projected points`}
                  onClick={() => onNavigate('lineup', 'startsit')}
                />
              </li>
            )}
          </ul>
        </div>
      )}
    </Section>
  )
}

function AlertRow({ tone, icon, title, sub, onClick }) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="icon-disc" data-tone={tone}>
        <Icon name={icon} strokeWidth={2.4} />
      </span>
      <span className="row-body">
        <span className="row-main">
          <span className="row-title is-wrap">
            <span className="name">{title}</span>
          </span>
          <span className="row-note">{sub}</span>
        </span>
        <Icon name="chevronRight" className="chev" strokeWidth={2.6} />
      </span>
    </button>
  )
}

function Changes({ entries, now, onOpenPlayer }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries : entries.slice(0, 5)
  const fresh = entries.filter((entry) => entry.isNew).length

  return (
    <Section
      title="What changed"
      id="today-changes"
      action={
        entries.length > 5 ? (
          <LinkButton icon={expanded ? null : 'chevronDown'} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : `Show all ${entries.length}`}
          </LinkButton>
        ) : (
          fresh > 0 && <span className="section-meta">{fresh} new</span>
        )
      }
    >
      <div className="card">
        {entries.length === 0 ? (
          <EmptyState icon="checkCircle" title="Quiet day">
            Nothing has changed on this roster in the last 24 hours.
          </EmptyState>
        ) : (
          <ul className="list">
            {visible.map((entry) => {
              const kind = CHANGE_KINDS[entry.kind] || { label: entry.kind }
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={entry.isNew ? 'row' : 'row is-dim'}
                    data-pos={entry.position || undefined}
                    onClick={() => onOpenPlayer({ ...entry, context: 'change' })}
                  >
                    <Portrait player={entry} />
                    <span className="row-body">
                      <span className="row-main">
                        <span className="row-title">
                          <span className="name">{entry.name}</span>
                          <Pill tone={kind.tone}>{kind.label}</Pill>
                        </span>
                        <span className="row-note">{entry.detail}</span>
                      </span>
                      <span className="row-trail">
                        <span className="row-caption" title={timeAgo(entry.detectedAt, now)}>
                          {shortAgo(entry.detectedAt, now)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Section>
  )
}
