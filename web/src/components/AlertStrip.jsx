export default function AlertStrip({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <section className="alerts alerts-clear">
        <p>Nothing new on any of your rosters.</p>
      </section>
    )
  }

  return (
    <section className="alerts" aria-label="Players to look at">
      <h2 className="alerts-title">Look at these players</h2>
      <ul>
        {alerts.slice(0, 8).map((alert) => (
          <li key={`${alert.leagueId}-${alert.name}`} className="alert">
            <span className="alert-player">
              <span className="alert-name">{alert.name}</span>
              <span className="alert-meta">
                {alert.position} {alert.team}, {alert.league}
                {alert.starter ? ', starting' : ''}
              </span>
            </span>
            {alert.injuryStatus && (
              <span className={`tag tag-${severity(alert.injuryStatus)}`}>{alert.injuryStatus}</span>
            )}
            {alert.headline && <span className="alert-headline">{alert.headline}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function severity(status) {
  if (['OUT', 'IR', 'SUSPENDED', 'DOUBTFUL'].includes(status)) return 'bad'
  if (status === 'QUESTIONABLE') return 'watch'
  return 'note'
}
