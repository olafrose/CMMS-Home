'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { formatLocationPath, locationPath } from '@/lib/storage'
import type { AppSettings, PathShorteningMode, StorageLocation } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

// Must match AppSettings.AbsoluteStorageMaxDepth on the API, which is itself pinned to
// locationPath()'s iteration guard in lib/storage.ts.
const ABSOLUTE_MAX_DEPTH = 16

function SettingRow({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) {
  return (
    <Link href={href} className={`flex items-center gap-3 ${card} px-4 py-3`}>
      <span className="text-lg leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>
      </div>
      <span className="text-slate-300 dark:text-slate-600 text-lg">›</span>
    </Link>
  )
}

export default function SettingsPage() {
  const [draft, setDraft] = useState<AppSettings>()
  const [places, setPlaces] = useState<StorageLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [overCap, setOverCap] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.appSettings.get(), api.storageLocations.list()])
      .then(([s, p]) => { setDraft(s); setPlaces(p) })
      .finally(() => setLoading(false))
  }, [])

  // Preview against the user's own deepest place, so the effect of the policy is
  // concrete rather than a made-up example.
  const deepest = useMemo(() => {
    const byId = new Map(places.map(p => [p.id, p]))
    let bestId: string | undefined
    let bestDepth = 0
    for (const p of places) {
      let depth = 1
      let cur = p
      let guard = 0
      while (cur.parentId && guard++ < ABSOLUTE_MAX_DEPTH) {
        const parent = byId.get(cur.parentId)
        if (!parent) break
        cur = parent
        depth++
      }
      if (depth > bestDepth) { bestDepth = depth; bestId = p.id }
    }
    return { id: bestId, depth: bestDepth }
  }, [places])

  function patch(change: Partial<AppSettings>) {
    setDraft(d => d && { ...d, ...change })
    setSaved(false)
    setError('')
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      const result = await api.appSettings.update(draft)
      setDraft(result.settings)
      setOverCap(result.placesOverNewDepthCap)
      setSaved(true)
    } catch {
      setError('Could not save. Check the values and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
  if (!draft) return <div className="p-6 text-red-500 text-sm">Could not load settings.</div>

  const depthValid = draft.storageMaxDepth >= 1 && draft.storageMaxDepth <= ABSOLUTE_MAX_DEPTH
  const segmentsValid = draft.pathShorteningSegments >= 1

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>

      {/* Storage */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Storage</h2>
        <div className={`${card} px-4 py-3 space-y-2`}>
          <label className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">Maximum nesting depth</span>
            <input
              type="number" min={1} max={ABSOLUTE_MAX_DEPTH} value={draft.storageMaxDepth}
              onChange={e => patch({ storageMaxDepth: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
              className="field w-20 text-sm py-1.5 text-center"
            />
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            How deep places may nest, e.g. House › Floor › Room › Cabinet › Box is 5. Between 1
            and {ABSOLUTE_MAX_DEPTH}.
          </p>
          {!depthValid && (
            <p className="text-xs text-red-500">Must be between 1 and {ABSOLUTE_MAX_DEPTH}.</p>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Lowering this keeps existing places as they are — it only limits new ones and moves.
          </p>
        </div>
      </section>

      {/* Location display */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Location display</h2>
        <div className={`${card} px-4 py-3 space-y-3`}>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            How a place is shown in lists, on the dashboard and on equipment labels. A place&apos;s
            own label always shows its full path.
          </p>

          <div className="flex gap-2">
            {(['LastNSegments', 'Full'] as PathShorteningMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => patch({ pathShorteningMode: mode })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  draft.pathShorteningMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {mode === 'Full' ? 'Full path' : 'Shorten'}
              </button>
            ))}
          </div>

          {draft.pathShorteningMode === 'LastNSegments' && (
            <>
              <label className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">Levels to show</span>
                <input
                  type="number" min={1} max={ABSOLUTE_MAX_DEPTH} value={draft.pathShorteningSegments}
                  onChange={e => patch({ pathShorteningSegments: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })}
                  className="field w-20 text-sm py-1.5 text-center"
                />
              </label>
              {!segmentsValid && <p className="text-xs text-red-500">Must be at least 1.</p>}
            </>
          )}

          {deepest.id ? (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Preview — your deepest place ({deepest.depth} level{deepest.depth !== 1 ? 's' : ''})
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 line-through">{locationPath(deepest.id, places)}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{formatLocationPath(deepest.id, places, draft)}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Add some places in <Link href="/storage" className="text-blue-500 underline">Storage</Link> to preview this.
            </p>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving || !depthValid || !segmentsValid}
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {saved && overCap > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {overCap} place{overCap !== 1 ? 's' : ''} sit deeper than the new limit. They keep
            working; you just can&apos;t nest anything further inside them.
          </p>
        )}
      </section>

      {/* Value lists and other config living on their own pages */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Manage</h2>
        <div className="space-y-2">
          <SettingRow href="/settings/categories" icon="🏷️" title="Categories" sub="Asset, part and document categories" />
          <SettingRow href="/labels" icon="🖨️" title="Labels" sub="Print QR labels, choose sheet or roll format" />
          <SettingRow href="/storage" icon="🗄️" title="Storage places" sub="The rooms, shelves and boxes themselves" />
          <SettingRow href="/documents" icon="📄" title="Documents" sub="Classify and link scanned files" />
        </div>
      </section>
    </div>
  )
}
