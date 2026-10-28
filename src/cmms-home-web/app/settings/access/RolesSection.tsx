'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { AccessRole } from '@/lib/types'
import { card, errorMessage } from './shared'

/**
 * Add, rename and delete roles, and pick which one new accounts get.
 *
 * Every mutation goes straight to the server and then asks the page to refetch, because the
 * grid, the member counts and the "default for new users" choice all move together — a local
 * patch would leave the rights grid holding a column the server no longer has.
 */
export default function RolesSection({ roles, gridDirty, onChanged }: {
  roles: AccessRole[]
  /** True while the rights grid holds unsaved edits, which a refetch would discard. */
  gridDirty: boolean
  onChanged: () => Promise<void>
}) {
  const [newName, setNewName] = useState('')
  const [newDefault, setNewDefault] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Refusals shown against the role they concern, rather than as one page-level failure. */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  // Changing the roles forces the rights grid back to server truth, so warn once here rather
  // than letting a rename quietly eat a half-finished matrix.
  function keepingGridEdits() {
    if (!gridDirty) return true
    return confirm(
      'You have unsaved changes in the rights grid. Changing the roles reloads it and those changes will be lost. Continue?',
    )
  }

  function setRowError(id: string, message: string) {
    setRowErrors(prev => ({ ...prev, [id]: message }))
  }

  function clearRowError(id: string) {
    setRowErrors(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function add() {
    const name = newName.trim()
    if (!name) return
    if (!keepingGridEdits()) return
    setAdding(true)
    setAddError('')
    try {
      await api.roles.create({ name, isDefaultForNewUsers: newDefault })
      setNewName('')
      setNewDefault(false)
      await onChanged()
    } catch (e) {
      setAddError(errorMessage(e, 'Could not add that role.'))
    } finally {
      setAdding(false)
    }
  }

  async function rename(role: AccessRole) {
    const name = editName.trim()
    if (!name) return
    if (name === role.name) { setEditingId(null); return }
    if (!keepingGridEdits()) return
    setBusyId(role.id)
    clearRowError(role.id)
    try {
      await api.roles.update(role.id, { name, isDefaultForNewUsers: role.isDefaultForNewUsers })
      setEditingId(null)
      await onChanged()
    } catch (e) {
      setRowError(role.id, errorMessage(e, 'Could not rename that role.'))
    } finally {
      setBusyId(null)
    }
  }

  // The server clears the flag on every other role, so this behaves as one choice across the
  // list even though it is a PUT on a single role.
  async function setDefault(role: AccessRole, isDefault: boolean) {
    if (!keepingGridEdits()) return
    setBusyId(role.id)
    clearRowError(role.id)
    try {
      await api.roles.update(role.id, { name: role.name, isDefaultForNewUsers: isDefault })
      await onChanged()
    } catch (e) {
      setRowError(role.id, errorMessage(e, 'Could not change the default role.'))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(role: AccessRole) {
    if (!confirm(`Delete the role "${role.name}"? Anyone holding it loses those rights.`)) return
    if (!keepingGridEdits()) return
    setBusyId(role.id)
    clearRowError(role.id)
    try {
      await api.roles.delete(role.id)
      await onChanged()
    } catch (e) {
      // The server refuses while users still hold the role, and says how many — its wording is
      // more useful than anything we could substitute.
      setRowError(role.id, errorMessage(e, 'Could not delete that role.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Roles are the columns of the rights grid. Add one per kind of person in the household —
        rights are then given to the role, not to each account.
      </p>

      <div className={`${card} px-4 py-3 space-y-2`}>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="New role, e.g. Housemate"
            className="field flex-1"
          />
          <button
            onClick={add}
            disabled={adding || !newName.trim()}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {adding ? '…' : 'Add'}
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={newDefault}
            onChange={e => setNewDefault(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          Give this role to new accounts by default
        </label>
        {addError && <p className="text-xs text-red-500">{addError}</p>}
      </div>

      <ul className="space-y-2">
        {roles.map(role => (
          <li key={role.id} className={`${card} px-4 py-3 space-y-2`}>
            {editingId === role.id ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  autoFocus
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') rename(role)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="field flex-1"
                />
                <button
                  onClick={() => rename(role)}
                  disabled={!editName.trim() || busyId === role.id}
                  className="text-blue-600 dark:text-blue-400 font-semibold text-sm px-2 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-slate-400 dark:text-slate-500 text-sm px-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 dark:text-slate-100 font-medium truncate">
                    {role.name}
                    {role.isSystem && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        built-in
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {role.isAnonymous
                      ? 'Everyone who is not signed in, on everything'
                      : role.isLabelScan
                        ? 'Added by a scanned label, for that item or place only'
                        : role.memberCount === 0
                        ? 'No members'
                        : `${role.memberCount} member${role.memberCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  onClick={() => { setEditingId(role.id); setEditName(role.name) }}
                  className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
                  aria-label={`Rename ${role.name}`}
                >
                  ✏️
                </button>
                {role.isSystem ? (
                  // No delete control at all rather than a dead one: the reason sits below.
                  <span className="text-lg leading-none opacity-30" aria-hidden="true" title="Built-in roles cannot be deleted">
                    🔒
                  </span>
                ) : (
                  <button
                    onClick={() => remove(role)}
                    disabled={busyId === role.id}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none disabled:opacity-40"
                    aria-label={`Delete ${role.name}`}
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}

            {/*
              Only offered for custom roles: the server ignores the flag on built-ins, since it
              would be meaningless for Anonymous and dangerous for Admin.
            */}
            {!role.isSystem && (
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="default-role"
                    checked={role.isDefaultForNewUsers}
                    disabled={busyId === role.id}
                    onChange={() => setDefault(role, true)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  Default for new accounts
                </label>
                {/* A radio cannot be unpicked by clicking it again, so offer the way back out. */}
                {role.isDefaultForNewUsers && (
                  <button
                    onClick={() => setDefault(role, false)}
                    disabled={busyId === role.id}
                    className="text-slate-400 dark:text-slate-500 underline disabled:opacity-40"
                  >
                    clear
                  </button>
                )}
              </div>
            )}

            {role.isSystem && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Built into the app and cannot be deleted
                {role.isAnonymous
                  ? ' — it is the not-signed-in subject, so it has no members.'
                  : role.isLabelScan
                    ? ' — it applies to whoever holds a scanned label, so it has no members.'
                    : ' — it is the way back in. It can be renamed, and its rights edited apart from the locked ones.'}
              </p>
            )}

            {rowErrors[role.id] && <p className="text-xs text-red-500">{rowErrors[role.id]}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
