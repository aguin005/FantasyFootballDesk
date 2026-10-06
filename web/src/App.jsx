import { useCallback, useEffect, useMemo, useState } from 'react'
import NavBar from './components/NavBar.jsx'
import TabBar from './components/TabBar.jsx'
import LeagueSwitcher from './components/LeagueSwitcher.jsx'
import PlayerSheet from './components/PlayerSheet.jsx'
import { MatchupSheet } from './components/Matchup.jsx'
import SchedulePanel, { ScheduleTab } from './components/SchedulePanel.jsx'
import Icon from './components/Icon.jsx'
import { EmptyState, Notice } from './components/ui.jsx'
import TodayView from './views/TodayView.jsx'
import LineupView from './views/LineupView.jsx'
import NewsView from './views/NewsView.jsx'
import WaiversView from './views/WaiversView.jsx'
import TradeView from './views/TradeView.jsx'
import { useDashboard } from './lib/useDashboard.js'
import { usePullToRefresh } from './lib/usePullToRefresh.js'
import { useNow, useOnline, useScrolled } from './lib/hooks.js'
import { useSetting } from './lib/storage.js'
import { lineupReport, onGameClock, resolvePlayer } from './lib/lineup.js'
import { matchupReport } from './lib/matchup.js'
import { byeReport } from './lib/byes.js'
import { ageMs, longAgo, updatedLabel } from './lib/format.js'

const TABS = {
  today: { label: 'Today', icon: 'today' },
  lineup: { label: 'Lineup', icon: 'lineup' },
  news: { label: 'News', icon: 'news' },
  waivers: { label: 'Waivers', icon: 'waivers' },
  trade: { label: 'Trade', icon: 'trade' }
}

// The Action is scheduled four times an hour, but GitHub runs scheduled workflows
// late or skips them when it is busy. A few hours behind is GitHub. A whole day
// behind means runs are failing, usually expired ESPN cookies, or GitHub switched
// the schedule off after 60 days without a commit.
const LATE_AFTER_MS = 3 * 60 * 60 * 1000
const STOPPED_AFTER_MS = 24 * 60 * 60 * 1000
// Around kickoff the workflow refreshes every ten minutes on its own, so half an
// hour without one means that loop stopped and is waiting on the schedule.
const GAME_DAY_LATE_MS = 30 * 60 * 1000
const TOAST_MS = 2600

export default function App() {
  const { data, error, refreshing, reload } = useDashboard()
  const [leagueId, setLeagueId] = useSetting('league', null)
  const [tab, setTab] = useSetting('tab', 'today')
  const [segment, setSegment] = useSetting('lineup-view', 'roster')
  const [position, setPosition] = useState('ALL')
  const [sheetPlayer, setSheetPlayer] = useState(null)
  const [matchupOpen, setMatchupOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [pulling, setPulling] = useState(false)
  const now = useNow()
  const scrolled = useScrolled()
  const online = useOnline()

  const leagues = data?.leagues || []
  const league = leagues.find((entry) => entry.id === leagueId) || leagues[0] || null
  const report = useMemo(() => (league ? lineupReport(league.roster, now) : null), [league, now])
  const matchup = useMemo(() => matchupReport(league, data?.generatedAt, now), [league, data, now])
  const byes = useMemo(() => byeReport(league, report, data?.byeWeeks, data?.week, now), [league, report, data, now])

  const tabs = useMemo(() => {
    if (!league) return []
    const keys = ['today', 'lineup', 'news', 'waivers']
    // Pricing a trade needs every team's roster, which not every league returns.
    if (league.teams?.length > 1) keys.push('trade')
    return keys.map((key) => ({ key, ...TABS[key], alert: key === 'today' && report?.urgentCount > 0 }))
  }, [league, report])

  const activeTab = tabs.some((entry) => entry.key === tab) ? tab : 'today'

  const refresh = useCallback(async () => {
    const before = data?.generatedAt
    const next = await reload()
    const id = Date.now()
    if (!next) setToast({ id, icon: 'wifiOff', text: 'Could not refresh. Showing the last copy.' })
    else if (next.generatedAt === before) setToast({ id, icon: 'checkCircle', text: 'Already up to date' })
    else setToast({ id, icon: 'checkCircle', text: 'Updated' })
  }, [data, reload])

  const pull = usePullToRefresh(() => {
    setPulling(true)
    refresh().finally(() => setPulling(false))
  }, Boolean(data) && !sheetPlayer && !matchupOpen && !scheduleOpen)

  const selectTab = useCallback(
    (key) => {
      if (key === activeTab) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      setTab(key)
      window.scrollTo({ top: 0 })
    },
    [activeTab, setTab]
  )

  const navigate = useCallback(
    (key, nextSegment, nextPosition) => {
      if (nextSegment) setSegment(nextSegment)
      if (nextPosition) setPosition(nextPosition)
      setTab(key)
      window.scrollTo({ top: 0 })
    },
    [setSegment, setTab]
  )

  const openPlayer = useCallback((player) => setSheetPlayer(resolvePlayer(league, player)), [league])
  const closePlayer = useCallback(() => setSheetPlayer(null), [])
  const closeMatchup = useCallback(() => setMatchupOpen(false), [])
  const closeSchedule = useCallback(() => setScheduleOpen(false), [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // Number keys switch tabs on a keyboard, the way Command and a number does on a Mac.
  useEffect(() => {
    const onKey = (event) => {
      if (sheetPlayer || matchupOpen || scheduleOpen || event.metaKey || event.ctrlKey || event.altKey) return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < tabs.length) selectTab(tabs[index].key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, selectTab, sheetPlayer, matchupOpen, scheduleOpen])

  if (!data) return <Splash error={error} refreshing={refreshing} onRetry={reload} />

  if (!league) {
    return (
      <main className="splash">
        <div>
          <EmptyState icon="lineup" title="No leagues loaded">
            {data.problems?.length
              ? data.problems.join(' ')
              : 'Check leagues.config.json and the latest workflow run on GitHub.'}
          </EmptyState>
        </div>
      </main>
    )
  }

  const age = ageMs(data.generatedAt, now)
  const gameDay = onGameClock(leagues, now)
  const stale = age > (gameDay ? GAME_DAY_LATE_MS : LATE_AFTER_MS)
  const stopped = age > STOPPED_AFTER_MS
  const title = TABS[activeTab].label
  const sheetOpen = Boolean(sheetPlayer) || matchupOpen || scheduleOpen

  return (
    <div className="app" data-platform={league.platform}>
      <div className="ambient" aria-hidden="true" />

      <NavBar
        title={title}
        subtitle={league.name}
        scrolled={scrolled}
        refreshing={refreshing}
        onRefresh={refresh}
        inert={sheetOpen}
      />

      {(pull.distance > 0 || pulling) && (
        <div
          className={pulling ? 'ptr glass is-spinning' : 'ptr glass'}
          style={{
            transform: `translateY(${pulling ? 44 : pull.distance - 20}px)`,
            opacity: pulling ? 1 : pull.progress
          }}
          aria-hidden="true"
        >
          <Icon name="refresh" strokeWidth={2.2} />
        </div>
      )}

      <main className={activeTab === 'trade' ? 'page has-dock' : 'page'} inert={sheetOpen ? '' : undefined}>
        <header className="hero-title">
          <p className="eyebrow">
            Week {data.week} ·{' '}
            <span className={stale ? 'is-stale' : undefined}>{updatedLabel(data.generatedAt, now)}</span>
          </p>
          <h1 className="large-title">{title}</h1>
        </header>

        <LeagueSwitcher leagues={leagues} activeId={league.id} onChange={setLeagueId} changes={data.changes} />

        {!online && (
          <Notice tone="blue" icon="wifiOff" title="You're offline">
            Showing data from {longAgo(data.generatedAt, now)}.
          </Notice>
        )}
        {online && stale && (
          <Notice title={`Last refreshed ${longAgo(data.generatedAt, now)}`}>
            {stopped
              ? 'The refresh may have stopped. Check the latest run in the Actions tab on GitHub.'
              : gameDay && age < LATE_AFTER_MS
                ? 'Refreshes around kickoff should arrive every 10 minutes. The next scheduled run restarts them.'
                : 'GitHub is running the scheduled refresh late. It usually catches up on its own.'}
          </Notice>
        )}
        {activeTab === 'today' && data.problems?.length > 0 && (
          <Notice tone="red" title="Some data did not load">
            {data.problems.join(' ')}
          </Notice>
        )}

        <div key={`${activeTab}:${league.id}`} className="view">
          {activeTab === 'today' && (
            <TodayView
              league={league}
              report={report}
              byes={byes}
              matchup={matchup}
              changes={data.changes || []}
              news={data.news || []}
              now={now}
              onOpenPlayer={openPlayer}
              onOpenMatchup={() => setMatchupOpen(true)}
              onNavigate={navigate}
            />
          )}
          {activeTab === 'lineup' && (
            <LineupView
              league={league}
              report={report}
              byes={byes}
              segment={segment}
              onSegment={setSegment}
              now={now}
              onOpenPlayer={openPlayer}
              onNavigate={navigate}
            />
          )}
          {activeTab === 'news' && (
            <NewsView news={data.news || []} league={league} now={now} onOpenPlayer={openPlayer} />
          )}
          {activeTab === 'waivers' && (
            <WaiversView league={league} position={position} onPosition={setPosition} onOpenPlayer={openPlayer} />
          )}
          {activeTab === 'trade' && <TradeView league={league} />}
        </div>
      </main>

      <TabBar tabs={tabs} active={activeTab} onChange={selectTab} inert={sheetOpen} />

      <PlayerSheet
        player={sheetPlayer}
        news={data.news || []}
        receptionPoints={league.receptionPoints}
        pickReport={league.pickReport}
        byeWeeks={data.byeWeeks}
        week={data.week}
        onClose={closePlayer}
        now={now}
      />
      <MatchupSheet open={matchupOpen} matchup={matchup} now={now} onClose={closeMatchup} />
      {data.schedule?.games?.length > 0 && <ScheduleTab onOpen={() => setScheduleOpen(true)} inert={sheetOpen} />}
      <SchedulePanel
        open={scheduleOpen}
        onClose={closeSchedule}
        schedule={data.schedule}
        league={league}
        now={now}
      />

      {toast && (
        <div key={toast.id} className="toast glass" role="status">
          <Icon name={toast.icon} strokeWidth={2.2} />
          {toast.text}
        </div>
      )}
    </div>
  )
}

const ERRORS = {
  missing: {
    icon: 'sparkles',
    title: 'No league data yet',
    text: 'Run npm run refresh locally, or check the latest workflow run on GitHub for what failed.'
  },
  offline: {
    icon: 'wifiOff',
    title: "You're offline",
    text: 'Connect to the internet to load your leagues.'
  },
  corrupt: {
    icon: 'alert',
    title: 'The data file could not be read',
    text: 'The last refresh wrote something that is not valid JSON. The next run should replace it.'
  },
  server: {
    icon: 'alert',
    title: 'Could not load your leagues',
    text: 'The site answered with an error.'
  },
  network: {
    icon: 'wifiOff',
    title: 'Could not load your leagues',
    text: 'The request did not reach the site. Check your connection.'
  }
}

function Splash({ error, refreshing, onRetry }) {
  if (!error) {
    return (
      <main className="page" aria-busy="true" aria-label="Loading your leagues">
        <div className="hero-title">
          <div className="skeleton" style={{ width: '9rem', height: 14, borderRadius: 7 }} />
          <div className="skeleton" style={{ width: '12rem', height: 36, marginTop: 10, borderRadius: 10 }} />
        </div>
        <div className="skeleton" style={{ height: 170 }} />
        <div className="skeleton" style={{ height: 120, marginTop: 26 }} />
        <div className="skeleton" style={{ height: 220, marginTop: 26 }} />
      </main>
    )
  }

  const copy = ERRORS[error.kind] || ERRORS.network
  return (
    <main className="splash">
      <div>
        <EmptyState
          icon={copy.icon}
          title={copy.title}
          action={
            error.kind !== 'missing' && (
              <button type="button" className="btn press" onClick={onRetry} disabled={refreshing}>
                <Icon name="refresh" strokeWidth={2.4} />
                Try again
              </button>
            )
          }
        >
          {copy.text}
          {error.status ? ` (HTTP ${error.status})` : ''}
        </EmptyState>
      </div>
    </main>
  )
}
