'use client'

import { useEffect } from 'react'
import { subscribe, type StorageEvent } from './broadcast'

/**
 * Subscribe a component to cross-tab storage events.
 *
 * Pass the keys you care about (e.g. `['projects', 'revenue']`) and an `onChange` callback
 * that re-reads from localStorage and updates state. Fires when ANOTHER tab saves; the
 * originating tab updates synchronously in its own save handler.
 *
 * Usage:
 *   useCrossTabRefresh(['projects'], () => setProjects(loadProjects()))
 */
export function useCrossTabRefresh(
  keys: StorageEvent['key'][],
  onChange: (event: StorageEvent) => void,
) {
  useEffect(() => {
    return subscribe(onChange, keys)
    // Deliberately omitting `onChange` from deps — most consumers will pass an inline
    // function that changes every render. We capture it at mount and trust the caller to
    // re-mount (via key prop or similar) if they need a fresh callback. The keys list is
    // also captured by reference; pass a stable array if you need to change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
