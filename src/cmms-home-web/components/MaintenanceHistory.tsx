import Link from 'next/link'
import { EVENT_TYPE_COLOR, eventHref } from '@/lib/maintenance'
import type { MaintenanceEvent, MaintenanceTarget } from '@/lib/types'

const card = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The "History" section for an item or a place: its own logged events, newest first. */
export default function MaintenanceHistory({ target, events }: { target: MaintenanceTarget; events: MaintenanceEvent[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">History ({events.length})</h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No events yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={eventHref(e.id, target)} className={`flex items-start gap-3 ${card} px-4 py-3`}>
                <span className={`mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${EVENT_TYPE_COLOR[e.type] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{e.type}</span>
                <div className="flex-1 min-w-0">
                  {e.note && <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{e.note}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.createdAt)}</p>
                </div>
                <span className="text-slate-300 dark:text-slate-600 text-lg self-center">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
