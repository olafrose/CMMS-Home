import type {
  Asset, MaintenanceEvent, MaintenanceRule,
  CreateAssetDto, CreateEventDto, CreateRuleDto, UpdateRuleDto,
} from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

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
  },
}
