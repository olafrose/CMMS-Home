'use client'

import EntityCombobox from './EntityCombobox'
import type { Location } from '@/lib/types'

interface Props {
  locations: Location[]
  value: string | null
  onChange: (locationId: string | null) => void
  onCreateLocation: (name: string) => Promise<Location>
}

export default function LocationCombobox({ locations, value, onChange, onCreateLocation }: Props) {
  return (
    <EntityCombobox
      items={locations}
      value={value}
      onChange={onChange}
      onCreate={onCreateLocation}
      placeholder="e.g. Basement, Garage"
    />
  )
}
