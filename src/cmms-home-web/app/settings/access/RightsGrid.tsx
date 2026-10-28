'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { AccessGrid, AccessRole, PermissionInfo } from '@/lib/types'
import { card, errorMessage } from './shared'

/** Draft grants, role id -> granted permission keys. */
type Draft = Record<string, Set<string>>

function toDraft(roles: AccessRole[]): Draft {
  return Object.fromEntries(roles.map(r => [r.id, new Set(r.granted)]))
}

function sameGrants(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false
  for (const key of a) if (!b.has(key)) return false
  return true
}

/**
 * The Admin column. Anonymous and Label scan are system roles too, so `isSystem` alone is not
 * enough — the locked cells belong to the real administrator role only.
 */
function isAdminColumn(role: AccessRole) {
  return role.isSystem && !role.isAnonymous && !role.isLabelScan
}

/** Why a cell can't be ticked for this role, or null when it can. */
function notApplicableReason(role: AccessRole, p: PermissionInfo): string | null {
  if ((role.isAnonymous || role.isLabelScan) && !p.allowedForAnonymous)
    return `${p.label} needs an account, so it cannot apply to ${role.name}.`
  if (role.isLabelScan && !p.labelScopable)
    return `A scanned label covers one item, so it can't grant "${p.label}". Grant it to Anonymous to allow it for everyone.`
  return null
}

/**
 * The rights matrix: permissions down, roles across, a checkbox at each intersection.
 *
 * Edited as a draft and saved whole. Per-cell saving would let a network hiccup land half a
 * permission model, which is a worse state than either the old or the new one — and the API
 * only offers the whole-grid PUT for the same reason.
 */
export default function RightsGrid({ grid, onDirtyChange }: {
  grid: AccessGrid
  /** Lets the page know edits would be lost, so it can warn before reloading over them. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(grid.roles))
  const [baseline, setBaseline] = useState<Draft>(() => toDraft(grid.roles))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  /** Server messages keyed `grants.<roleId>`, shown against the column that caused them. */
  const [columnErrors, setColumnErrors] = useState<Record<string, string[]>>({})
  const [discarded, setDiscarded] = useState(false)

  // Sections in catalogue order, grouping consecutive runs rather than bucketing by name: the
  // catalogue's order is the intended reading order, and re-sorting scatters permissions that
  // belong together.
  const groups = useMemo(() => {
    const out: { name: string; permissions: PermissionInfo[] }[] = []
    for (const p of grid.permissions) {
      const last = out[out.length - 1]
      if (last && last.name === p.group) last.permissions.push(p)
      else out.push({ name: p.group, permissions: [p] })
    }
    return out
  }, [grid.permissions])

  const changedByRole = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const role of grid.roles) {
      out[role.id] = !sameGrants(draft[role.id] ?? new Set(), baseline[role.id] ?? new Set())
    }
    return out
  }, [grid.roles, draft, baseline])

  const dirty = Object.values(changedByRole).some(Boolean)

  // Mirrored into a ref so the reload effect below can tell whether it just threw work away
  // without taking `dirty` as a dependency, which would re-run it on every toggle.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // A refetch (a role was added, renamed or deleted) replaces the grid wholesale. Reset the
  // draft to server truth rather than rebasing edits onto columns that may no longer exist —
  // and say so, so unsaved toggles do not vanish silently.
  const seen = useRef(grid)
  useEffect(() => {
    if (seen.current === grid) return
    seen.current = grid
    setDiscarded(dirtyRef.current)
    setDraft(toDraft(grid.roles))
    setBaseline(toDraft(grid.roles))
    setColumnErrors({})
    setError('')
    setSaved(false)
  }, [grid])

  function toggle(roleId: string, key: string) {
    setDraft(d => {
      const next = new Set(d[roleId] ?? [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...d, [roleId]: next }
    })
    setSaved(false)
    setDiscarded(false)
  }

  function reset() {
    setDraft(toDraft(grid.roles))
    setBaseline(toDraft(grid.roles))
    setColumnErrors({})
    setError('')
    setSaved(false)
    setDiscarded(false)
  }

  async function save() {
    setSaving(true)
    setError('')
    setColumnErrors({})
    setDiscarded(false)
    try {
      const grants: Record<string, string[]> = {}
      for (const role of grid.roles) {
        const keys = new Set(draft[role.id] ?? [])
        // Admin's locked permissions are rendered checked and disabled, so they are in the
        // draft already — re-adding them means a stale draft can never be the reason the
        // server refuses the whole save.
        if (isAdminColumn(role)) {
          for (const p of grid.permissions) if (p.alwaysOnForAdmin) keys.add(p.key)
        }
        grants[role.id] = [...keys]
      }

      await api.roles.saveGrid(grants)
      const applied: Draft = Object.fromEntries(
        Object.entries(grants).map(([id, keys]) => [id, new Set(keys)]),
      )
      setBaseline(applied)
      setDraft(applied)
      setSaved(true)
    } catch (e) {
      if (e instanceof ApiError && e.errors) {
        const columns: Record<string, string[]> = {}
        for (const [key, messages] of Object.entries(e.errors)) {
          if (key.startsWith('grants.')) columns[key.slice('grants.'.length)] = messages
        }
        setColumnErrors(columns)
        // Anything not keyed to a column (an unknown permission, a role that has since been
        // deleted) still needs saying somewhere.
        const other = Object.entries(e.errors)
          .filter(([key]) => !key.startsWith('grants.'))
          .flatMap(([, messages]) => messages)
        setError(other.length > 0
          ? other.join(' ')
          : 'Nothing was saved — see the notes below.')
      } else {
        setError(errorMessage(e, 'Could not save the rights. Nothing was changed.'))
      }
    } finally {
      setSaving(false)
    }
  }

  const changedCount = Object.values(changedByRole).filter(Boolean).length

  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        What each role may do. Tap a permission&apos;s name to read what it covers.
      </p>

      {/*
        The card clips, the inner div scrolls: only the grid moves sideways, never the page.
        The first column is sticky so a permission's name stays put while the role columns
        scroll — two of them fit beside it at 360px, and admins can add more.
      */}
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          {/* w-full fills a wide screen; the per-column min widths are what force the scroll
              on a narrow one. border-separate is required for sticky cells to work at all. */}
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-white dark:bg-slate-800 min-w-[9.5rem] max-w-[16rem] px-3 py-2 text-left align-bottom border-b border-r border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Permission
                  </span>
                </th>
                {grid.roles.map(role => (
                  <th
                    key={role.id}
                    scope="col"
                    className={`min-w-[5.5rem] px-2 py-2 align-bottom text-center border-b border-slate-100 dark:border-slate-700 ${
                      columnErrors[role.id] ? 'bg-red-50 dark:bg-red-950/40' : ''
                    }`}
                  >
                    <span className={`block text-xs font-semibold leading-tight ${
                      columnErrors[role.id]
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {role.name}
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                      {role.isAnonymous
                        ? 'anyone, everywhere'
                        : role.isLabelScan
                          ? 'scanned item only'
                          : `${role.memberCount} member${role.memberCount === 1 ? '' : 's'}`}
                    </span>
                    {changedByRole[role.id] && (
                      <span className="block text-[10px] text-amber-600 dark:text-amber-400">edited</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {groups.map(group => (
                <Fragment key={group.name}>
                  {/*
                    The section band doubles as a repeated column header: the real <thead>
                    cannot be sticky vertically, because a horizontally scrolling container is
                    its own vertical scroll container and `top-0` would pin to it rather than to
                    the viewport. Repeating the names keeps the columns identifiable well down a
                    thirty-odd-row grid.
                  */}
                  <tr>
                    <th
                      scope="colgroup"
                      className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-left border-b border-r border-slate-100 dark:border-slate-700"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {group.name}
                      </span>
                    </th>
                    {grid.roles.map(role => (
                      <td
                        key={role.id}
                        aria-hidden="true"
                        className="bg-slate-50 dark:bg-slate-900 px-1 py-1.5 text-center border-b border-slate-100 dark:border-slate-700"
                      >
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          {role.name}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {group.permissions.map(p => (
                    <tr key={p.key}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-white dark:bg-slate-800 min-w-[9.5rem] max-w-[16rem] px-3 py-2 text-left align-top font-normal border-b border-r border-slate-100 dark:border-slate-700"
                      >
                        {/*
                          The description has to be readable on a phone, where there is no
                          hover: tapping the name reveals it. `title` stays for pointer users.
                        */}
                        <button
                          type="button"
                          onClick={() => setExpanded(cur => (cur === p.key ? null : p.key))}
                          title={p.description}
                          aria-expanded={expanded === p.key}
                          className="text-left w-full"
                        >
                          <span className="text-xs text-slate-700 dark:text-slate-200">{p.label}</span>
                          <span className="text-slate-300 dark:text-slate-600 text-[10px] align-super ml-0.5" aria-hidden="true">
                            ⓘ
                          </span>
                        </button>
                        {expanded === p.key && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{p.description}</p>
                            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{p.key}</p>
                          </div>
                        )}
                      </th>

                      {grid.roles.map(role => {
                        const notApplicable = notApplicableReason(role, p)
                        const locked = p.alwaysOnForAdmin && isAdminColumn(role)
                        const checked = draft[role.id]?.has(p.key) ?? false
                        const changed = checked !== (baseline[role.id]?.has(p.key) ?? false)

                        return (
                          <td
                            key={role.id}
                            // relative: the sr-only text inside is absolutely positioned, and
                            // without a positioned cell it escapes the grid's scroller and
                            // widens the whole page (the last column showed it first).
                            className={`relative px-2 py-2 text-center border-b border-slate-100 dark:border-slate-700 ${
                              changed ? 'bg-amber-50 dark:bg-amber-950/40' : ''
                            }`}
                          >
                            {notApplicable ? (
                              <span title={notApplicable}>
                                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">&mdash;</span>
                                <span className="sr-only">Not applicable: {notApplicable}</span>
                              </span>
                            ) : locked ? (
                              <span
                                className="inline-flex items-center gap-0.5"
                                title={`${role.name} always keeps "${p.label}". It is the way back in — if it could be switched off, nobody could administer the app.`}
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  disabled
                                  readOnly
                                  aria-label={`${p.label} for ${role.name} — always on`}
                                  className="w-4 h-4 accent-slate-400 dark:accent-slate-500 cursor-not-allowed"
                                />
                                <span aria-hidden="true" className="text-[10px] leading-none">🔒</span>
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(role.id, p.key)}
                                aria-label={`${p.label} for ${role.name}`}
                                className="w-4 h-4 accent-blue-600"
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-column refusals, spelled out under the grid where there is room for the words. */}
      {Object.entries(columnErrors).map(([roleId, messages]) => (
        <p key={roleId} className="text-xs text-red-500">
          <span className="font-semibold">{grid.roles.find(r => r.id === roleId)?.name ?? 'Unknown role'}:</span>{' '}
          {messages.join(' ')}
        </p>
      ))}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && <p className="text-xs text-green-600 dark:text-green-400">Rights saved.</p>}
      {discarded && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          The roles changed, so the grid was reloaded and your unsaved rights edits were discarded.
        </p>
      )}

      {/*
        Sticky above the bottom nav (4rem, matching the body's pb-16 in app/layout.tsx) so Save
        is in reach from anywhere in a long grid.
      */}
      <div className="sticky bottom-16 z-20 -mx-1 px-1 py-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Rights'}
          </button>
          <button
            onClick={reset}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50"
          >
            Discard
          </button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          {dirty
            ? `Unsaved changes to ${changedCount} role${changedCount === 1 ? '' : 's'}.`
            : 'No unsaved changes.'}
        </p>
      </div>

      <div className={`${card} px-4 py-3 space-y-2`}>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Anonymous</span> is not a
          person: it is whoever is using the app without signing in. It is what decides whether
          scanning a printed QR label can log maintenance without an account — leave it able to log
          events if the household should not need logins, clear it if every entry must be attributed.
        </p>
        {/* Two separate keys, not one sentence: run together, the em-dash entry reads as a
            continuation of the padlock entry rather than as its own legend item. */}
        <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <li>
            <span aria-hidden="true">🔒</span> a permission the administrator role can never give
            up — it is the way back in.
          </li>
          <li>
            <span aria-hidden="true">&mdash;</span> a permission that needs an account, so it
            cannot apply to Anonymous.
          </li>
        </ul>
      </div>
    </section>
  )
}
