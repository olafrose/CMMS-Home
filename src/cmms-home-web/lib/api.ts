import type {
  Asset, Category, Location, MaintenanceEvent, MaintenanceRule, Part, PartUsage, Shelf, StorageBox,
  CreateAssetDto, CreateEventDto, CreateRuleDto, UpdateRuleDto,
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
  assets: {
    list: () => request<Asset[]>('/assets'),
    get: (id: string) => request<Asset>(`/assets/${id}`),
    create: (dto: CreateAssetDto) =>
      request<Asset>('/assets', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: CreateAssetDto) =>
      request<Asset>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/assets/${id}`, { method: 'DELETE' }),
  },
  events: {
    list: (assetId?: string) =>
      request<MaintenanceEvent[]>(`/events${assetId ? `?asset_id=${assetId}` : ''}`),
    get: (id: string) => request<MaintenanceEvent>(`/events/${id}`),
    create: (dto: CreateEventDto) =>
      request<MaintenanceEvent>('/events', { method: 'POST', body: JSON.stringify(dto) }),
  },
  rules: {
    list: (assetId?: string) =>
      request<MaintenanceRule[]>(`/rules${assetId ? `?asset_id=${assetId}` : ''}`),
    create: (dto: CreateRuleDto) =>
      request<MaintenanceRule>('/rules', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: UpdateRuleDto) =>
      request<MaintenanceRule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/rules/${id}`, { method: 'DELETE' }),
  },
  locations: {
    list: () => request<Location[]>('/locations'),
    create: (name: string) =>
      request<Location>('/locations', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, name: string) =>
      request<Location>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) =>
      request<void>(`/locations/${id}`, { method: 'DELETE' }),
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
  shelves: {
    list: (locationId?: string) =>
      request<Shelf[]>(`/shelves${locationId ? `?location_id=${locationId}` : ''}`),
    create: (name: string, locationId: string) =>
      request<Shelf>('/shelves', { method: 'POST', body: JSON.stringify({ name, locationId }) }),
    update: (id: string, name: string, locationId: string) =>
      request<Shelf>(`/shelves/${id}`, { method: 'PUT', body: JSON.stringify({ name, locationId }) }),
    delete: (id: string) =>
      request<void>(`/shelves/${id}`, { method: 'DELETE' }),
  },
  boxes: {
    list: (opts?: { shelfId?: string; locationId?: string }) => {
      const params = new URLSearchParams()
      if (opts?.shelfId) params.set('shelf_id', opts.shelfId)
      if (opts?.locationId) params.set('location_id', opts.locationId)
      const qs = params.size ? `?${params}` : ''
      return request<StorageBox[]>(`/boxes${qs}`)
    },
    create: (name: string, shelfId?: string, locationId?: string) =>
      request<StorageBox>('/boxes', { method: 'POST', body: JSON.stringify({ name, shelfId, locationId }) }),
    update: (id: string, name: string, shelfId?: string, locationId?: string) =>
      request<StorageBox>(`/boxes/${id}`, { method: 'PUT', body: JSON.stringify({ name, shelfId, locationId }) }),
    delete: (id: string) =>
      request<void>(`/boxes/${id}`, { method: 'DELETE' }),
  },
  parts: {
    list: (lowStock?: boolean) =>
      request<Part[]>(`/parts${lowStock ? '?low_stock=true' : ''}`),
    get: (id: string) => request<Part>(`/parts/${id}`),
    create: (dto: {
      name: string; quantity: number; unit: string; minQuantity?: number
      boxId?: string; shelfId?: string; locationId?: string
    }) => request<Part>('/parts', { method: 'POST', body: JSON.stringify(dto) }),
    update: (id: string, dto: {
      name: string; quantity: number; unit: string; minQuantity?: number
      boxId?: string; shelfId?: string; locationId?: string
    }) => request<Part>(`/parts/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
    delete: (id: string) =>
      request<void>(`/parts/${id}`, { method: 'DELETE' }),
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
