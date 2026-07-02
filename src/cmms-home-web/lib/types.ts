export type MaintenanceStatus = 'Ok' | 'Upcoming' | 'Due' | 'Overdue'
export type IntervalUnit = 'Days' | 'Weeks' | 'Months' | 'Years'
export type ScheduleType = 'Interval' | 'DueDate'
// Lens for the two list views (serialized PascalCase by the API's enum converter).
export type EquipmentKind = 'Asset' | 'Tool' | 'Both'

// Unified, self-referencing storage hierarchy (Room > Shelf > Box, any nesting).
export interface StorageLocation {
  id: string
  name: string
  icon?: string
  parentId?: string
}

export interface StorageLocationContents {
  location: StorageLocation
  ancestors: StorageLocation[]
  children: StorageLocation[]
  parts: Part[]
  equipment: Equipment[]
}

export interface Category {
  id: string
  name: string
}

export interface PartCategory {
  id: string
  name: string
}

export interface Part {
  id: string
  name: string
  quantity: number
  unit: string
  minQuantity?: number
  equipmentId?: string
  equipment?: Equipment
  partCategoryId?: string
  partCategory?: PartCategory
  storageLocationId?: string
  storageLocation?: StorageLocation
}

export interface PartUsage {
  id: string
  maintenanceEventId: string
  partId: string
  part: Part
  quantityUsed: number
}

export interface EquipmentLoan {
  id: string
  equipmentId: string
  borrower: string
  loanedAt: string
  returnedAt?: string
}

// A durable item (former Asset + Tool). Any item can be located, maintained, and lent.
export interface Equipment {
  id: string
  name: string
  kind: EquipmentKind
  categoryId?: string
  category?: Category
  storageLocationId?: string
  storageLocation?: StorageLocation
  imageUrl?: string
  notes?: string
  usedOnEquipmentId?: string
  usedOnEquipment?: Equipment
  createdAt: string
  loans?: EquipmentLoan[]
}

export interface MaintenanceEvent {
  id: string
  equipmentId: string
  type: string
  note?: string
  photoUrl?: string
  createdAt: string
}

export interface MaintenanceRule {
  id: string
  equipmentId: string
  name?: string
  scheduleType: ScheduleType
  intervalValue: number
  intervalUnit: IntervalUnit
  lastDoneAt?: string
  nextDueAt?: string
  dueWindowValue: number
  dueWindowUnit: IntervalUnit
  reminderLeadValue: number
  reminderLeadUnit: IntervalUnit
  status: MaintenanceStatus
}

export interface CreateEquipmentDto {
  name: string
  kind: EquipmentKind
  categoryId?: string
  storageLocationId?: string
  imageUrl?: string
  notes?: string
  usedOnEquipmentId?: string
}

export interface CreateEventDto {
  equipmentId: string
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
  equipmentId: string
  name?: string
  scheduleType: ScheduleType
  intervalValue: number
  intervalUnit: IntervalUnit
  lastDoneAt?: string
  nextDueAt?: string
  dueWindowValue: number
  dueWindowUnit: IntervalUnit
  reminderLeadValue: number
  reminderLeadUnit: IntervalUnit
}

export interface UpdateRuleDto {
  name?: string
  scheduleType?: ScheduleType
  intervalValue?: number
  intervalUnit?: IntervalUnit
  lastDoneAt?: string
  nextDueAt?: string
  dueWindowValue?: number
  dueWindowUnit?: IntervalUnit
  reminderLeadValue?: number
  reminderLeadUnit?: IntervalUnit
}
