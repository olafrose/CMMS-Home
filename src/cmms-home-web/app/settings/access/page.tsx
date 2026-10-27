'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'
import type { AccessGrid } from '@/lib/types'
import RightsGrid from './RightsGrid'
import RolesSection from './RolesSection'
import UsersSection from './UsersSection'
import { errorMessage } from './shared'

type Tab = 'rights' | 'roles' | 'users'

const TAB_LABELS: Record<Tab, string> = { rights: 'Rights', roles: 'Roles', users: 'Accounts' }

export default function AccessPage() {
  const { loading: authLoading, can } = useAuth()
  const canRoles = can('roles.manage')
  const canUsers = can('users.manage')

  const [grid, setGrid] = useState<AccessGrid | null>(null)
  const [loadingGrid, setLoadingGrid] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('rights')
  const [gridDirty, setGridDirty] = useState(false)

  const loadGrid = useCallback(async () => {
    try {
      setGrid(await api.roles.get())
      setLoadError('')
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not load the roles and rights.'))
    } finally {
      setLoadingGrid(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    // /roles needs roles.manage; someone with only users.manage would just get a 403 back.
    if (!canRoles) { setLoadingGrid(false); return }
    void loadGrid()
  }, [authLoading, canRoles, loadGrid])

  // can() is false while auth is in flight, so branch on loading first — treating it as a
  // denial would flash "no access" at an administrator on every page load.
  if (authLoading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>

  if (!canRoles && !canUsers) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-3">
        <Link href="/settings" className="text-blue-500 text-sm">‹ Settings</Link>
        <p className="text-sm text-slate-500 dark:text-slate-400">You do not have access to this.</p>
      </div>
    )
  }

  // Only the sections this operator may actually use, so nothing renders half-broken.
  const tabs: Tab[] = [...(canRoles ? (['rights', 'roles'] as Tab[]) : []), ...(canUsers ? (['users'] as Tab[]) : [])]
  const active = tabs.includes(tab) ? tab : tabs[0]

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-blue-500 text-sm">‹ Settings</Link>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Access</h1>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={active === t}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {TAB_LABELS[t]}
              {/* Unsaved rights live on another tab; the dot is the only hint you get there. */}
              {t === 'rights' && gridDirty && (
                <span className={`ml-1 ${active === t ? 'text-amber-200' : 'text-amber-500'}`} aria-label="unsaved changes">•</span>
              )}
            </button>
          ))}
        </div>
      )}

      {canRoles && loadingGrid && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>
      )}
      {canRoles && loadError && <p className="text-sm text-red-500">{loadError}</p>}

      {canRoles && grid && (
        <>
          {/*
            Hidden rather than unmounted: the rights grid holds an unsaved draft, and switching
            to Roles to check a member count should not throw a half-finished matrix away.
          */}
          <div className={active === 'rights' ? '' : 'hidden'}>
            <RightsGrid grid={grid} onDirtyChange={setGridDirty} />
          </div>
          <div className={active === 'roles' ? '' : 'hidden'}>
            <RolesSection roles={grid.roles} gridDirty={gridDirty} onChanged={loadGrid} />
          </div>
        </>
      )}

      {canUsers && (
        <div className={active === 'users' ? '' : 'hidden'}>
          <UsersSection roles={grid?.roles ?? []} />
        </div>
      )}
    </div>
  )
}
