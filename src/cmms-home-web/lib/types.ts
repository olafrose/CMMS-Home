export type MaintenanceStatus = 'Ok' | 'Upcoming' | 'Due' | 'Overdue'
export type IntervalUnit = 'Days' | 'Weeks' | 'Months' | 'Years'

export interface Location {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
}

export interface Shelf {
  id: string
  name: string
  locationId: string
  location: Location
}

export interface StorageBox {
  id: string
  name: string
  shelfId?: string
  shelf?: Shelf
  locationId?: string
  location?: Location
}

export interface Part {
  id: string
  name: string
  quantity: number
  unit: string
  minQuantity?: number
  boxId?: string
  box?: StorageBox
  shelfId?: string
  shelf?: Shelf
  locationId?: string
  location?: Location
}

export interface PartUsage {
  id: string
  maintenanceEventId: string
  partId: string
  part: Part
  quantityUsed: number
}

export interface Asset {
  id: string
  name: string
  categoryId?: string
  category?: Category
  locationId?: string
  location?: Location
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
  categoryId?: string
  locationId?: string
  imageUrl?: string
}

export interface CreateEventDto {
  assetId: string
  type: string
  note?: string
  photoUrl?: string
  occurredAt?: string
}

export interface UpdateEventDto {
  type: string
  note?: string
  occurredAt?: string
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
