import { useEffect, useState } from 'react'
import Sheet from './Sheet.jsx'
import Portrait from './Portrait.jsx'
import Icon from './Icon.jsx'
import { InjuryPill, SlotPill } from './ui.jsx'
import { gameState, injuryLabel, injuryLevel, slotOf, storiesFor } from '../lib/lineup.js'
import { clockTime, formatPoints, plural, signed, timeAgo, weekday } from '../lib/format.js'
import { nextWeekLabel } from '../lib/streaming.js'
import PointsChart from './PointsChart.jsx'
import { defenseSentence, matchupGrade } from '../lib/opponent.js'
import { findPick, rivalWord, verdict } from '../lib/picks.js'
import { byeLine } from '../lib/byes.js'

/**
 * Everything known about one player, in one place. The rows in every list stay
 * short because the detail lives here: role notes, the waiver model's reasons,
 * which outlets named them, and every story that mentions them.
 */
export default function PlayerSheet({ player, news, receptionPoints, pickReport, byeWeeks, week, onClose, now }) {
  // Keep showing the last player while the sheet animates closed.
  const [shown, setShown] = useState(player)
  useEffect(() => {
    if (player) setShown(player)
  }, [player])

  return (
    <Sheet open={Boolean(player)} onClose={onClose} labelledBy="player-sheet-title">
      {shown && (
        <PlayerDetail
          player={shown}
          news={news}
          receptionPoints={receptionPoints}
          pick={findPick(pickReport, shown.playerId)}
          bye={byeLine(shown, byeWeeks, week)}
          now={now}
        />
      )}
    </Sheet>
  )
}

// Green for a soft matchup, red for a tough one, and the list's own tone otherwise.
const GRADE_TONE = { soft: 'var(--green)', tough: 'var(--red)' }

function PlayerDetail({ player, news, receptionPoints, pick, bye, now }) {
  const stories = storiesFor(player, news)
  const espnPage = /^\d+$/.test(String(player.espnId || '')) ? `https://www.espn.com/nfl/player/_/id/${player.espnId}` : null
  const level = injuryLevel(player.injuryStatus)

  const stats = [
    player.projected != null && ['This week', formatPoints(player.projected), 'pts'],
    player.seasonProjected != null && ['Season', formatPoints(player.seasonProjected, 0), 'pts'],
    // A defense is judged on its matchup, which the facts below lay out, so the
    // general waiver score would only contradict the streaming board.
    player.score != null && player.position !== 'DEF' && ['Waiver score', player.score, '/100'],
    player.percentOwned != null && ['Rostered', `${formatPoints(player.percentOwned)}%`],
    player.trendAdds > 0 && ['Adds, 24h', player.trendAdds.toLocaleString()],
    player.count != null && ['Outlets', player.count]
  ].filter(Boolean)

  return (
    <>
      <header className="player-head">
        <Portrait player={player} size="lg" />
        <div>
          <h2 id="player-sheet-title">{player.name}</h2>
          <div className="player-sub">
            <SlotPill label={player.position || '?'} position={player.position} />
            <span>{player.team}</span>
            <InjuryPill status={player.injuryStatus} long />
          </div>
        </div>
      </header>

      {stats.length > 0 && (
        <div className="stat-grid">
          {stats.map(([label, value, unit]) => (
            <div className="stat" key={label}>
              <span className="stat-label">{label}</span>
              <span className="stat-value">
                {value}
                {unit && <small>{unit}</small>}
              </span>
            </div>
          ))}
        </div>
      )}

      {player.gameLog?.weeks?.length > 0 && (
        <div className="sheet-section chart-section">
          <div className="card card-pad">
            <PointsChart log={player.gameLog} scoringLabel={scoringLabel(receptionPoints)} />
          </div>
          <p className="section-foot">
            From NFL box scores, which can differ a little from your league's own scoring.
          </p>
        </div>
      )}

      <div className="card">
        <ul className="facts">
          <li>
            <Icon name="calendar" />
            <span>{gameLine(player, now)}</span>
          </li>
          {linesLine(player) && (
            <li>
              <Icon name="chart" />
              <span>{linesLine(player)}</span>
            </li>
          )}
          {defenseSentence(player) && (
            <li style={{ '--fact-tone': GRADE_TONE[matchupGrade(player.opponentDefense)] }}>
              <Icon name="shield" />
              <span>{defenseSentence(player)}</span>
            </li>
          )}
          {bye && (
            <li>
              <Icon name="pause" />
              <span>{bye}</span>
            </li>
          )}
          {player.position === 'DEF' && nextWeekLabel(player) && (
            <li>
              <Icon name="clock" />
              <span>{nextWeekLabel(player)}</span>
            </li>
          )}
          <li>
            <Icon name="lineup" />
            <span>{rosterLine(player)}</span>
          </li>
          {player.injuryStatus && (
            <li style={{ '--fact-tone': level >= 3 ? 'var(--red)' : 'var(--orange)' }}>
              <Icon name="alert" />
              <span>
                {injuryLabel(player.injuryStatus)}
                {player.injuryNote ? `, ${player.injuryNote}` : ''}
              </span>
            </li>
          )}
        </ul>
      </div>

      {player.vsOpponent && <OpponentHistory history={player.vsOpponent} />}

      {pick && <PickHistory pick={pick} />}

      {player.reasons?.length > 0 && player.position !== 'DEF' && (
        <FactSection title="Why the model likes this pickup" icon="sparkles" tone="var(--purple)" items={player.reasons} />
      )}

      {player.usageNotes?.length > 0 && !player.reasons?.length && (
        <FactSection title="Role" icon="chart" tone="var(--mint)" items={player.usageNotes} />
      )}

      {player.sources?.length > 0 && (
        <FactSection
          title="Named in waiver columns by"
          icon="news"
          tone="var(--blue)"
          items={[player.sources.join(', ')]}
        />
      )}

      {stories.length > 0 && (
        <div className="sheet-section">
          <h3>News</h3>
          <div className="card">
            <ul className="list">
              {stories.slice(0, 6).map((story) => (
                <li key={story.url || story.headline}>
                  <a className="story-link" href={story.url || undefined} target="_blank" rel="noreferrer">
                    <span className="story-meta">
                      {story.source || 'ESPN'}
                      {story.published ? ` · ${timeAgo(story.published, now)}` : ''}
                    </span>
                    <span className="story-title">{story.headline}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {espnPage && (
        <div className="sheet-actions">
          <a className="btn btn-quiet press" href={espnPage} target="_blank" rel="noreferrer">
            Player page on ESPN
            <Icon name="external" strokeWidth={2.4} />
          </a>
        </div>
      )}
    </>
  )
}

/**
 * Last season against the team this player faces this week, beside their average
 * across all of that season, since a number on its own says little: 18 points
 * is a big day for a tight end and a quiet one for a top quarterback.
 */
function OpponentHistory({ history }) {
  const { opponent, season, games, seasonAverage, seasonGames } = history
  if (games.length === 0) {
    return (
      <div className="sheet-section">
        <h3>Against {opponent} last season</h3>
        <div className="card card-pad vs-empty">
          Did not play {opponent} in {season}. Averaged {formatPoints(seasonAverage)} over{' '}
          {seasonGames} {seasonGames === 1 ? 'game' : 'games'} that season.
        </div>
      </div>
    )
  }

  const average = games.reduce((sum, [, points]) => sum + points, 0) / games.length
  const difference = average - seasonAverage
  return (
    <div className="sheet-section">
      <h3>Against {opponent} last season</h3>
      <div className="stat-grid vs-stats">
        <div className="stat">
          <span className="stat-label">
            vs {opponent}
            {games.length > 1 ? `, ${games.length} games` : ''}
          </span>
          <span className="stat-value">{formatPoints(average)}</span>
          <span className={difference >= 0 ? 'stat-delta is-up' : 'stat-delta is-down'}>
            {signed(difference)} vs usual
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{season} average</span>
          <span className="stat-value">{formatPoints(seasonAverage)}</span>
          <span className="stat-delta">
            {seasonGames} {seasonGames === 1 ? 'game' : 'games'}
          </span>
        </div>
      </div>
      <p className="vs-games">
        {games.map(([week, points]) => `Week ${week}: ${formatPoints(points)}`).join(' · ')}
      </p>
    </div>
  )
}

/** Every week since the app made this player a top pick, against your starter. */
function PickHistory({ pick }) {
  return (
    <div className="sheet-section">
      <h3>Top waiver pick in week {pick.week}</h3>
      <div className="card">
        {pick.results.length === 0 ? (
          <p className="card-pad pick-pending">Graded against {rivalWord(pick.position)} once week {pick.week} is over.</p>
        ) : (
          <ul className="list pick-weeks">
            {pick.results.map((result) => {
              const call = verdict({ results: [result] })
              return (
                <li key={result.week}>
                  <span className="pick-week">Week {result.week}</span>
                  <span className="pick-detail">
                    {result.bye ? (
                      'Bye'
                    ) : (
                      <>
                        <strong>{formatPoints(result.points)}</strong>
                        {result.starter
                          ? ` vs ${result.starter.name}, ${formatPoints(result.starter.points)}`
                          : ` with no ${pick.position} in your lineup to compare`}
                      </>
                    )}
                  </span>
                  {call && <span className="pill" data-tone={call.tone}>{call.label}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="section-foot">
        {pick.graded
          ? `Beat ${rivalWord(pick.position)} in ${pick.beat} of ${plural(pick.graded, 'week')}, ${formatPoints(pick.perGame)} a game since the pick.`
          : 'Scored from Sleeper\'s weekly stats in your league\'s points per catch.'}
      </p>
    </div>
  )
}

function scoringLabel(receptionPoints) {
  if (receptionPoints == null) return null
  if (receptionPoints === 1) return 'PPR'
  if (receptionPoints === 0.5) return 'Half PPR'
  if (receptionPoints === 0) return 'Standard'
  return `${receptionPoints} per catch`
}

function FactSection({ title, icon, tone, items }) {
  return (
    <div className="sheet-section">
      <h3>{title}</h3>
      <div className="card">
        <ul className="facts" style={{ '--fact-tone': tone }}>
          {items.map((item) => (
            <li key={item}>
              <Icon name={icon} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function gameLine(player, now) {
  const { game } = player
  if (!game) return 'No game this week'
  const state = gameState(player, now)
  if (state === 'live') return `${game.matchup}, in progress`
  if (state === 'played') return `${game.matchup}, already played`
  if (!game.kickoffISO) return `${game.matchup}, ${game.weekday || 'time to be announced'}`
  return `${game.matchup}, ${weekday(game.kickoffISO)} at ${clockTime(game.kickoffISO)}`
}

/**
 * What the betting line says about this game. A defense cares how many points
 * the other side is expected to score, and everyone else cares about their own.
 */
function linesLine(player) {
  const game = player.game
  if (!game || game.teamImplied == null) return null
  const side =
    game.spread > 0 ? `favored by ${game.spread}` : game.spread < 0 ? `underdog by ${-game.spread}` : 'even game'
  if (player.position === 'DEF') {
    return `${game.opponent} expected to score ${game.opponentImplied.toFixed(1)}, ${side}`
  }
  return `${player.team} expected to score ${game.teamImplied.toFixed(1)}, ${side}`
}

function rosterLine(player) {
  if (player.ownerName) return `On ${player.ownerName}`
  if (player.starter) return `Starting at ${slotOf(player)}`
  if (player.slot === 'IR') return 'On your injured reserve'
  if (player.slot === 'TAXI') return 'On your taxi squad'
  if (player.slot === 'BE' || player.context === 'roster') return 'On your bench'
  return 'Free agent in this league'
}
