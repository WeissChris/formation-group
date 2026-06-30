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
  | { key: 'supervisors' }
  | { key: 'takeoffs' }
  | { key: 'all' }  // wildcard — emit on bulk operations (seed, recover-from-IDB)

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME)
  return channel
}

// Same-tab event bus. BroadcastChannel deliberately does NOT echo a message back to the tab that
// sent it, which is correct for save helpers (the saving component updates itself synchronously).
// But the realtime live-sync applies REMOTE writes in the very tab the user is looking at, so that
// tab needs its own notification — hence this in-process bus that subscribe() also listens to.
let localBus: EventTarget | null = null
function getLocalBus(): EventTarget | null {
  if (typeof window === 'undefined') return null
  if (!localBus) localBus = new EventTarget()
  return localBus
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
 * Notify subscribers IN THIS TAB. Use when a write happens in the same tab whose subscribers must
 * react — e.g. the realtime live-sync, which merges remote rows into localStorage while the user is
 * viewing this tab. (Regular save helpers don't need this; the writing component re-reads itself.)
 */
export function notifyThisTab(event: StorageEvent): void {
  const bus = getLocalBus()
  if (!bus) return
  bus.dispatchEvent(new CustomEvent('storage-change', { detail: event }))
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
  const accept = (data: StorageEvent | undefined) => {
    if (!data || typeof data.key !== 'string') return
    if (keys && !keys.includes(data.key) && data.key !== 'all') return
    handler(data)
  }

  // Other tabs (BroadcastChannel)
  const ch = getChannel()
  const bcListener = (e: MessageEvent<StorageEvent>) => accept(e.data)
  ch?.addEventListener('message', bcListener)

  // This tab (live-sync writes) — see notifyThisTab.
  const bus = getLocalBus()
  const busListener = (e: Event) => accept((e as CustomEvent<StorageEvent>).detail)
  bus?.addEventListener('storage-change', busListener)

  return () => {
    ch?.removeEventListener('message', bcListener)
    bus?.removeEventListener('storage-change', busListener)
  }
}
