'use client'

import { useParams } from 'next/navigation'
import LogEventForm from '@/components/LogEventForm'

export default function LogMaintenancePage() {
  const { id } = useParams<{ id: string }>()
  return <LogEventForm target={{ kind: 'equipment', id }} />
}
