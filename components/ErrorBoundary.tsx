'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Custom fallback. If omitted, a minimal default is rendered. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Optional label used in console logs to identify which boundary caught the error. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * React Error Boundary.
 *
 * A render-time error anywhere inside `children` would otherwise crash the whole React tree
 * (white screen, no recovery). This catches the error and shows a fallback with a reset button.
 *
 * Use at the LoginGate level for global coverage, and per-page where a route should fail in
 * isolation without taking down navigation.
 *
 * Note: error boundaries do NOT catch:
 *   - Errors in event handlers (try/catch those locally)
 *   - Errors in setTimeout / async code (boundary only sees what React renders)
 *   - Errors during server rendering (use Next.js error.tsx for those)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Log enough to debug after the fact. Keep it console-only — no remote logger configured.
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}] caught:`,
      error,
      info.componentStack,
    )
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />
    }
    return this.props.children
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-[200px] flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-fg-bg border border-red-400/30 rounded-sm p-6 space-y-4">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-red-400 mb-2">
            Something went wrong
          </p>
          <p className="text-sm font-light text-fg-heading">
            This part of the page failed to render. Your data is safe — only the on-screen view is affected.
          </p>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <pre className="text-2xs font-mono text-fg-muted bg-fg-darker/30 rounded-sm p-3 overflow-x-auto whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 hover:bg-fg-darker transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.reload() }}
            className="px-4 py-2 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  )
}
