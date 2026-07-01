'use client'

import Link from 'next/link'
import { api } from '@/lib/api'
import ManagedNameList from '@/components/ManagedNameList'

export default function CategoriesPage() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/assets" className="text-blue-500 text-sm">‹ Assets</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Categories</h1>
      </div>

      <ManagedNameList
        title="Asset categories"
        addPlaceholder="New asset category"
        api={api.categories}
        deleteConfirm={name => `Delete "${name}"? It will be removed from all assets assigned to it.`}
      />

      <ManagedNameList
        title="Part categories"
        addPlaceholder="New part category"
        api={api.partCategories}
        deleteConfirm={name => `Delete "${name}"? It will be removed from all parts assigned to it.`}
      />

      <ManagedNameList
        title="Tool categories"
        addPlaceholder="New tool category"
        api={api.toolCategories}
        deleteConfirm={name => `Delete "${name}"? It will be removed from all tools assigned to it.`}
      />
    </div>
  )
}
