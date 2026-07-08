'use client'

import { useEffect, useRef, useState } from 'react'

// Render Word (.docx) and Excel (.xlsx) in the browser so they preview inline
// like PDFs. docx-preview renders Word to HTML; SheetJS renders each sheet to a
// table. Both parse the fetched blob client-side — no browser file handler involved.
export default function OfficeViewer({ url, kind }: { url: string; kind: 'docx' | 'xlsx' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    ;(async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer()
        if (cancelled || !el) return
        el.innerHTML = ''
        if (kind === 'docx') {
          const docx = await import('docx-preview')
          await docx.renderAsync(new Blob([buf]), el, undefined, { className: 'docx', inWrapper: true })
        } else {
          const XLSX = await import('xlsx')
          const wb = XLSX.read(buf, { type: 'array' })
          for (const name of wb.SheetNames) {
            const heading = document.createElement('h3')
            heading.textContent = name
            heading.className = 'text-sm font-semibold text-slate-700 mt-4 mb-1'
            el.appendChild(heading)
            const wrap = document.createElement('div')
            wrap.className = 'overflow-auto [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:px-2 [&_th]:py-1 text-sm'
            wrap.innerHTML = XLSX.utils.sheet_to_html(wb.Sheets[name])
            el.appendChild(wrap)
          }
        }
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) { setError('Could not render this document.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url, kind])

  return (
    <div className="flex-1 overflow-auto bg-white text-black p-4">
      {loading && <p className="text-center text-sm text-slate-500 py-8">Loading preview…</p>}
      {error && <p className="text-center text-sm text-red-500 py-8">{error}</p>}
      <div ref={ref} />
    </div>
  )
}
