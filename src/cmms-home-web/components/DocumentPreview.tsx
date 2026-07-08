'use client'

import { useState } from 'react'
import PdfViewer from './PdfViewer'
import OfficeViewer from './OfficeViewer'
import { api } from '@/lib/api'
import type { Document } from '@/lib/types'

// Shared in-app document preview: a modal that renders PDFs (PDF.js), Word/Excel
// (docx-preview / SheetJS), or falls back to an iframe — so files preview inline
// regardless of the browser's download settings. Used on the documents page and
// the equipment detail page.
export function DocumentPreviewModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const contentUrl = api.documents.contentUrl(doc.id)
  const ext = doc.fileName.toLowerCase().split('.').pop()
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white text-sm" onClick={e => e.stopPropagation()}>
        <span className="flex-1 truncate">{doc.title ?? doc.fileName}</span>
        <a href={contentUrl} target="_blank" rel="noopener noreferrer" className="underline shrink-0">Open in tab</a>
        <a href={contentUrl} download={doc.fileName} className="underline shrink-0">Download</a>
        <button type="button" onClick={onClose} className="text-lg leading-none px-2" aria-label="Close">✕</button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col" onClick={e => e.stopPropagation()}>
        {ext === 'pdf' ? <PdfViewer url={contentUrl} />
          : ext === 'docx' ? <OfficeViewer url={contentUrl} kind="docx" />
          : ext === 'xlsx' ? <OfficeViewer url={contentUrl} kind="xlsx" />
          : <iframe src={contentUrl} title={doc.fileName} className="flex-1 w-full bg-white" />}
      </div>
    </div>
  )
}

// A "Preview" trigger; shows a note instead when the file is gone from disk.
export function DocumentPreviewButton({ doc, className }: { doc: Document; className?: string }) {
  const [open, setOpen] = useState(false)
  if (doc.status === 'Missing')
    return <span className="text-xs text-slate-400 dark:text-slate-500 italic">File no longer on disk</span>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={className ?? 'text-xs text-blue-500 font-medium hover:underline'}>
        Preview
      </button>
      {open && <DocumentPreviewModal doc={doc} onClose={() => setOpen(false)} />}
    </>
  )
}
