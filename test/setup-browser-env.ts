// Shared test setup for tests that exercise browser-only modules (storage.ts etc).
//
// The Vitest default environment is Node, which has no `window` / `localStorage` / `indexedDB`.
// Rather than depending on happy-dom or jsdom (heavyweight), we install a minimal in-memory
// shim that's enough for the storage helpers to round-trip data and not throw on backup calls.
//
// Import this from any test file that needs the browser globals:
//   import './test-setup' (or call installBrowserEnv() directly)

const memStore = new Map<string, string>()

const memStorage: Storage = {
  get length() { return memStore.size },
  clear: () => memStore.clear(),
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memStore.set(k, String(v)) },
  removeItem: (k: string) => { memStore.delete(k) },
  key: (i: number) => Array.from(memStore.keys())[i] ?? null,
}

// indexedDB stub — backupToIndexedDB in storage.ts opens a DB and never awaits the result.
// We give it an object with `open()` that returns a dummy request whose onsuccess/onupgradeneeded
// are never called. The function returns synchronously without error.
const stubIndexedDB = {
  open: () => ({
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    result: null,
  }),
}

export function installBrowserEnv() {
  const g = globalThis as unknown as {
    window?: unknown
    localStorage?: Storage
    indexedDB?: unknown
  }
  if (!g.window) g.window = { localStorage: memStorage, indexedDB: stubIndexedDB }
  if (!g.localStorage) g.localStorage = memStorage
  if (!g.indexedDB) g.indexedDB = stubIndexedDB
}

export function resetBrowserEnv() {
  memStore.clear()
}

// Auto-install on import — most consumers want both
installBrowserEnv()
