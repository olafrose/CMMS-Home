'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyNewToolRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/equipment/new?kind=tool')
  }, [router])
  return <p className="px-4 pt-6 text-slate-500">Redirecting…</p>
}
