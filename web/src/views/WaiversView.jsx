import { Section, Chips, PlayerRow, ScoreRing, EmptyState } from '../components/ui.jsx'
import { POSITIONS } from '../lib/lineup.js'
import { formatPoints } from '../lib/format.js'

/**
 * The ranked free agent board, with what the fantasy press is recommending above
 * it. The interesting part is where the two disagree: a player five outlets like
 * that your model ranks fortieth is usually already gone, and one your model likes
 * that nobody wrote up is the claim to make before Tuesday.
 */
export default function WaiversView({ league, position, onPosition, onOpenPlayer }) {
  const waivers = league.waivers || []
  const consensus = league.consensus || []

  if (waivers.length === 0 && consensus.length === 0) {
    return (
      <div className="card">
        <EmptyState icon="waivers" title="No free agents">
          None came back for this league on the last refresh.
        </EmptyState>
      </div>
    )
  }

  const present = POSITIONS.filter((pos) => waivers.some((player) => player.position === pos))
  const filter = position === 'ALL' || present.includes(position) ? position : 'ALL'
  const matches = (player) => filter === 'ALL' || player.position === filter
  const board = waivers.filter(matches)
  const writers = consensus.filter(matches)

  return (
    <>
      <Chips
        label="Filter by position"
        value={filter}
        onChange={onPosition}
        options={[
          { value: 'ALL', label: 'All' },
          ...present.map((pos) => ({
            value: pos,
            label: pos,
            position: pos,
            count: waivers.filter((player) => player.position === pos).length
          }))
        ]}
      />

      {writers.length > 0 && (
        <Section
          title="Writers' picks"
          id="waivers-writers"
          foot="The number is how many outlets named the player in this week's waiver columns. Your rank is where the model below puts them, and no rank means they missed your top 25."
        >
          <div className="card">
            <ul className="list">
              {writers.map((player) => (
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
      )}

      <Section
        title="Best available"
        meta={filter === 'ALL' ? `Top ${board.length}` : `${board.length} at ${filter}`}
        id="waivers-board"
        foot="Scored 0 to 100 from projected points over your worst starter at the position, role and snap share, adds across Sleeper, and roster percentage change."
      >
        <div className="card">
          {board.length === 0 ? (
            <EmptyState icon="waivers" title={`No ${filter} in the top ${waivers.length}`}>
              Try another position.
            </EmptyState>
          ) : (
            <ul className="list">
              {board.map((player) => (
                <li key={player.playerId}>
                  <PlayerRow
                    player={{ ...player, context: 'waiver' }}
                    lead={<span className="rank">{waivers.indexOf(player) + 1}</span>}
                    sub={[
                      player.position,
                      player.team,
                      player.percentOwned != null ? `${formatPoints(player.percentOwned)}% rostered` : null,
                      player.game ? player.game.matchup : 'Bye'
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    note={player.reasons?.[0]}
                    trail={<ScoreRing value={player.score} />}
                    onSelect={onOpenPlayer}
                    chevron={false}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  )
}
