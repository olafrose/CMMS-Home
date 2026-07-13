'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFDocumentLoadingTask, PageViewport } from 'pdfjs-dist'

// Per-page device-pixel budget (~2000×2000). Guards a single huge or high-DPI
// page (e.g. an A0 scan) from allocating a canvas big enough to OOM the tab.
const MAX_CANVAS_PIXELS = 4_000_000

// Render a PDF to canvases with PDF.js so it previews inline regardless of the
// browser's "download PDFs" setting. Pages render lazily as they scroll into
// view and off-screen canvases are freed, so large/many-page docs don't blow up
// mobile memory (previously every page rendered at once and crashed the tab).
export default function PdfViewer({ url }: { url: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let observer: IntersectionObserver | null = null
    let loadingTask: PDFDocumentLoadingTask | null = null
    let doc: PDFDocumentProxy | null = null

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        loadingTask = pdfjs.getDocument({ url })
        doc = await loadingTask.promise
        const scroller = scrollRef.current
        const pagesEl = pagesRef.current
        if (cancelled || !doc || !scroller || !pagesEl) return
        pagesEl.innerHTML = ''

        const avail = Math.max(320, scroller.clientWidth - 24)
        const dpr = Math.min(window.devicePixelRatio || 1, 3)

        type Entry = { n: number; div: HTMLDivElement; cssScale: number; base: PageViewport; rendering: boolean; rendered: boolean }
        const entries = new Map<Element, Entry>()

        // Placeholder div per page, sized to its CSS dimensions so the scroll
        // height is correct up front and rendering causes no layout jump.
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const cssScale = Math.min(2, avail / base.width)
          const div = document.createElement('div')
          div.className = 'mx-auto mb-3 shadow bg-white'
          div.style.width = `${Math.floor(base.width * cssScale)}px`
          div.style.height = `${Math.floor(base.height * cssScale)}px`
          pagesEl.appendChild(div)
          entries.set(div, { n, div, cssScale, base, rendering: false, rendered: false })
        }
        if (!cancelled) setLoading(false)

        async function renderEntry(e: Entry) {
          if (e.rendering || e.rendered || cancelled || !doc) return
          e.rendering = true
          try {
            const page = await doc.getPage(e.n)
            if (cancelled) return
            let scale = Math.min(e.cssScale * dpr, 3)
            const px = e.base.width * scale * (e.base.height * scale)
            if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px)
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            canvas.style.width = '100%'
            canvas.style.height = '100%'
            canvas.style.display = 'block'
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            e.div.appendChild(canvas)
            await page.render({ canvas, canvasContext: ctx, viewport }).promise
            if (cancelled) { canvas.width = 0; canvas.height = 0; e.div.innerHTML = ''; return }
            e.rendered = true
          } catch {
            /* ignore a single page's render failure */
          } finally {
            e.rendering = false
          }
        }

        // Drop the canvas when a page scrolls well out of view; the div keeps its
        // fixed size so layout is stable. Re-rendered if scrolled back to.
        function freeEntry(e: Entry) {
          if (!e.rendered) return
          e.div.innerHTML = ''
          e.rendered = false
        }

        observer = new IntersectionObserver(
          obsEntries => {
            for (const oe of obsEntries) {
              const e = entries.get(oe.target)
              if (!e) continue
              if (oe.isIntersecting) renderEntry(e)
              else freeEntry(e)
            }
          },
          { root: scroller, rootMargin: '600px 0px' },
        )
        for (const div of entries.keys()) observer.observe(div)
      } catch {
        if (!cancelled) { setError('Could not render this PDF.'); setLoading(false) }
      }
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
      try { loadingTask?.destroy() } catch { /* ignore */ }
    }
  }, [url])

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900 p-3">
      {loading && <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">Loading preview…</p>}
      {error && <p className="text-center text-sm text-red-500 py-8">{error}</p>}
      <div ref={pagesRef} />
    </div>
  )
}
