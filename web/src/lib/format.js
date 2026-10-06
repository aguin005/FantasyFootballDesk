/**
 * Time and number formatting shared by every view.
 *
 * Times render in the device's own zone, since this is an app on your phone and
 * that is the clock you read everything else against. Kickoffs arrive as real UTC
 * instants from the refresh script, so no view ever has to think about Eastern.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "Just now", "12m ago", "3h ago", "2d ago". Whole units count down, the way a
 * clock does: rounding called 59 minutes and 40 seconds "60m ago".
 */
export function timeAgo(iso, now = Date.now()) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const elapsed = Math.max(0, now - then)
  if (elapsed < MINUTE) return 'Just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  return `${Math.floor(elapsed / DAY)}d ago`
}

/** "12 minutes ago", "3 hours ago", "2 days ago", for sentences rather than labels. */
export function longAgo(iso, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(iso))
  if (!Number.isFinite(elapsed)) return ''
  if (elapsed < MINUTE) return 'just now'
  const [size, unit] =
    elapsed < HOUR ? [MINUTE, 'minute'] : elapsed < DAY ? [HOUR, 'hour'] : [DAY, 'day']
  const count = Math.floor(elapsed / size)
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/** The same without the suffix, for tight trailing columns. */
export function shortAgo(iso, now = Date.now()) {
  const text = timeAgo(iso, now)
  return text === 'Just now' ? 'now' : text.replace(' ago', '')
}

export function ageMs(iso, now = Date.now()) {
  const then = Date.parse(iso)
  return Number.isFinite(then) ? now - then : Infinity
}

export function formatPoints(value, digits = 1) {
  return value == null || !Number.isFinite(value) ? '-' : value.toFixed(digits)
}

export function signed(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '-'
  const fixed = Math.abs(value).toFixed(digits)
  if (Number(fixed) === 0) return fixed
  return value > 0 ? `+${fixed}` : `-${fixed}`
}

export function weekday(iso, style = 'long') {
  return new Date(iso).toLocaleDateString(undefined, { weekday: style })
}

export function clockTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Sun 1:00 PM", or the bare weekday when the schedule had no kickoff time. */
export function kickoffLabel(game) {
  if (!game) return 'Bye'
  if (!game.kickoffISO) return game.weekday || ''
  return `${weekday(game.kickoffISO, 'short')} ${clockTime(game.kickoffISO)}`
}

/** Calendar day in the device zone, used to group games that share a date. */
export function localDayKey(iso) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function updatedLabel(iso, now = Date.now()) {
  const age = ageMs(iso, now)
  if (age < DAY) return `Updated ${timeAgo(iso, now).toLowerCase()}`
  return `Updated ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}
