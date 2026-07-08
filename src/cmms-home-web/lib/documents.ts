// Preset palette for document-category colors (picker on the categories page).
export const CATEGORY_COLORS = [
  '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b',
]

// Badge style from a category's hex color: solid text + a translucent tint of the
// same hue (works in both light and dark without per-color variants).
export function categoryBadgeStyle(color?: string | null): React.CSSProperties {
  const c = color || '#64748b'
  return { color: c, backgroundColor: `${c}22` }
}
