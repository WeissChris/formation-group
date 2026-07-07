'use client'

// "Check spelling" for the client-facing documents (OPC, Quote). Runs the page's text through
// the en_AU dictionary (lib/spellcheck) and lists suspect words with suggestions. Business
// terms (suppliers, stone names, products) get "Ignore" - persisted, never flagged again.

import { useState } from 'react'
import { SpellCheck, X, Check } from 'lucide-react'
import { checkSpelling, addToIgnoreList, type SpellingIssue } from '@/lib/spellcheck'

export default function SpellCheckButton({ getTexts }: { getTexts: () => string[] }) {
  const [issues, setIssues] = useState<SpellingIssue[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      setIssues(await checkSpelling(getTexts()))
      setOpen(true)
    } catch {
      window.alert('Spell check failed to load its dictionary - check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const ignore = (word: string) => {
    addToIgnoreList(word)
    setIssues(prev => (prev ?? []).filter(i => i.word !== word))
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors disabled:opacity-50"
      >
        <SpellCheck className="w-3.5 h-3.5" /> {busy ? 'Checking…' : 'Spelling'}
      </button>

      {open && issues && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-gray-200 shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 shrink-0">
              <p className="text-sm font-normal text-gray-900">
                Spelling check {issues.length === 0 ? '- all clear' : `- ${issues.length} word${issues.length === 1 ? '' : 's'} to look at`}
              </p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {issues.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Check className="w-8 h-8 text-green-600 mx-auto mb-3" />
                  <p className="text-sm font-light text-gray-500">No spelling issues found.</p>
                </div>
              ) : issues.map(issue => (
                <div key={issue.word} className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm text-red-600 font-medium">
                      {issue.word}
                      {issue.count > 1 && <span className="text-gray-400 font-light"> ×{issue.count}</span>}
                    </p>
                    {issue.suggestions.length > 0 && (
                      <p className="text-xs font-light text-gray-500 mt-0.5">Did you mean: {issue.suggestions.join(', ')}?</p>
                    )}
                  </div>
                  <button
                    onClick={() => ignore(issue.word)}
                    title="Business term - never flag this word again"
                    className="text-2xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2 py-1 shrink-0 transition-colors"
                  >
                    Ignore
                  </button>
                </div>
              ))}
            </div>
            {issues.length > 0 && (
              <p className="px-5 py-3 text-2xs font-light text-gray-400 border-t border-gray-100 shrink-0">
                Fix the words in the document, then run the check again. Ignored words are remembered.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
