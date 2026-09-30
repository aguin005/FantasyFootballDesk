import { useState } from 'react'
import { teamLogos } from '../lib/teams.js'

/**
 * A team's logo, with the dark variant in dark mode. If the dark file fails it
 * falls back to the standard one, and if that fails too, to the abbreviation, so
 * a blocked image never leaves a broken icon behind.
 */
export default function TeamLogo({ team, size = 24 }) {
  const [stage, setStage] = useState('dark')
  const { light, dark } = teamLogos(team)
  const style = { '--logo': `${size}px` }

  if (stage === 'text') {
    return (
      <span className="team-logo is-text" style={style} aria-hidden="true">
        {team}
      </span>
    )
  }

  // Removing the dark source makes the browser pick the image again, from src.
  const onError = (event) => setStage(stage === 'dark' && event.currentTarget.currentSrc === dark ? 'light' : 'text')

  return (
    <picture className="team-logo" style={style} aria-hidden="true">
      {stage === 'dark' && <source media="(prefers-color-scheme: dark)" srcSet={dark} />}
      <img src={light} alt="" loading="lazy" decoding="async" onError={onError} />
    </picture>
  )
}
