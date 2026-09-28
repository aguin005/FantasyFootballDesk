import { useState } from 'react'

/**
 * A player's headshot on a disc tinted with their position color. ESPN does not
 * have a headshot for everyone, and a broken image looks worse than none, so a
 * failed load falls back to initials. Team defenses show the team logo, which is
 * contained rather than cropped.
 */
export default function Portrait({ player, size }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const isLogo = player.position === 'DEF'
  const className = ['avatar', size && `avatar-${size}`, isLogo && 'is-logo'].filter(Boolean).join(' ')

  if (!player.image || failedSrc === player.image) {
    return (
      <span className={className} data-pos={player.position || undefined} aria-hidden="true">
        <span className="avatar-initials">{initials(player.name)}</span>
      </span>
    )
  }

  return (
    <span className={className} data-pos={player.position || undefined} aria-hidden="true">
      <img src={player.image} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(player.image)} />
    </span>
  )
}

function initials(name = '') {
  return String(name)
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
