import type {
  Category, Equipment, MaintenanceEvent, MaintenanceRule, Part, PartCategory, PartUsage, StorageLocation,
  StorageLocationContents, Document, DocumentCategory, ClassifyDocumentDto,
  CreateEquipmentDto, CreateEventDto, CreateRuleDto, UpdateRuleDto, UpdateEventDto,
  AppSettings, SaveAppSettingsResult, ExternalLink,
  Me, User, SaveUserDto, AccessGrid, AuthSession, MaintenanceTarget,
} from './types'
import { targetFields, targetQuery } from './maintenance'

const API_BASE = '/api'

/**
 * A failed API call, carrying enough to react to rather than just report.
 *
 * The old opaque `Error('API error 403')` was fine while every call either worked or was a
 * bug. With permissions it no longer is: 401 means offer a sign-in, 403 means this user
 * genuinely may not, 503 + setupRequired means send them to first-run setup — and a page
 * that cannot tell them apart has to treat "not allowed" as "broken".
 */
export class ApiError extends Error {
  readonly status: number
  readonly detail?: string
  /** The permission the server wanted, when it said so. */
  readonly permission?: string
  readonly setupRequired: boolean
  /** True when refused because the caller only proved they hold a printed label. */
  readonly labelScoped: boolean
  readonly errors?: Record<string, string[]>

  constructor(status: number, body: unknown) {
    const problem = (body ?? {}) as {
      title?: string
      detail?: string
      permission?: string
      setupRequired?: boolean
      labelScoped?: boolean
      errors?: Record<string, string[]>
    }

    super(problem.detail || problem.title || `API error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = problem.detail
    this.permission = problem.permission
    this.setupRequired = problem.setupRequired === true
    this.labelScoped = problem.labelScoped === true
    this.errors = problem.errors
  }

  get isUnauthenticated() { return this.status === 401 }
  get isForbidden() { return this.status === 403 }
  /** Either flavour of "the server refused on permission grounds", for hiding UI. */
  get isDenied() { return this.status === 401 || this.status === 403 }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    // Explicit rather than relying on the default: these are same-origin calls to the /api
    // proxy, and the session cookie riding along is load-bearing now, not incidental.
    credentials: 'same-origin',
    ...options,
  })

  if (!res.ok) {
    // Denials and validation failures carry a ProblemDetails body worth keeping; anything
    // else may not be JSON at all, so failing to parse must not mask the real status.
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  equipment: {
    list: (opts?: { kind?: 'asset' | 'tool'; locationId?: string; onLoan?: boolean; maintained?: boolean }) => {
      const params = new URLSearchParams()
      if (opts?.kind) params.set('kind', opts.kind)
      if (opts?.locationId) params.set('location_id', opts.locationId)
      if (opts?.onLoan) params.set('on_loan', 'true')
      if (opts?.maintained) params.set('maintained', 'true')
      const qs = params.size ? `?${params}` : ''
      return request<Equipment[]>(`/equipment${qs}`)
    },
    get: (id: string) => request<Equipment>(`/equipment/${id}`),
    create: (dto: CreateEquipmentDto) =>
      request<Equipment>('/equipment', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: CreateEquipmentDto) =>
      request<Equipment>(`/equipment/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/equipment/${id}`, { method: 'DELETE' }),
    checkout: (id: string, borrower: string) =>
      request<Equipment>(`/equipment/${id}/checkout`, { method: 'POST', body: JSON.stringify({ borrower }) }),
    return: (id: string) =>
      request<Equipment>(`/equipment/${id}/return`, { method: 'POST' }),
  },
  events: {
    list: (target?: MaintenanceTarget) =>
      request<MaintenanceEvent[]>(`/events${targetQuery(target)}`),
    get: (id: string) => request<MaintenanceEvent>(`/events/${id}`),
    create: (dto: CreateEventDto) =>
      request<MaintenanceEvent>('/events', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: UpdateEventDto) =>
      request<MaintenanceEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  },
  rules: {
    list: (target?: MaintenanceTarget) =>
      request<MaintenanceRule[]>(`/rules${targetQuery(target)}`),
    create: (dto: CreateRuleDto) =>
      request<MaintenanceRule>('/rules', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: UpdateRuleDto) =>
      request<MaintenanceRule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/rules/${id}`, { method: 'DELETE' }),
  },
  storageLocations: {
    list: (opts?: { parentId?: string; q?: string }) => {
      const params = new URLSearchParams()
      if (opts?.parentId) params.set('parent_id', opts.parentId)
      if (opts?.q) params.set('q', opts.q)
      const qs = params.size ? `?${params}` : ''
      return request<StorageLocation[]>(`/storage-locations${qs}`)
    },
    get: (id: string) => request<StorageLocation>(`/storage-locations/${id}`),
    contents: (id: string) => request<StorageLocationContents>(`/storage-locations/${id}/contents`),
    create: (name: string, parentId?: string, icon?: string) =>
      request<StorageLocation>('/storage-locations', { method: 'POST', body: JSON.stringify({ name, parentId, icon }) }),
    update: (id: string, name: string, parentId?: string, icon?: string) =>
      request<StorageLocation>(`/storage-locations/${id}`, { method: 'PUT', body: JSON.stringify({ name, parentId, icon }) }),
    delete: (id: string) =>
      request<void>(`/storage-locations/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: () => request<Category[]>('/categories'),
    create: (name: string) =>
      request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, name: string) =>
      request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<void>(`/categories/${id}`, { method: 'DELETE' }),
  },
  parts: {
    list: (opts?: { lowStock?: boolean; equipmentId?: string; locationId?: string }) => {
      const params = new URLSearchParams()
      if (opts?.lowStock) params.set('low_stock', 'true')
      if (opts?.equipmentId) params.set('equipment_id', opts.equipmentId)
      if (opts?.locationId) params.set('location_id', opts.locationId)
      const qs = params.size ? `?${params}` : ''
      return request<Part[]>(`/parts${qs}`)
    },
    get: (id: string) => request<Part>(`/parts/${id}`),
    create: (dto: {
      name: string; quantity: number; unit: string; minQuantity?: number
      equipmentIds?: string[]; partCategoryId?: string; storageLocationId?: string
    }) => request<Part>('/parts', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: {
      name: string; quantity: number; unit: string; minQuantity?: number
      equipmentIds?: string[]; partCategoryId?: string; storageLocationId?: string
    }) => request<Part>(`/parts/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/parts/${id}`, { method: 'DELETE' }),
  },
  partCategories: {
    list: () => request<PartCategory[]>('/part-categories'),
    create: (name: string) =>
      request<PartCategory>('/part-categories', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, name: string) =>
      request<PartCategory>(`/part-categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<void>(`/part-categories/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: (opts?: { status?: string; equipmentId?: string; eventId?: string; partId?: string }) => {
      const params = new URLSearchParams()
      if (opts?.status) params.set('status', opts.status)
      if (opts?.equipmentId) params.set('equipment_id', opts.equipmentId)
      if (opts?.eventId) params.set('event_id', opts.eventId)
      if (opts?.partId) params.set('part_id', opts.partId)
      const qs = params.size ? `?${params}` : ''
      return request<Document[]>(`/documents${qs}`)
    },
    get: (id: string) => request<Document>(`/documents/${id}`),
    classify: (id: string, dto: ClassifyDocumentDto) =>
      request<Document>(`/documents/${id}/classify`, { method: 'PUT', body: JSON.stringify(dto) }),
    ignore: (id: string) =>
      request<Document>(`/documents/${id}/ignore`, { method: 'POST' }),
    unclassify: (id: string) =>
      request<Document>(`/documents/${id}/unclassify`, { method: 'POST' }),
    remove: (id: string) =>
      request<void>(`/documents/${id}`, { method: 'DELETE' }),
    pruneMissing: () =>
      request<{ removed: number }>('/documents/prune-missing', { method: 'POST' }),
    scan: () =>
      request<{ discovered: number; updated: number; missing: number; total: number }>('/documents/scan', { method: 'POST' }),
    // Multipart upload — do NOT go through request() (which forces JSON); let the
    // browser set the multipart boundary by omitting Content-Type.
    upload: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/documents/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      return res.json() as Promise<Document>
    },
    contentUrl: (id: string) => `/api/documents/${id}/content`,
  },
  documentCategories: {
    list: () => request<DocumentCategory[]>('/document-categories'),
    create: (name: string, sensitive = false, color?: string) =>
      request<DocumentCategory>('/document-categories', { method: 'POST', body: JSON.stringify({ name, sensitive, color }) }),
    update: (id: string, name: string, sensitive: boolean, color?: string) =>
      request<DocumentCategory>(`/document-categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, sensitive, color }) }),
    delete: (id: string) =>
      request<void>(`/document-categories/${id}`, { method: 'DELETE' }),
  },
  partUsages: {
    list: (eventId: string) =>
      request<PartUsage[]>(`/part-usages?event_id=${eventId}`),
    create: (maintenanceEventId: string, partId: string, quantityUsed: number) =>
      request<PartUsage>('/part-usages', { method: 'POST', body: JSON.stringify({ maintenanceEventId, partId, quantityUsed }) }),
    delete: (id: string) =>
      request<void>(`/part-usages/${id}`, { method: 'DELETE' }),
  },
  externalLinks: {
    list: (opts: { equipmentId?: string; partId?: string }) => {
      const params = new URLSearchParams()
      if (opts.equipmentId) params.set('equipment_id', opts.equipmentId)
      if (opts.partId) params.set('part_id', opts.partId)
      return request<ExternalLink[]>(`/external-links?${params}`)
    },
    create: (dto: { url: string; label: string; equipmentId?: string; partId?: string }) =>
      request<ExternalLink>('/external-links', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: { url: string; label: string }) =>
      request<ExternalLink>(`/external-links/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/external-links/${id}`, { method: 'DELETE' }),
  },
  appSettings: {
    get: () => request<AppSettings>('/app-settings'),
    update: (dto: AppSettings) =>
      request<SaveAppSettingsResult>('/app-settings', { method: 'PUT', body: JSON.stringify(dto) }),
  },
  auth: {
    /** Who the server thinks we are. Never throws on "nobody" — that is a valid answer. */
    me: () => request<Me>('/auth/me'),
    login: (username: string, password: string) =>
      request<Me>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    /** First run only; creates the first administrator and signs them in. */
    setup: (dto: { username: string; password: string; displayName?: string }) =>
      request<Me>('/auth/setup', { method: 'POST', body: JSON.stringify(dto) }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
    /**
     * Trades a printed label's `?t=` token for a short-lived scope covering that one item
     * or place, so an anonymous scan can log maintenance without being able to browse
     * anything else.
     */
    labelSession: (target: MaintenanceTarget, token: string) =>
      request<{ equipmentId: string | null; storageLocationId: string | null; expiresInSeconds: number }>(
        '/auth/label-session', { method: 'POST', body: JSON.stringify({ ...targetFields(target), token }) }),
    /** equipmentId -> token, for embedding in QR codes when printing. */
    labelTokens: (equipmentId?: string) =>
      request<Record<string, string>>(
        `/auth/label-tokens${equipmentId ? `?equipment_id=${equipmentId}` : ''}`),
    /** placeId -> token, the same for place labels. */
    locationLabelTokens: (storageLocationId?: string) =>
      request<Record<string, string>>(
        `/auth/location-label-tokens${storageLocationId ? `?storage_location_id=${storageLocationId}` : ''}`),
    /** Invalidates every label already printed. */
    rotateLabelKey: () =>
      request<{ rotated: boolean; message: string }>('/auth/label-key/rotate', { method: 'POST' }),
    sessions: () => request<AuthSession[]>('/auth/sessions'),
    revokeSession: (id: string) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request<User[]>('/users'),
    get: (id: string) => request<User>(`/users/${id}`),
    create: (dto: SaveUserDto) =>
      request<User>('/users', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: SaveUserDto) =>
      request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  roles: {
    /** The whole grid in one call: catalogue, roles, and who is granted what. */
    get: () => request<AccessGrid>('/roles'),
    create: (dto: { name: string; isDefaultForNewUsers: boolean }) =>
      request<{ id: string; name: string }>('/roles', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: { name: string; isDefaultForNewUsers: boolean }) =>
      request<{ id: string; name: string }>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) => request<void>(`/roles/${id}`, { method: 'DELETE' }),
    /**
     * Saves the grid whole, as roleId -> granted permission keys. Deliberately not
     * per-cell: a half-applied permission matrix is a worse state than either version of it.
     */
    saveGrid: (grants: Record<string, string[]>) =>
      request<void>('/roles/permissions', { method: 'PUT', body: JSON.stringify({ grants }) }),
  },
}
