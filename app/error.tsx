'use client'

// Next.js App Router route-level error boundary. Catches uncaught errors thrown during
// rendering of any segment under app/ (server OR client components). Replaces the route's
// content with this fallback while leaving the nav/layout intact.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/error
//
// For errors in the root layout itself, see app/global-error.tsx.

import { useEffect } from 'react'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[RouteError]', error)
  }, [error])

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-fg-bg border border-red-400/30 rounded-sm p-6 space-y-4">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-red-400 mb-2">
            Page failed to load
          </p>
          <p className="text-sm font-light text-fg-heading">
            Something went wrong rendering this page. Your data is safe — try again or navigate elsewhere.
          </p>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <pre className="text-2xs font-mono text-fg-muted bg-fg-darker/30 rounded-sm p-3 overflow-x-auto whitespace-pre-wrap">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 hover:bg-fg-darker transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
