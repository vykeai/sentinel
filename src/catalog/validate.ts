// ─── Catalog Validate ───────────────────────────────────────────────────────
// Checks that every expected screenshot file exists in the catalog output dir.

import fs from 'fs'
import path from 'path'
import type { CatalogConfig, ExpectedShot } from './types.js'
import { buildExpectedShots } from './expected.js'

export interface ValidationResult {
  expected: number
  present: number
  missing: ExpectedShot[]
  passed: boolean
}

export function validateCatalog(config: CatalogConfig, projectRoot: string): ValidationResult {
  const outputDir = path.resolve(projectRoot, config.output)
  const shots = buildExpectedShots(config)
  const missing: ExpectedShot[] = []

  for (const shot of shots) {
    const filePath = path.join(outputDir, shot.filename)
    if (!fs.existsSync(filePath)) missing.push(shot)
  }

  return {
    expected: shots.length,
    present: shots.length - missing.length,
    missing,
    passed: missing.length === 0,
  }
}
