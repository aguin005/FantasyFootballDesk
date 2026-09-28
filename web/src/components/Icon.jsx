/**
 * Line icons drawn in the spirit of SF Symbols. Apple's license keeps the real
 * symbols to apps on its own platforms, so these are original paths on a 24 point
 * grid with the same round caps and stroke weight.
 */
const PATHS = {
  today: ['M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z'],
  lineup: [
    'M8.2 3.5 4 5.8 2.6 10.3l3.1 1.4v8.8h12.6v-8.8l3.1-1.4L20 5.8l-4.2-2.3c-.6 1.5-2 2.4-3.8 2.4s-3.2-.9-3.8-2.4z'
  ],
  news: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V19a1.5 1.5 0 0 0 1.5 1.5h-13A1.5 1.5 0 0 1 4 19z',
    'M17 9h2.5a1 1 0 0 1 1 1v9a1.5 1.5 0 0 1-3 0',
    'M7.5 8h6M7.5 12h6M7.5 16h3.5'
  ],
  waivers: ['M10 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5z', 'M3 20.5a7 7 0 0 1 11.2-5.6', 'M18.5 14v6.5M15.25 17.25h6.5'],
  trade: ['M7.5 3.5 4 7l3.5 3.5', 'M4 7h13', 'M16.5 13.5 20 17l-3.5 3.5', 'M20 17H7'],
  refresh: ['M20 12.5a8 8 0 1 1-2.4-6.2', 'M20 4v4.5h-4.5'],
  chevronRight: ['M9 5.5 15.5 12 9 18.5'],
  chevronDown: ['M5.5 9 12 15.5 18.5 9'],
  chevronUpDown: ['M7.5 9.5 12 5l4.5 4.5', 'M7.5 14.5 12 19l4.5-4.5'],
  close: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
  check: ['M5 12.5 9.8 17 19 7'],
  alert: ['M10.4 4.2 2.6 17.8A1.8 1.8 0 0 0 4.2 20.5h15.6a1.8 1.8 0 0 0 1.6-2.7L13.6 4.2a1.8 1.8 0 0 0-3.2 0z', 'M12 9.5v4.5', 'M12 17.2v.1'],
  checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.3l2.7 2.7L16.2 9.5'],
  calendar: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 10h16', 'M8.5 3v4M15.5 3v4'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3 2'],
  bolt: ['M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z'],
  arrowUp: ['M12 19V5.5', 'M6 11.5l6-6 6 6'],
  arrowDown: ['M12 5v13.5', 'M6 12.5l6 6 6-6'],
  swap: ['M7 4v15', 'M3.5 15.5 7 19l3.5-3.5', 'M17 20V5', 'M13.5 8.5 17 5l3.5 3.5'],
  external: ['M8 16 17 7', 'M9 7h8v8'],
  sparkles: ['M11 3.5 12.6 8.4 17.5 10l-4.9 1.6L11 16.5l-1.6-4.9L4.5 10l4.9-1.6z', 'M18 14.5l.8 2.2 2.2.8-2.2.8L18 20.5l-.8-2.2-2.2-.8 2.2-.8z'],
  pen: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z', 'M13.5 8.5l2 2'],
  chart: ['M4.5 20V13', 'M10 20V8', 'M15.5 20v-5', 'M21 20V4.5', 'M3 20.5h19'],
  wifiOff: ['M3 3l18 18', 'M8.5 12.6a5 5 0 0 1 5.6-.9', 'M5 9.2a10 10 0 0 1 4-2.1', 'M14.7 7.2A10 10 0 0 1 19 9.2', 'M12 18.5v.1'],
  person: ['M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4.5 20.5a7.5 7.5 0 0 1 15 0'],
  shield: ['M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6z'],
  heart: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'],
  trendUp: ['M3.5 16.5 9 11l4 4 7.5-7.5', 'M15 7.5h5.5V13'],
  list: ['M9 6.5h11M9 12h11M9 17.5h11', 'M4.5 6.5v.1M4.5 12v.1M4.5 17.5v.1']
}

export default function Icon({ name, className, title, strokeWidth = 2 }) {
  const paths = PATHS[name]
  if (!paths) return null
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
