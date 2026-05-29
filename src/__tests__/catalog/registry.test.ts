import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { scanRegistry } from '../../catalog/registry.js'

describe('scanRegistry', () => {
  it('ignores git worktrees when scanning the active project tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'sentinel-registry-'))
    try {
      mkdirSync(join(root, 'apple', 'FitKind', 'Features', 'Auth'), { recursive: true })
      mkdirSync(join(root, '.worktrees', 'stale-task', 'apple', 'FitKind', 'Features', 'Auth'), { recursive: true })
      writeFileSync(join(root, 'apple', 'FitKind', 'Features', 'Auth', 'WelcomeView.swift'), 'struct WelcomeView {}\n')
      writeFileSync(join(root, '.worktrees', 'stale-task', 'apple', 'FitKind', 'Features', 'Auth', 'GhostView.swift'), 'struct GhostView {}\n')

      const result = scanRegistry({
        output: 'catalog/',
        screens: [{ slug: 'welcome' }],
      }, root)

      expect(result.foundCount).toBe(1)
      expect(result.unregistered).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
