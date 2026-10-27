'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import PasswordInput from '@/components/PasswordInput'
import type { AccessRole, SaveUserDto, User } from '@/lib/types'
import { card, errorMessage, fieldErrors, formatDate } from './shared'

interface Form {
  username: string
  password: string
  displayName: string
  isActive: boolean
  roleIds: string[]
}

function formFor(user?: User): Form {
  return {
    username: user?.username ?? '',
    password: '',
    displayName: user?.displayName ?? '',
    isActive: user?.isActive ?? true,
    roleIds: user?.roles.map(r => r.id) ?? [],
  }
}

/**
 * The accounts themselves: who exists, what roles they hold, and whether they can sign in.
 *
 * `roles` comes from the rights grid when the operator may manage roles. Someone with only
 * `users.manage` cannot read /roles, so the pickable roles are derived from the ones users
 * already hold — enough to move people between existing roles, which is all that permission
 * is meant to allow.
 */
export default function UsersSection({ roles }: { roles: AccessRole[] }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  /** `new` while creating, a user id while editing, null when just listing. */
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(formFor())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch(e => setLoadError(errorMessage(e, 'Could not load the accounts.')))
      .finally(() => setLoading(false))
  }, [])

  const roleOptions = useMemo(() => {
    if (roles.length > 0) return roles.map(r => ({ id: r.id, name: r.name }))
    const seen = new Map<string, string>()
    for (const u of users) for (const r of u.roles) seen.set(r.id, r.name)
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [roles, users])

  function startCreate() {
    setEditing('new')
    setForm(formFor())
    setSaveError(null)
  }

  function startEdit(user: User) {
    setEditing(user.id)
    setForm(formFor(user))
    setSaveError(null)
  }

  function patch(change: Partial<Form>) {
    setForm(f => ({ ...f, ...change }))
    setSaveError(null)
  }

  function toggleRole(id: string) {
    setForm(f => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter(r => r !== id) : [...f.roleIds, id],
    }))
    setSaveError(null)
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

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const dto: SaveUserDto = {
        username: form.username.trim(),
        displayName: form.displayName.trim() || undefined,
        isActive: form.isActive,
        roleIds: form.roleIds,
        // Omitted on edit means "leave the existing password alone"; required on create.
        ...(form.password ? { password: form.password } : {}),
      }

      if (editing === 'new') {
        const created = await api.users.create(dto)
        setUsers(prev => [...prev, created].sort((a, b) => a.username.localeCompare(b.username)))
      } else if (editing) {
        const updated = await api.users.update(editing, dto)
        setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)))
      }
      setEditing(null)
    } catch (e) {
      setSaveError(e)
    } finally {
      setSaving(false)
    }
  }

  // A full PUT with the password left out: deactivating is an edit like any other, and the
  // server drops their sessions as part of it.
  async function setActive(user: User, isActive: boolean) {
    const question = isActive
      ? `Let ${user.username} sign in again?`
      : `Deactivate ${user.username}? They are signed out immediately and cannot sign back in.`
    if (!confirm(question)) return
    setBusyId(user.id)
    clearRowError(user.id)
    try {
      const updated = await api.users.update(user.id, {
        username: user.username,
        displayName: user.displayName ?? undefined,
        isActive,
        roleIds: user.roles.map(r => r.id),
      })
      setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)))
    } catch (e) {
      // Includes the last-active-administrator refusal, which the server keys to roleIds.
      setRowError(user.id, errorMessage(e, 'Could not change that account.'))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(user: User) {
    if (!confirm(`Delete ${user.username}? Their logged maintenance history stays, but the account is gone.`)) return
    setBusyId(user.id)
    clearRowError(user.id)
    try {
      await api.users.delete(user.id)
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch (e) {
      setRowError(user.id, errorMessage(e, 'Could not delete that account.'))
    } finally {
      setBusyId(null)
    }
  }

  const usernameErrors = fieldErrors(saveError, 'username')
  const passwordErrors = fieldErrors(saveError, 'password')
  const roleErrors = fieldErrors(saveError, 'roleIds')
  const otherSaveError = saveError && usernameErrors.length + passwordErrors.length + roleErrors.length === 0
    ? errorMessage(saveError, 'Could not save that account.')
    : ''

  function editor(user?: User) {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={form.username}
          onChange={e => patch({ username: e.target.value })}
          placeholder="Username"
          autoComplete="off"
          className="field"
        />
        {usernameErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}

        <input
          type="text"
          value={form.displayName}
          onChange={e => patch({ displayName: e.target.value })}
          placeholder="Display name (optional)"
          className="field"
        />

        <PasswordInput
          value={form.password}
          onChange={e => patch({ password: e.target.value })}
          placeholder={user ? 'New password (leave blank to keep)' : 'Password'}
          autoComplete="new-password"
          className="field"
        />
        {passwordErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Roles</p>
          {roleOptions.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">No roles to choose from.</p>
          )}
          {roleOptions.map(r => (
            <label key={r.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.roleIds.includes(r.id)}
                onChange={() => toggleRole(r.id)}
                className="w-4 h-4 accent-blue-600"
              />
              {r.name}
            </label>
          ))}
          {roleErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}
        </div>

        {user && (
          <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => patch({ isActive: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            Can sign in
          </label>
        )}

        {otherSaveError && <p className="text-xs text-red-500">{otherSaveError}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !form.username.trim() || (!user && !form.password)}
            className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
          >
            {saving ? 'Saving…' : user ? 'Save Changes' : 'Create Account'}
          </button>
          <button
            onClick={() => { setEditing(null); setSaveError(null) }}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Accounts and the roles they hold. Rights come from the roles, so give someone a role rather
        than ticking permissions per person.
      </p>

      {editing === 'new' ? (
        <div className={`${card} px-4 py-3`}>{editor()}</div>
      ) : (
        <button
          onClick={startCreate}
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl"
        >
          + New Account
        </button>
      )}

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}
      {loadError && <p className="text-xs text-red-500">{loadError}</p>}
      {!loading && !loadError && users.length === 0 && (
        <p className="text-slate-400 dark:text-slate-500 text-sm py-2">No accounts yet.</p>
      )}

      <ul className="space-y-2">
        {users.map(user => (
          <li key={user.id} className={`${card} px-4 py-3 space-y-2`}>
            {editing === user.id ? (
              editor(user)
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 dark:text-slate-100 font-medium truncate">
                      {user.displayName || user.username}
                      {!user.isActive && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                          inactive
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {user.username} · last signed in {formatDate(user.lastLoginAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(user)}
                    className="text-slate-400 dark:text-slate-500 hover:text-blue-500 text-lg leading-none"
                    aria-label={`Edit ${user.username}`}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => remove(user)}
                    disabled={busyId === user.id}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-500 text-lg leading-none disabled:opacity-40"
                    aria-label={`Delete ${user.username}`}
                  >
                    🗑️
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {user.roles.length === 0 ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">No roles — can sign in but do nothing</span>
                  ) : (
                    user.roles.map(r => (
                      <span
                        key={r.id}
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                      >
                        {r.name}
                      </span>
                    ))
                  )}
                  <button
                    onClick={() => setActive(user, !user.isActive)}
                    disabled={busyId === user.id}
                    className="ml-auto text-xs font-medium text-slate-500 dark:text-slate-400 underline disabled:opacity-40"
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>

                {rowErrors[user.id] && <p className="text-xs text-red-500">{rowErrors[user.id]}</p>}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
