// Cross-tab sync via BroadcastChannel.
//
// When tab A saves a project, tab B (with the same app open) doesn't know — it shows the
// stale data until reload. This module wires a small notification channel so every save
// helper can announce a change, and consumer hooks can re-fetch.
//
// Why not the `storage` event? Because the `storage` event only fires in OTHER tabs, not the
// tab that initiated the write, which means our pattern (notify on save, re-read everywhere)
// would skip the originating tab's reactive updates. BroadcastChannel is symmetric.
//
// Graceful when BroadcastChannel isn't available (SSR, old browsers): notify() no-ops,
// subscribe() returns a noop unsubscriber.

const CHANNEL_NAME = 'formation-storage'

export type StorageEvent =
  | { key: 'projects' }
  | { key: 'estimates' }
  | { key: 'proposals' }
  | { key: 'revenue' }
  | { key: 'gantt' }
  | { key: 'actuals' }
  | { key: 'progress_claims' }
  | { key: 'payment_stages' }
  | { key: 'design_projects' }
  | { key: 'subcontractors' }
  | { key: 'takeoffs' }
  | { key: 'all' }  // wildcard — emit on bulk operations (seed, recover-from-IDB)

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

/** Announce that a localStorage key has been updated. Safe to call from anywhere. */
export function notify(event: StorageEvent): void {
  const ch = getChannel()
  if (!ch) return
  try {
    ch.postMessage(event)
  } catch {
    // BroadcastChannel can throw if the channel was closed (HMR can do this in dev). Ignore.
  }
}

/**
 * Subscribe to storage events from this AND other tabs.
 * Pass `keys` to filter (or omit to receive everything). Returns an unsubscriber.
 *
 * NOTE: BroadcastChannel by default does NOT echo messages back to the sending context. To
 * also catch events from the tab that initiated the write, callers re-read after their own
 * save calls — that's the normal pattern and we don't try to be clever here.
 */
export function subscribe(
  handler: (event: StorageEvent) => void,
  keys?: StorageEvent['key'][],
): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const listener = (e: MessageEvent<StorageEvent>) => {
    if (!e.data || typeof e.data.key !== 'string') return
    if (keys && !keys.includes(e.data.key) && e.data.key !== 'all') return
    handler(e.data)
  }
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}
