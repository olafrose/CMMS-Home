import type {
  Category, Equipment, MaintenanceEvent, MaintenanceRule, Part, PartCategory, PartUsage, StorageLocation,
  StorageLocationContents, Document, DocumentCategory, ClassifyDocumentDto,
  CreateEquipmentDto, CreateEventDto, CreateRuleDto, UpdateRuleDto, UpdateEventDto,
} from './types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
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
    list: (equipmentId?: string) =>
      request<MaintenanceEvent[]>(`/events${equipmentId ? `?equipment_id=${equipmentId}` : ''}`),
    get: (id: string) => request<MaintenanceEvent>(`/events/${id}`),
    create: (dto: CreateEventDto) =>
      request<MaintenanceEvent>('/events', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: UpdateEventDto) =>
      request<MaintenanceEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
  },
  rules: {
    list: (equipmentId?: string) =>
      request<MaintenanceRule[]>(`/rules${equipmentId ? `?equipment_id=${equipmentId}` : ''}`),
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
      equipmentId?: string; partCategoryId?: string; storageLocationId?: string
    }) => request<Part>('/parts', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: {
      name: string; quantity: number; unit: string; minQuantity?: number
      equipmentId?: string; partCategoryId?: string; storageLocationId?: string
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
    list: (opts?: { status?: string; equipmentId?: string; eventId?: string }) => {
      const params = new URLSearchParams()
      if (opts?.status) params.set('status', opts.status)
      if (opts?.equipmentId) params.set('equipment_id', opts.equipmentId)
      if (opts?.eventId) params.set('event_id', opts.eventId)
      const qs = params.size ? `?${params}` : ''
      return request<Document[]>(`/documents${qs}`)
    },
    get: (id: string) => request<Document>(`/documents/${id}`),
    classify: (id: string, dto: ClassifyDocumentDto) =>
      request<Document>(`/documents/${id}/classify`, { method: 'PUT', body: JSON.stringify(dto) }),
    ignore: (id: string) =>
      request<Document>(`/documents/${id}/ignore`, { method: 'POST' }),
    remove: (id: string) =>
      request<void>(`/documents/${id}`, { method: 'DELETE' }),
    pruneMissing: () =>
      request<{ removed: number }>('/documents/prune-missing', { method: 'POST' }),
    scan: () =>
      request<{ discovered: number; updated: number; missing: number; total: number }>('/documents/scan', { method: 'POST' }),
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
}
