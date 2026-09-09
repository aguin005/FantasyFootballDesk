import Portrait from './Portrait.jsx'

const KIND_LABEL = {
  downgrade: 'Downgraded',
  upgrade: 'Upgraded',
  news: 'News',
  added: 'Added',
  dropped: 'Dropped',
  waiver: 'Waiver target'
}

export default function ChangeStrip({ changes }) {
  if (!changes || changes.length === 0) {
    return (
      <section className="changes changes-quiet">
        <p>Nothing has changed on your rosters in the last day.</p>
      </section>
    )
  }

  return (
    <section className="changes" aria-label="What changed">
      <h2 className="changes-title">What changed</h2>
      <ul>
        {changes.slice(0, 8).map((entry) => (
          <li key={entry.key} className={entry.isNew ? 'change is-new' : 'change'}>
            <Portrait player={entry} />
            <span className="change-body">
              <span className="change-name">{entry.name}</span>
              <span className="change-meta">
                {KIND_LABEL[entry.kind]}, {entry.position} {entry.team}, {entry.league}
                {entry.starter ? ', starting' : ''}
              </span>
              {entry.url ? (
                <a className="change-detail" href={entry.url} target="_blank" rel="noreferrer">
                  {entry.detail}
                </a>
              ) : (
                <span className="change-detail">{entry.detail}</span>
              )}
            </span>
            <span className="change-when">{ago(entry.detectedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ago(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  return `${Math.round(minutes / 60)}h`
}
