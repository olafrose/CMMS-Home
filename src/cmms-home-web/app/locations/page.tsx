'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Locations were merged into the unified Storage hierarchy; manage places there.
export default function LocationsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/storage') }, [router])
  return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Redirecting to Storage…</div>
}
