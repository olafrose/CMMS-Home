export type MaintenanceStatus = 'Ok' | 'Upcoming' | 'Due' | 'Overdue'
export type IntervalUnit = 'Days' | 'Weeks' | 'Months' | 'Years'

export interface Asset {
  id: string
  name: string
  category?: string
  location?: string
  imageUrl?: string
  createdAt: string
}

export interface MaintenanceEvent {
  id: string
  assetId: string
  type: string
  note?: string
  photoUrl?: string
  createdAt: string
}

export interface MaintenanceRule {
  id: string
  assetId: string
  name?: string
  intervalValue: number
  intervalUnit: IntervalUnit
  lastDoneAt?: string
  status: MaintenanceStatus
}

export interface CreateAssetDto {
  name: string
  category?: string
  location?: string
  imageUrl?: string
}

export interface CreateEventDto {
  assetId: string
  type: string
  note?: string
  photoUrl?: string
}

export interface CreateRuleDto {
  assetId: string
  name?: string
  intervalValue: number
  intervalUnit: IntervalUnit
  lastDoneAt?: string
}

export interface UpdateRuleDto {
  name?: string
  intervalValue?: number
  intervalUnit?: IntervalUnit
  lastDoneAt?: string
}
