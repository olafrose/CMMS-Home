'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function LegacyAssetLogRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/equipment/${id}/log`)
  }, [id, router])
  return <p className="px-4 pt-6 text-slate-500">Redirecting…</p>
}
