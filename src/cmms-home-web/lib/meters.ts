import type { MaintenanceRule } from './types'

/**
 * Formatting for meter values and usage schedules. Formatting only: every number shown here
 * (remainingValue, dueValue, dueAt) is computed by the server in MaintenanceRule.cs, and the
 * same rule as for dates applies — never re-derive them here.
 */

export function formatMeterValue(value: number, unit: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
}

/** "≈ 3 weeks" from now, for a forecast instant. Coarse on purpose: it is an estimate. */
export function approxUntil(iso: string): string {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000
  if (days < 1) return 'today'
  if (days < 14) return `≈ ${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`
  if (days < 60) return `≈ ${Math.round(days / 7)} weeks`
  if (days < 730) return `≈ ${Math.round(days / 30)} months`
  return `≈ ${Math.round(days / 365)} years`
}

/**
 * One line for a usage rule's position: "120 h left · ≈ 3 weeks", "20 h over", or
 * "Never done" before it has a baseline. Shared by the schedule section and the dashboard.
 */
export function usageProgress(rule: MaintenanceRule): string {
  const unit = rule.meter?.unit ?? ''
  if (rule.dueValue == null) return 'Never done'
  if (rule.remainingValue == null) return `Due at ${formatMeterValue(rule.dueValue, unit)} · no reading yet`

  const left = rule.remainingValue
  const position = left >= 0
    ? `${formatMeterValue(left, unit)} left`
    : `${formatMeterValue(-left, unit)} over`

  // The calendar ceiling can be what's driving it; say so rather than showing hours that
  // aren't the reason it's due.
  if (rule.dueReason === 'Time' && rule.dueAt) return `${position} · time limit ${new Date(rule.dueAt).toLocaleDateString()}`
  return left > 0 && rule.dueAt ? `${position} · ${approxUntil(rule.dueAt)}` : position
}
