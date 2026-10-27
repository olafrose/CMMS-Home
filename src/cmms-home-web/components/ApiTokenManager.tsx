'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { card, errorMessage, fieldErrors, formatDate } from '@/app/settings/access/shared'
import type { ApiToken, CreatedApiToken, MintApiTokenDto, PermissionInfo } from '@/lib/types'

/** The four calls this needs, so one component serves both /users/{id}/tokens and /auth/tokens. */
export interface ApiTokenClient {
  list: () => Promise<ApiToken[]>
  grantable: () => Promise<PermissionInfo[]>
  create: (dto: MintApiTokenDto) => Promise<CreatedApiToken>
  revoke: (id: string) => Promise<void>
}

/** Presets in days. Personal tokens must expire, so "never" is offered to service accounts only. */
const EXPIRY_PRESETS = [30, 90, 180, 365] as const
type Expiry = `${(typeof EXPIRY_PRESETS)[number]}` | 'never' | 'custom'

/**
 * Lists, mints and revokes API tokens for one account.
 *
 * `personal` switches on the rules for a person's own tokens: an expiry is mandatory and
 * defaults to 90 days. A service account's default is no expiry — an integration that
 * silently stops on a forgotten date is its own outage. The server enforces both; this only
 * shapes the form so it doesn't offer what will be refused.
 *
 * The scope checklist offers only what the account holds right now (`grantable`). It
 * starts empty on purpose: a token should carry what its script needs, not everything.
 */
export default function ApiTokenManager({
  client, personal, canCreate,
}: { client: ApiTokenClient; personal: boolean; canCreate: boolean }) {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const [grantable, setGrantable] = useState<PermissionInfo[] | null>(null)
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<Expiry>(personal ? '90' : 'never')
  const [customDate, setCustomDate] = useState('')
  const [scope, setScope] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState('')

  // The client object is rebuilt by the parent on every render; key the load on mount only.
  const clientRef = useRef(client)
  clientRef.current = client

  const load = useCallback(async () => {
    try {
      setTokens(await clientRef.current.list())
      setLoadError('')
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not load the tokens.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function startCreate() {
    setCreating(true)
    setCreated(null)
    setName('')
    setExpiry(personal ? '90' : 'never')
    setCustomDate('')
    setScope([])
    setSaveError(null)
    if (grantable === null) {
      try {
        setGrantable(await clientRef.current.grantable())
      } catch (e) {
        setSaveError(e)
        setGrantable([])
      }
    }
  }

  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionInfo[]>()
    for (const p of grantable ?? []) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p])
    return [...byGroup]
  }, [grantable])

  function toggle(keys: string[], on: boolean) {
    setScope(prev => on ? [...new Set([...prev, ...keys])] : prev.filter(k => !keys.includes(k)))
    setSaveError(null)
  }

  function expiresAt(): string | null {
    if (expiry === 'never') return null
    if (expiry === 'custom') {
      if (!customDate) return null
      // End of the chosen day, local time: "expires on the 3rd" should still work on the 3rd.
      const d = new Date(`${customDate}T23:59:59`)
      return d.toISOString()
    }
    return new Date(Date.now() + Number(expiry) * 86_400_000).toISOString()
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await clientRef.current.create({ name: name.trim(), expiresAt: expiresAt(), permissions: scope })
      setTokens(prev => [result.apiToken, ...prev])
      setCreated(result)
      setCreating(false)
    } catch (e) {
      setSaveError(e)
    } finally {
      setSaving(false)
    }
  }

  async function revoke(token: ApiToken) {
    if (!confirm(`Revoke "${token.name}"? Anything still using it stops working immediately.`)) return
    setBusyId(token.id)
    setRowError('')
    try {
      await clientRef.current.revoke(token.id)
      setTokens(prev => prev.filter(t => t.id !== token.id))
      if (created?.apiToken.id === token.id) setCreated(null)
    } catch (e) {
      setRowError(errorMessage(e, 'Could not revoke that token.'))
    } finally {
      setBusyId(null)
    }
  }

  const nameErrors = fieldErrors(saveError, 'name')
  const expiryErrors = fieldErrors(saveError, 'expiresAt')
  const scopeErrors = fieldErrors(saveError, 'permissions')
  const otherError = saveError && nameErrors.length + expiryErrors.length + scopeErrors.length === 0
    ? errorMessage(saveError, 'Could not create the token.')
    : ''
  const missingExpiry = personal && expiry === 'custom' && !customDate

  return (
    <div className="space-y-2">
      {created && <CreatedToken created={created} onDismiss={() => setCreated(null)} />}

      {creating ? (
        <div className={`${card} px-3 py-3 space-y-2`}>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setSaveError(null) }}
            placeholder="What is it for? (e.g. Home Assistant)"
            maxLength={100}
            className="field"
          />
          {nameErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}

          <div className="flex gap-2 items-center">
            <label className="text-sm text-slate-600 dark:text-slate-300 shrink-0" htmlFor="token-expiry">Expires</label>
            <select
              id="token-expiry"
              value={expiry}
              onChange={e => { setExpiry(e.target.value as Expiry); setSaveError(null) }}
              className="field"
            >
              {EXPIRY_PRESETS.map(d => <option key={d} value={String(d)}>in {d} days</option>)}
              <option value="custom">on a date…</option>
              {!personal && <option value="never">never</option>}
            </select>
          </div>
          {expiry === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => { setCustomDate(e.target.value); setSaveError(null) }}
              className="field"
            />
          )}
          {expiryErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}

          <div className="space-y-2">
            <div className="flex items-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Allowed to ({scope.length})
              </p>
              {grantable && grantable.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(grantable.map(p => p.key), scope.length < grantable.length)}
                  className="ml-auto text-xs text-blue-500"
                >
                  {scope.length < grantable.length ? 'Select all' : 'Clear'}
                </button>
              )}
            </div>
            {grantable === null && <p className="text-xs text-slate-400 dark:text-slate-500">Loading…</p>}
            {grantable?.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                This account holds no permissions, so a token for it could do nothing. Give it a role first.
              </p>
            )}
            {groups.map(([group, perms]) => (
              <fieldset key={group} className="space-y-1">
                <legend className="text-xs font-medium text-slate-500 dark:text-slate-400">{group}</legend>
                {perms.map(p => (
                  <label key={p.key} className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={scope.includes(p.key)}
                      onChange={e => toggle([p.key], e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-blue-600 shrink-0"
                    />
                    <span title={p.description}>{p.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            {scopeErrors.map(m => <p key={m} className="text-xs text-red-500">{m}</p>)}
          </div>

          {otherError && <p className="text-xs text-red-500">{otherError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving || !name.trim() || scope.length === 0 || missingExpiry}
              className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Token'}
            </button>
            <button
              onClick={() => { setCreating(false); setSaveError(null) }}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : canCreate && (
        <button
          onClick={startCreate}
          className="w-full text-sm font-medium py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          + New API Token
        </button>
      )}

      {loading && <p className="text-slate-500 dark:text-slate-400 text-sm">Loading…</p>}
      {loadError && <p className="text-xs text-red-500">{loadError}</p>}
      {!loading && !loadError && tokens.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">No API tokens.</p>
      )}
      {rowError && <p className="text-xs text-red-500">{rowError}</p>}

      <ul className="space-y-1.5">
        {tokens.map(t => (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 dark:text-slate-100 font-medium truncate">
                {t.name} <span className="font-mono text-xs text-slate-400 dark:text-slate-500">…{t.hint}</span>
                {t.expired && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                    expired
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t.permissions.length} permission{t.permissions.length === 1 ? '' : 's'}
                {' · '}{t.expiresAt ? `${t.expired ? 'expired' : 'expires'} ${formatDate(t.expiresAt)}` : 'never expires'}
                {' · '}last used {formatDate(t.lastUsedAt)}
              </p>
            </div>
            <button
              onClick={() => revoke(t)}
              disabled={busyId === t.id}
              className="text-xs font-medium text-red-500 underline disabled:opacity-40 shrink-0"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The plaintext, once. Nothing can show it again, so the copy button is the point. */
function CreatedToken({ created, onDismiss }: { created: CreatedApiToken; onDismiss: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.token)
    } catch {
      // The async clipboard API needs a secure context, and the NAS is normally reached over
      // plain HTTP on the LAN. Fall back to selecting the text and the legacy copy command.
      input.current?.select()
      document.execCommand('copy')
    }
    setCopied(true)
  }

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-3 space-y-2">
      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
        Token &ldquo;{created.apiToken.name}&rdquo; created. Copy it now — it will not be shown again.
      </p>
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={created.token}
          onFocus={e => e.target.select()}
          className="field font-mono text-xs"
          aria-label="API token"
        />
        <button
          onClick={copy}
          className="px-3 rounded-xl text-sm font-semibold bg-emerald-600 text-white shrink-0"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-emerald-700 dark:text-emerald-400 break-all">
        Send it as <code className="font-mono">Authorization: Bearer …</code> to{' '}
        <code className="font-mono">{typeof window === 'undefined' ? '' : window.location.origin}/api/…</code>
      </p>
      <button onClick={onDismiss} className="text-xs font-medium text-emerald-700 dark:text-emerald-400 underline">
        Done
      </button>
    </div>
  )
}
