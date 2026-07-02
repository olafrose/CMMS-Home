'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyNewAssetRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/equipment/new?kind=asset')
  }, [router])
  return <p className="px-4 pt-6 text-slate-500">Redirecting…</p>
}
