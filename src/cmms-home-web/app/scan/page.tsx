'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ScanPage() {
  const router = useRouter()
  const liveInitialized = useRef(false)
  const [isSecure, setIsSecure] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setIsSecure(window.isSecureContext)
  }, [])

  // Live camera — only when served over HTTPS (secure context)
  useEffect(() => {
    if (!isSecure || liveInitialized.current) return
    liveInitialized.current = true

    let scanner: import('html5-qrcode').Html5Qrcode | null = null

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode('qr-reader-live')
      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => handleDecoded(decoded),
          undefined,
        )
        .catch((err: unknown) => setError(String(err)))
    })

    return () => { scanner?.stop().catch(() => {}) }
  }, [isSecure]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDecoded(decoded: string) {
    const storage = decoded.match(/\/storage\/(box|shelf)\/([0-9a-f-]{36})/i)
    const asset = decoded.match(/\/assets\/([0-9a-f-]{36})/i)
    if (storage) {
      router.push(`/storage/${storage[1].toLowerCase()}/${storage[2]}`)
    } else if (asset) {
      router.push(`/assets/${asset[1]}/log`)
    } else if (/^[0-9a-f-]{36}$/i.test(decoded)) {
      router.push(`/assets/${decoded}/log`)
    } else {
      setError(`Unrecognised QR code`)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    const { Html5Qrcode } = await import('html5-qrcode')
    const reader = new Html5Qrcode('qr-reader-file')
    try {
      const result = await reader.scanFile(file, false)
      handleDecoded(result)
    } catch {
      setError('No QR code found in image — try again.')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Scan QR Code</h1>

      {/* Primary: file capture — works over HTTP on Android */}
      <label className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white font-semibold py-4 rounded-xl shadow cursor-pointer text-lg">
        <span>📷</span> Open Camera to Scan
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {/* Live viewfinder — only on HTTPS */}
      {isSecure && (
        <div>
          <p className="text-xs text-slate-400 mb-2 text-center">Or use live viewfinder:</p>
          <div
            id="qr-reader-live"
            className="w-full rounded-xl overflow-hidden border border-slate-200 bg-black"
            style={{ minHeight: 280 }}
          />
        </div>
      )}

      {!isSecure && (
        <p className="text-xs text-slate-400 text-center">
          Live viewfinder requires HTTPS. The camera button above works without it.
        </p>
      )}

      {/* Hidden mount point for file-based scanner */}
      <div id="qr-reader-file" className="hidden" />

      {error && (
        <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>
      )}
    </div>
  )
}
