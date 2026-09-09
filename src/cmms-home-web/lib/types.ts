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
  equipment?: Equipment[]   // assets this consumable is used on (many-to-many)
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
  /** When the item was bought — distinct from createdAt (when the row was added). */
  purchasedAt?: string
  warrantyMonths?: number
  /** Absolute override; wins over purchasedAt + warrantyMonths when set. */
  warrantyUntil?: string
  /** Computed server-side. Do NOT re-derive: the month arithmetic lives in Equipment.cs. */
  warrantyExpiresAt: string | null
  warrantyStatus: WarrantyStatus
  usedOn?: Equipment[]   // other equipment this (tool) is used on (many-to-many)
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
  /** Computed server-side alongside `status`. null = never done / no date set.
   *  Do NOT re-derive these from the interval fields: the schedule arithmetic lives in
   *  MaintenanceRule.cs, and a second copy here can disagree with `status`. */
  dueAt: string | null
  overdueAt: string | null
}

// A warranty is a fact with a deadline, not an obligation — hence its own vocabulary
// rather than reusing MaintenanceStatus. Unknown = nothing recorded.
export type WarrantyStatus = 'Unknown' | 'Active' | 'ExpiringSoon' | 'Expired'

export interface CreateEquipmentDto {
  name: string
  kind: EquipmentKind
  categoryId?: string
  storageLocationId?: string
  imageUrl?: string
  notes?: string
  usedOnEquipmentIds?: string[]
  purchasedAt?: string
  warrantyMonths?: number
  warrantyUntil?: string
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

export type DocumentStatus = 'Unclassified' | 'Classified' | 'Ignored' | 'Missing' | 'PendingMove'

// First-class, user-managed document category. `sensitive` will gate visibility
// for anonymous users once auth exists; `color` drives the badge.
export interface DocumentCategory {
  id: string
  name: string
  sensitive: boolean
  color?: string
}

// What a document is filed against — exactly one of the three is set. A part link is
// literal: it does not surface on the equipment that part is used on.
export interface DocumentLink {
  id: string
  documentId: string
  equipmentId: string | null
  maintenanceEventId: string | null
  partId: string | null
  linkedAt: string
}

export interface Document {
  id: string
  relativePath: string
  fileName: string
  contentType: string
  sizeBytes: number
  contentHash: string
  lastModifiedUtc: string
  discoveredAt: string
  status: DocumentStatus
  categoryId: string | null
  category: DocumentCategory | null
  title: string | null
  createdAt: string
  links: DocumentLink[]
}

export interface ClassifyDocumentDto {
  categoryId?: string
  title?: string
  links: { equipmentId?: string; maintenanceEventId?: string; partId?: string }[]
}

// A user-entered web link attached to one Equipment or one Part.
export interface ExternalLink {
  id: string
  url: string
  label: string
  equipmentId: string | null
  partId: string | null
  createdAt: string
}

// Server-side user settings (single row; no id in the API surface).
export type PathShorteningMode = 'Full' | 'LastNSegments'

export interface AppSettings {
  storageMaxDepth: number
  pathShorteningMode: PathShorteningMode
  pathShorteningSegments: number
}

export interface SaveAppSettingsResult {
  settings: AppSettings
  /** Places left deeper than a newly lowered cap — informational, not an error. */
  placesOverNewDepthCap: number
}
