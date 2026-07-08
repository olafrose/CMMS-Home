'use client'

import { useEffect, useRef, useState } from 'react'

// Render a PDF to canvases with PDF.js so it previews inline regardless of the
// browser's "download PDFs" setting (which even downloads iframed/embedded PDFs).
export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancelled || !container) return
        container.innerHTML = ''
        const avail = Math.max(320, container.clientWidth - 24)
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(2, avail / base.width) })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'mx-auto mb-3 shadow max-w-full h-auto bg-white'
          container.appendChild(canvas)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          if (cancelled) return
        }
        setLoading(false)
      } catch (e) {
        if (!cancelled) { setError('Could not render this PDF.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900 p-3">
      {loading && <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">Loading preview…</p>}
      {error && <p className="text-center text-sm text-red-500 py-8">{error}</p>}
      <div ref={containerRef} />
    </div>
  )
}
