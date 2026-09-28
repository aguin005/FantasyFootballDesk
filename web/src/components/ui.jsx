import Icon from './Icon.jsx'
import Portrait from './Portrait.jsx'
import { injuryLevel, injuryLabel, injuryShort, gameState } from '../lib/lineup.js'
import { kickoffLabel } from '../lib/format.js'

export function Section({ title, meta, action, foot, children, id }) {
  return (
    <section className="section" aria-labelledby={id}>
      {(title || action || meta) && (
        <div className="section-head">
          {title && <h2 id={id}>{title}</h2>}
          {action || (meta && <span className="section-meta">{meta}</span>)}
        </div>
      )}
      {children}
      {foot && <p className="section-foot">{foot}</p>}
    </section>
  )
}

export function LinkButton({ children, onClick, icon = 'chevronRight' }) {
  return (
    <button type="button" className="link-btn" onClick={onClick}>
      {children}
      {icon && <Icon name={icon} strokeWidth={2.4} />}
    </button>
  )
}

const INJURY_TONES = ['', 'yellow', 'orange', 'red']

export function InjuryPill({ status, long }) {
  if (!status) return null
  return (
    <span
      className="pill"
      data-tone={INJURY_TONES[injuryLevel(status)] || 'orange'}
      title={injuryLabel(status)}
      aria-label={injuryLabel(status)}
    >
      {long ? injuryLabel(status) : injuryShort(status)}
    </span>
  )
}

export function Pill({ tone, icon, children }) {
  return (
    <span className="pill" data-tone={tone}>
      {icon && <Icon name={icon} strokeWidth={2.6} />}
      {children}
    </span>
  )
}

/** "vs DAL · Sun 1:00 PM", with the time swapped for a state once the game starts. */
export function matchupText(player, now) {
  if (!player.game) return 'Bye'
  const state = gameState(player, now)
  const when = state === 'live' ? 'Live' : state === 'played' ? 'Played' : kickoffLabel(player.game)
  return [player.game.matchup, when].filter(Boolean).join(' · ')
}

/**
 * One player in a grouped list. Rows are buttons whenever they open something, so
 * they work with a keyboard and a screen reader, not just a finger.
 */
export function PlayerRow({
  player,
  lead,
  sub,
  note,
  noteAccent,
  trail,
  onSelect,
  dim,
  selected,
  chevron = true,
  newsDot = false,
  badge = null
}) {
  const className = ['row', dim && 'is-dim', selected && 'is-selected'].filter(Boolean).join(' ')
  const body = (
    <>
      {lead}
      <Portrait player={player} />
      <span className="row-body">
        <span className="row-main">
          <span className="row-title">
            <span className="name">{player.name}</span>
            <InjuryPill status={player.injuryStatus} />
            {badge}
            {newsDot && player.news?.length > 0 && <span className="news-dot" title="Recent news" />}
          </span>
          {sub && <span className="row-sub">{sub}</span>}
          {note && <span className={noteAccent ? 'row-note is-accent' : 'row-note'}>{note}</span>}
        </span>
        {trail}
        {onSelect && chevron && <Icon name="chevronRight" className="chev" strokeWidth={2.6} />}
      </span>
    </>
  )

  if (!onSelect) {
    return (
      <div className={className} data-pos={player.position || undefined}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={className}
      data-pos={player.position || undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={() => onSelect(player)}
    >
      {body}
    </button>
  )
}

export function SlotPill({ label, position }) {
  return (
    <span className="pos" data-pos={position || undefined}>
      {label}
    </span>
  )
}

export function Points({ value, caption = 'proj', digits = 1 }) {
  if (value == null) return null
  return (
    <span className="row-trail">
      <span className="row-value">{value.toFixed(digits)}</span>
      {caption && <span className="row-caption">{caption}</span>}
    </span>
  )
}

const RING_RADIUS = 19
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** The waiver model's 0 to 100 score as an activity style ring. */
export function ScoreRing({ value }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0))
  const color = clamped >= 70 ? 'var(--green)' : clamped >= 40 ? 'var(--teal)' : 'var(--gray)'
  return (
    <span className="ring" style={{ '--ring': color }} aria-label={`Score ${clamped} of 100`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="ring-track" cx="22" cy="22" r={RING_RADIUS} />
        <circle
          className="ring-value"
          cx="22"
          cy="22"
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - clamped / 100)}
        />
      </svg>
      <span className="ring-label">{clamped}</span>
    </span>
  )
}

/** iOS segmented control. The lens slides to the selected segment. */
export function Segmented({ options, value, onChange, label, className = '' }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  return (
    <div
      className={`seg ${className}`}
      role="radiogroup"
      aria-label={label}
      style={{ '--count': options.length, '--index': index }}
    >
      <span className="seg-lens" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'seg-item is-on' : 'seg-item'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null && <span className="seg-count">{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'chip press is-on' : 'chip press'}
          data-pos={option.position}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null && <span className="chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon = 'sparkles', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} strokeWidth={1.6} />
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Notice({ tone, icon = 'alert', title, children }) {
  return (
    <div className="notice" data-tone={tone} role="status">
      <Icon name={icon} />
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
    </div>
  )
}
