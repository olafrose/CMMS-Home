'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Category lists are settings-type value lists, so they now live under Settings.
export default function CategoriesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/settings/categories') }, [router])
  return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Redirecting to Settings…</div>
}
