import Sheet from './Sheet.jsx'
import { LinkButton, Pill, Section } from './ui.jsx'
import { formatPoints } from '../lib/format.js'
import { byeLine, methodNote, oddsLabel, recordLabel, stakesLine, standingLine } from '../lib/playoffs.js'

/**
 * Your chance of making the playoffs, on Today. Once the regular season is over
 * it says whether you are in. Tapping it opens the standings.
 */
export function PlayoffCard({ picture, onOpen }) {
  if (!picture?.mine) return null
  const { mine, decided } = picture
  const made = mine.seed <= picture.playoffTeams
  const stakes = stakesLine(picture)
  const bye = byeLine(picture)

  return (
    <Section title="Playoff race" id="today-playoffs" action={<LinkButton onClick={onOpen}>Standings</LinkButton>}>
      <button type="button" className="card prep-chance playoff press" onClick={onOpen}>
        <span className="prep-chance-top">
          <span className="prep-chance-value">{decided ? (made ? 'In' : 'Out') : oddsLabel(mine.odds)}</span>
          <span className="prep-chance-label">
            {decided ? (made ? 'You made the playoffs' : 'You missed the playoffs') : 'to make the playoffs'}
          </span>
        </span>
        {!decided && (
          <span className="prep-meter" role="img" aria-label={`${oddsLabel(mine.odds)} chance of making the playoffs`}>
            <span style={{ width: `${Math.round(mine.odds * 100)}%` }} />
          </span>
        )}
        <span className="prep-chance-note">{standingLine(picture)}</span>
        {stakes && <span className="prep-chance-note playoff-stakes">{stakes}</span>}
        {bye && <span className="prep-chance-note">{bye}</span>}
      </button>
    </Section>
  )
}

/** Every team in seed order, with the line the playoff teams sit above. */
export function StandingsSheet({ open, picture, week, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="standings-title">
      {picture && (
        <>
          <h2 id="standings-title" className="sheet-title">
            Standings
          </h2>
          <p className="standings-sub">
            {picture.decided ? 'Final' : `Week ${week}`} · top {picture.playoffTeams} make the playoffs
          </p>
          <div className="card">
            <ol className="list standings">
              {picture.rows.map((row) => (
                <li key={row.teamId} className={row.seed === picture.playoffTeams ? 'is-cut' : undefined}>
                  <div className={row.isMine ? 'row standings-row is-mine' : 'row standings-row'}>
                    <span className="standings-seed">{row.seed}</span>
                    <span className="row-body">
                      <span className="row-main">
                        <span className="row-title">
                          <span className="name">{row.name}</span>
                          {row.isMine && <Pill tone="blue">You</Pill>}
                        </span>
                        <span className="row-sub">
                          {recordLabel(row)} · {formatPoints(row.pointsFor)} pts
                          {!picture.decided && ` · ${formatPoints(row.projectedWins)} wins projected`}
                        </span>
                      </span>
                      <span className="row-trail">
                        <span className="row-value">
                          {picture.decided ? (row.seed <= picture.playoffTeams ? 'In' : 'Out') : oddsLabel(row.odds)}
                        </span>
                        {!picture.decided && <span className="row-caption">playoffs</span>}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="section-foot">{methodNote(picture)}</p>
        </>
      )}
    </Sheet>
  )
}
