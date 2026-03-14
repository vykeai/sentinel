import { describe, expect, it } from 'vitest'
import { categorizeWarning, formatWarningSummary, summarizeWarnings } from '../../cli/warnings.js'

describe('warning helpers', () => {
  it('categorises known warning types', () => {
    expect(categorizeWarning("strings.json: key 'common.ok' defined but not referenced by any feature schema")).toBe('unused-string')
    expect(categorizeWarning("model 'Workout' not referenced by any feature or endpoint schema")).toBe('unreferenced-model')
    expect(categorizeWarning("[mock] sentinel/fixtures/user/me.json: missing required field 'id' (User)")).toBe('mock-drift')
    expect(categorizeWarning('Generated file stale: apple/FitKind/Strings.swift')).toBe('generated-drift')
    expect(categorizeWarning('something else')).toBe('other')
  })

  it('deduplicates repeated warnings while preserving totals', () => {
    const summary = summarizeWarnings([
      "strings.json: key 'common.ok' defined but not referenced by any feature schema",
      "strings.json: key 'common.ok' defined but not referenced by any feature schema",
      "[mock] sentinel/fixtures/user/me.json: missing required field 'id' (User)",
    ])

    expect(summary.totalCount).toBe(3)
    expect(summary.uniqueCount).toBe(2)
    expect(summary.entries[0]).toMatchObject({
      message: "strings.json: key 'common.ok' defined but not referenced by any feature schema",
      count: 2,
      category: 'unused-string',
    })
    expect(summary.categories).toEqual([
      { key: 'unused-string', label: 'Unused strings', count: 2 },
      { key: 'mock-drift', label: 'Mock drift', count: 1 },
    ])
  })

  it('limits rendered examples and reports hidden warning count', () => {
    const lines = formatWarningSummary([
      "strings.json: key 'common.ok' defined but not referenced by any feature schema",
      "model 'Workout' not referenced by any feature or endpoint schema",
      "[mock] sentinel/fixtures/user/me.json: missing required field 'id' (User)",
    ], 2)

    expect(lines.join('\n')).toContain('Warnings (3 total, 3 unique):')
    expect(lines.join('\n')).toContain('Unused strings: 1')
    expect(lines.join('\n')).toContain('… 1 more unique warning(s) hidden')
  })
})
