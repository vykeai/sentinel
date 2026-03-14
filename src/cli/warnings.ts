export interface WarningSummaryEntry {
  message: string
  count: number
  category: string
}

export interface WarningCategorySummary {
  key: string
  label: string
  count: number
}

export interface WarningSummary {
  totalCount: number
  uniqueCount: number
  entries: WarningSummaryEntry[]
  categories: WarningCategorySummary[]
}

const CATEGORY_LABELS: Record<string, string> = {
  'unused-string': 'Unused strings',
  'unreferenced-model': 'Unreferenced models',
  'mock-drift': 'Mock drift',
  'generated-drift': 'Generated drift',
  other: 'Other',
}

export function categorizeWarning(message: string): string {
  if (message.startsWith('strings.json: key ')) return 'unused-string'
  if (message.startsWith('model ') && message.includes('not referenced')) return 'unreferenced-model'
  if (message.startsWith('[mock')) return 'mock-drift'
  if (message.includes('Generated file stale') || message.includes('Schema hash mismatch')) return 'generated-drift'
  return 'other'
}

export function summarizeWarnings(warnings: string[]): WarningSummary {
  const counts = new Map<string, WarningSummaryEntry>()
  const categoryCounts = new Map<string, number>()

  for (const rawWarning of warnings) {
    const message = rawWarning.trim()
    const category = categorizeWarning(message)
    const existing = counts.get(message)

    if (existing) {
      existing.count += 1
    } else {
      counts.set(message, { message, count: 1, category })
    }

    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }

  const entries = [...counts.values()].sort((a, b) =>
    b.count - a.count || a.message.localeCompare(b.message),
  )

  const categories = [...categoryCounts.entries()]
    .map(([key, count]) => ({
      key,
      label: CATEGORY_LABELS[key] ?? CATEGORY_LABELS.other,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return {
    totalCount: warnings.length,
    uniqueCount: entries.length,
    entries,
    categories,
  }
}

export function formatWarningSummary(warnings: string[], maxEntries = 40): string[] {
  if (warnings.length === 0) return []

  const summary = summarizeWarnings(warnings)
  const lines = [``, `  Warnings (${summary.totalCount} total, ${summary.uniqueCount} unique):`]

  if (summary.categories.length > 0) {
    lines.push('    by category:')
    for (const category of summary.categories) {
      lines.push(`      ${category.label}: ${category.count}`)
    }
  }

  const visibleEntries = summary.entries.slice(0, Math.max(0, maxEntries))
  if (visibleEntries.length > 0) {
    lines.push('    examples:')
    for (const entry of visibleEntries) {
      const repeatSuffix = entry.count > 1 ? ` (${entry.count}x)` : ''
      lines.push(`      ⚠  ${entry.message}${repeatSuffix}`)
    }
  }

  const hiddenCount = summary.uniqueCount - visibleEntries.length
  if (hiddenCount > 0) {
    lines.push(`    … ${hiddenCount} more unique warning(s) hidden; rerun with --max-warnings ${summary.uniqueCount} to see all`)
  }

  return lines
}
