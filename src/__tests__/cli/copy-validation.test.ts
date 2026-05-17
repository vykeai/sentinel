import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { candidatesFromDiff, validateCopy } from '../../cli/copy-validation.js'

describe('copy validation', () => {
  it('extracts changed user-facing strings from unified diffs with file and line references', () => {
    const diff = [
      'diff --git a/src/App.tsx b/src/App.tsx',
      '--- a/src/App.tsx',
      '+++ b/src/App.tsx',
      '@@ -10,0 +11,3 @@',
      '+const title = "Welcome back"',
      '+const placeholder = "TODO finish this"',
      '+const route = "/api/users"',
    ].join('\n')

    const candidates = candidatesFromDiff(diff)
    expect(candidates).toEqual([
      { file: 'src/App.tsx', line: 11, text: 'Welcome back' },
      { file: 'src/App.tsx', line: 12, text: 'TODO finish this' },
    ])

    const result = validateCopy({ diff, requestor: 'agent-runner' })
    expect(result).toMatchObject({
      schemaVersion: 'sentinel.copy-validation.v1',
      producer: 'sentinel',
      requestor: 'agent-runner',
      source: 'diff',
      verdict: 'failed',
      checkedCount: 2,
    })
    expect(result.findings).toEqual([
      expect.objectContaining({
        file: 'src/App.tsx',
        line: 11,
        ruleId: 'copy.ok',
        severity: 'pass',
      }),
      expect.objectContaining({
        file: 'src/App.tsx',
        line: 12,
        ruleId: 'copy.no-placeholder-text',
        severity: 'fail',
      }),
    ])
  })

  it('validates configured manifest strings without requiring a git diff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-copy-'))
    const manifest = join(dir, 'copy.json')
    writeFileSync(manifest, JSON.stringify({
      strings: [
        { file: 'src/Home.tsx', line: 7, text: 'Open settings' },
        { file: 'src/Home.tsx', line: 8, text: 'Click here!!' },
      ],
    }))

    const result = validateCopy({ manifest, requestor: 'qa-harness' })
    expect(result.source).toBe('manifest')
    expect(result.verdict).toBe('passed')
    expect(result.findings).toEqual([
      expect.objectContaining({ ruleId: 'copy.ok', severity: 'pass' }),
      expect.objectContaining({ ruleId: 'copy.no-repeated-punctuation', severity: 'warn' }),
      expect.objectContaining({ ruleId: 'copy.no-click-here', severity: 'warn' }),
    ])
  })
})
