import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAtlasComparisonUnits,
  buildAtlasParityPairs,
  buildExpectedAtlasArtifacts,
  validateAtlasCatalog,
} from '../../catalog/atlas-validation.js'
import {
  readJsonFixture,
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
} from '../../catalog/atlas-compat.js'

describe('atlas validation', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('builds expected Atlas artifacts from surfaces, scenarios, and targets', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const expected = buildExpectedAtlasArtifacts(manifest)

    expect(expected).toHaveLength(5)
    expect(expected.map((artifact) => artifact.key)).toEqual([
      'journey:list::journey:list:default::ios:iphone15pro:light:en-gb',
      'journey:list::journey:list:default::android:pixel8:light:en-gb',
      'journey:list::journey:list:empty-journey::ios:iphone15pro:light:en-gb',
      'journey:list::journey:list:empty-journey::android:pixel8:light:en-gb',
      'journey:empty-state::journey:list:empty-journey::ios:iphone15pro:light:en-gb',
    ])
  })

  it('classifies coverage drift, artifact mismatch, and parity units for Atlas captures', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-atlas-validate-'))
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>('examples/atlas/session-index.fitkind-mobile.v1.json')

    for (const capture of sessionIndex.captures.filter((entry) => entry.status === 'captured')) {
      const absolute = path.join(dir, capture.artifactPath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, '')
    }

    const result = validateAtlasCatalog(manifest, sessionIndex, dir)
    const units = buildAtlasComparisonUnits(manifest, sessionIndex, dir)
    const pairs = buildAtlasParityPairs(manifest, sessionIndex, dir)

    expect(result.expected).toBe(5)
    expect(result.present).toBe(2)
    expect(result.passed).toBe(false)
    expect(result.issues.map((issue) => issue.kind)).toEqual([
      'coverage-drift',
      'coverage-drift',
      'artifact-mismatch',
    ])
    expect(units.filter((unit) => unit.exists)).toHaveLength(2)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].name).toContain('Workouts list')
  })

  it('reports adapter misuse explicitly when session data violates the manifest', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>('examples/atlas/session-index.fitkind-mobile.v1.json')
    const invalid = JSON.parse(JSON.stringify(sessionIndex)) as AtlasSessionCaptureIndex
    invalid.captures[0].surfaceId = 'journey:unknown'
    invalid.captures[0].artifactPath = invalid.captures[0].artifactPath.replace(
      'journey__list',
      'journey__unknown',
    )

    const result = validateAtlasCatalog(manifest, invalid, process.cwd())
    expect(result.passed).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'adapter-misuse',
      }),
    ])
  })
})
