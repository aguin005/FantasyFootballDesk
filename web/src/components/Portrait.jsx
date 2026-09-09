import { useState } from 'react'

/**
 * ESPN does not have a headshot for every player, and a broken image icon looks
 * worse than no image, so a failed load falls back to initials on a position
 * colored disc.
 */
export default function Portrait({ player, size = 'normal' }) {
  const [failed, setFailed] = useState(false)
  const initials = player.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  if (!player.image || failed) {
    return (
      <span className={`portrait portrait-${size} portrait-blank`} data-pos={player.position}>
        {initials}
      </span>
    )
  }

  return (
    <span className={`portrait portrait-${size}`} data-pos={player.position}>
      <img src={player.image} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  )
}
