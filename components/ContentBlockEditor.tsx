'use client'

import { useState } from 'react'
import type { ProposalContentBlock } from '@/types'
import { generateId } from '@/lib/utils'
import { Plus, X, ChevronUp, ChevronDown, Video, FileText } from 'lucide-react'

interface Props {
  blocks: ProposalContentBlock[]
  onChange: (blocks: ProposalContentBlock[]) => void
}

const POSITIONS: { value: ProposalContentBlock['position']; label: string }[] = [
  { value: 'before_phases', label: 'Before phases' },
  { value: 'between_phase1_2', label: 'Between Phase 1 & 2' },
  { value: 'between_phase2_3', label: 'Between Phase 2 & 3' },
  { value: 'after_phases', label: 'After phases' },
]

function VideoPreview({ url }: { url: string }) {
  if (!url) return null
  let embedUrl = url
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`
  const vmMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vmMatch) embedUrl = `https://player.vimeo.com/video/${vmMatch[1]}`
  if (embedUrl === url && !url.includes('embed')) return (
    <p className="text-[10px] text-fg-muted/60 font-light mt-1">Paste a YouTube or Vimeo URL</p>
  )
  return (
    <div className="aspect-video w-full mt-2 bg-fg-darker/10 border border-fg-border">
      <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="Video preview" />
    </div>
  )
}

export default function ContentBlockEditor({ blocks, onChange }: Props) {
  const [addingType, setAddingType] = useState<'video' | 'text' | null>(null)

  const addBlock = (type: 'video' | 'text') => {
    const block: ProposalContentBlock = {
      id: generateId(),
      type,
      content: '',
      position: 'after_phases',
    }
    onChange([...blocks, block])
    setAddingType(null)
  }

  const updateBlock = (id: string, updates: Partial<ProposalContentBlock>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, ...updates } : b))
  }

  const removeBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id))
  }

  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const next = [...blocks]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Content Blocks</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addBlock('video')}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading text-[10px] font-light tracking-wide uppercase transition-colors"
          >
            <Video className="w-3 h-3" /> Add Video
          </button>
          <button
            type="button"
            onClick={() => addBlock('text')}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading text-[10px] font-light tracking-wide uppercase transition-colors"
          >
            <FileText className="w-3 h-3" /> Add Text
          </button>
        </div>
      </div>

      {blocks.length === 0 && (
        <p className="text-xs font-light text-fg-muted/50 italic">
          No content blocks yet. Add a video or text block to embed content in the client proposal.
        </p>
      )}

      {blocks.map((block, idx) => (
        <div key={block.id} className="border border-fg-border p-4 space-y-3">
          {/* Block header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {block.type === 'video' ? (
                <Video className="w-3.5 h-3.5 text-fg-muted" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-fg-muted" />
              )}
              <span className="text-[10px] font-light tracking-architectural uppercase text-fg-muted">
                {block.type === 'video' ? 'Video' : 'Text'} Block
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => moveBlock(block.id, -1)} disabled={idx === 0}
                className="p-1 text-fg-muted hover:text-fg-heading disabled:opacity-30 transition-colors">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => moveBlock(block.id, 1)} disabled={idx === blocks.length - 1}
                className="p-1 text-fg-muted hover:text-fg-heading disabled:opacity-30 transition-colors">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => removeBlock(block.id)}
                className="p-1 text-fg-muted hover:text-red-400/60 transition-colors ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Position in proposal</label>
            <select
              value={block.position}
              onChange={e => updateBlock(block.id, { position: e.target.value as ProposalContentBlock['position'] })}
              className="px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none w-full max-w-xs"
            >
              {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Content */}
          {block.type === 'video' ? (
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">YouTube or Vimeo URL</label>
              <input
                type="url"
                value={block.content}
                onChange={e => updateBlock(block.id, { content: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40"
              />
              <VideoPreview url={block.content} />
            </div>
          ) : (
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Text content</label>
              <textarea
                value={block.content}
                onChange={e => updateBlock(block.id, { content: e.target.value })}
                rows={4}
                placeholder="Enter text to display in the proposal…"
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
              />
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Caption (optional)</label>
            <input
              type="text"
              value={block.caption ?? ''}
              onChange={e => updateBlock(block.id, { caption: e.target.value || undefined })}
              placeholder="e.g. Our latest project in Toorak"
              className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
