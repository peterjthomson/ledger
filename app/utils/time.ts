type DateLike = string | number | Date | null | undefined

function toDate(value: DateLike): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Format a timestamp as a compact relative time string.
 *
 * Examples: "just now", "12m ago", "3h ago", "yesterday", "6d ago", "2w ago", "4mo ago"
 */
export function formatRelativeTime(value: DateLike, now: Date = new Date()): string {
  const date = toDate(value)
  if (!date) return ''

  const diffMs = now.getTime() - date.getTime()
  if (diffMs <= 0) return 'just now'

  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return 'just now'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    const remainingMinutes = diffMinutes % 60
    if (remainingMinutes === 0) return `${diffHours}h ago`
    return `${diffHours}h ${remainingMinutes}m ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

/**
 * Format a timestamp into a stable, compact date string (e.g. "Jan 4, 26").
 */
export function formatShortDate(value: DateLike): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

