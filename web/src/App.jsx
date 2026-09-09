import { useEffect, useState } from 'react'
import AlertStrip from './components/AlertStrip.jsx'
import RosterBoard from './components/RosterBoard.jsx'
import WaiverBoard from './components/WaiverBoard.jsx'

const DATA_URL = `${import.meta.env.BASE_URL}data/dashboard.json`

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeLeague, setActiveLeague] = useState(0)
  const [view, setView] = useState('lineup')

  useEffect(() => {
    fetch(`${DATA_URL}?t=${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error(`The data file returned ${response.status}`)
        return response.json()
      })
      .then(setData)
      .catch(setError)
  }, [])

  if (error) {
    return (
      <main className="shell">
        <p className="empty">
          No league data yet. Run <code>npm run refresh</code>, or check the latest workflow run on
          GitHub for what failed.
        </p>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="shell">
        <p className="empty">Loading your leagues.</p>
      </main>
    )
  }

  const league = data.leagues[activeLeague]

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <h1>League desk</h1>
          <p className="clock">
            Week {data.week}, {data.season}. Updated {formatTime(data.generatedAt)}.
          </p>
        </div>
      </header>

      <AlertStrip alerts={data.alerts} />

      {data.problems?.length > 0 && (
        <div className="problems">
          {data.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}

      <nav className="leagues" aria-label="Your leagues">
        {data.leagues.map((entry, index) => (
          <button
            key={entry.id}
            className={index === activeLeague ? 'league-tab is-active' : 'league-tab'}
            onClick={() => setActiveLeague(index)}
          >
            <span className={`platform platform-${entry.platform}`}>{entry.platform}</span>
            <span className="league-name">{entry.name}</span>
            <span className="league-record">{entry.record}</span>
          </button>
        ))}
      </nav>

      {league && (
        <section className="board">
          <div className="board-head">
            <h2>{league.teamName}</h2>
            <div className="switch" role="tablist" aria-label="Board view">
              <button
                role="tab"
                aria-selected={view === 'lineup'}
                className={view === 'lineup' ? 'is-on' : ''}
                onClick={() => setView('lineup')}
              >
                Lineup
              </button>
              <button
                role="tab"
                aria-selected={view === 'waivers'}
                className={view === 'waivers' ? 'is-on' : ''}
                onClick={() => setView('waivers')}
              >
                Waivers
              </button>
            </div>
          </div>

          {view === 'lineup' ? (
            <RosterBoard roster={league.roster} />
          ) : (
            <WaiverBoard waivers={league.waivers} platform={league.platform} />
          )}
        </section>
      )}
    </main>
  )
}

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit'
  })
}
