import { useEffect, useState } from 'react'

const PREFIX = 'league-desk:'

/**
 * Remembers small view choices, like the open tab and league, between visits.
 *
 * Storage can be missing or throw in private browsing, so every access is guarded
 * and the app behaves exactly the same without it, just without the memory.
 */
export function readSetting(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeSetting(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Nothing to do. The choice just is not remembered.
  }
}

export function useSetting(key, fallback) {
  const [value, setValue] = useState(() => readSetting(key, fallback))
  useEffect(() => writeSetting(key, value), [key, value])
  return [value, setValue]
}
