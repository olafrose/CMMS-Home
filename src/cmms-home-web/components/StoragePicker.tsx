'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import EntityCombobox from './EntityCombobox'
import type { Location, Shelf, StorageBox } from '@/lib/types'

export interface StorageSelection {
  locationId: string
  shelfId: string
  boxId: string
}

interface Props {
  value: StorageSelection
  onChange: (next: StorageSelection) => void
}

export default function StoragePicker({ value, onChange }: Props) {
  const [locations, setLocations] = useState<Location[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [allBoxes, setAllBoxes] = useState<StorageBox[]>([])

  useEffect(() => {
    Promise.all([api.locations.list(), api.boxes.list()])
      .then(([locs, bxs]) => { setLocations(locs); setAllBoxes(bxs) })
  }, [])

  useEffect(() => {
    if (value.locationId) api.shelves.list(value.locationId).then(setShelves)
    else setShelves([])
  }, [value.locationId])

  const filteredBoxes = value.shelfId
    ? allBoxes.filter(b => b.shelfId === value.shelfId)
    : value.locationId
      ? allBoxes.filter(b => b.locationId === value.locationId || b.shelf?.locationId === value.locationId)
      : allBoxes

  function handleLocation(id: string | null) {
    onChange({ locationId: id ?? '', shelfId: '', boxId: '' })
  }

  function handleShelf(id: string | null) {
    onChange({ ...value, shelfId: id ?? '', boxId: '' })
  }

  function handleBox(id: string | null) {
    if (!id) { onChange({ ...value, boxId: '' }); return }
    const box = allBoxes.find(b => b.id === id)
    if (box) {
      onChange({
        locationId: box.shelf?.locationId ?? box.locationId ?? '',
        shelfId: box.shelfId ?? '',
        boxId: id,
      })
    } else {
      // freshly created box not yet in allBoxes — keep current shelf/location context
      onChange({ ...value, boxId: id })
    }
  }

  return (
    <fieldset className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 px-1">Storage location</legend>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location</label>
        <EntityCombobox
          items={locations}
          value={value.locationId || null}
          onChange={handleLocation}
          onCreate={async (name) => {
            const loc = await api.locations.create(name)
            setLocations(prev => [...prev, loc])
            return loc
          }}
          placeholder="Search or create…"
        />
      </div>

      {value.locationId && (
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Shelf (optional)</label>
          <EntityCombobox
            items={shelves}
            value={value.shelfId || null}
            onChange={handleShelf}
            onCreate={async (name) => {
              const shelf = await api.shelves.create(name, value.locationId)
              setShelves(prev => [...prev, shelf])
              return shelf
            }}
            placeholder="Search or create…"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Box (optional)</label>
        <EntityCombobox
          items={filteredBoxes}
          value={value.boxId || null}
          onChange={handleBox}
          onCreate={async (name) => {
            const box = await api.boxes.create(name, value.shelfId || undefined, value.locationId || undefined)
            setAllBoxes(prev => [...prev, box])
            return box
          }}
          placeholder="Search or create…"
        />
      </div>
    </fieldset>
  )
}
