'use client'

// Last-resort error boundary for errors thrown in the root layout itself. When this fires,
// the root layout has failed to render, so we must provide our own <html>/<body> wrapping.
// Keep styling inline-only (no Tailwind classes guaranteed to load) so the fallback
// renders even if the global stylesheet failed.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errortsx

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#1a1a1a',
          color: '#e5e7eb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, width: '100%' }}>
          <p style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f87171', marginBottom: 12 }}>
            Application error
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 300, marginBottom: 16 }}>
            The app failed to load.
          </h1>
          <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 24, lineHeight: 1.5 }}>
            Your data in localStorage and the cloud is safe — only the on-screen application
            failed to render. Try reloading, or come back in a few minutes if the issue persists.
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <pre style={{
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.3)',
              padding: 12,
              borderRadius: 2,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              marginBottom: 16,
            }}>
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          )}
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: '#374151',
              color: 'rgba(255,255,255,0.85)',
              border: 'none',
              cursor: 'pointer',
              marginRight: 12,
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/' }}
            style={{
              padding: '10px 20px',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'transparent',
              color: '#9ca3af',
              border: '1px solid #374151',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
