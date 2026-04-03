import { describe, expect, it } from 'vitest'
import {
  buildAtlasImportSummary,
  buildAtlasArtifactPath,
  buildAtlasMigrationPlan,
  buildQualifiedAtlasId,
  deriveAtlasArtifactKey,
  buildLegacyAtlasExport,
  readJsonFixture,
  validateAtlasFixtureSet,
  validateAtlasManifestFixture,
  validateAtlasSessionCaptureIndex,
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
} from '../../catalog/atlas-compat.js'

describe('atlas compatibility contracts', () => {
  it('derives qualified ids and filesystem-safe artifact keys from local Atlas ids', () => {
    expect(buildQualifiedAtlasId('fitkind', 'journey:list')).toBe('fitkind:journey:list')
    expect(buildQualifiedAtlasId('fitkind', 'fitkind:journey:list')).toBe('fitkind:journey:list')
    expect(deriveAtlasArtifactKey('main:journey:list')).toBe('main__journey__list')
    expect(deriveAtlasArtifactKey('ios:iphone15pro:light:en-gb')).toBe('ios__iphone15pro__light__en-gb')
    expect(buildAtlasArtifactPath('fitkind', {
      pathId: 'main:journey:list',
      surfaceId: 'journey:list',
      scenarioId: 'journey:list:default',
      targetId: 'ios:iphone15pro:light:en-gb',
      entryStrategyId: 'journey:list:deeplink',
      artifactKind: 'screenshot',
      fileName: 'frame-001.png',
    })).toBe(
      'artifacts/fitkind/main__journey__list/journey__list/journey__list__default/ios__iphone15pro__light__en-gb/journey__list__deeplink/screenshot/frame-001.png',
    )
  })

  it('exports legacy catalog screens as compatibility surfaces', () => {
    const exported = buildLegacyAtlasExport({
      output: 'catalog/',
      screens: [
        { slug: 'sign-in', flow: 'sentinel/flows/catalog/sign-in.yaml' },
        { slug: 'home' },
      ],
    })

    expect(exported.schemaVersion).toBe('sentinel.atlas-export/v1')
    expect(exported.surfaces.map((surface) => surface.id)).toEqual(['sign-in', 'home'])
  })

  it('validates Atlas manifest and session fixtures and builds an import summary', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>('examples/atlas/session-index.fitkind-mobile.v1.json')

    validateAtlasManifestFixture(manifest, 'manifest fixture')
    validateAtlasSessionCaptureIndex(sessionIndex, 'session fixture')
    validateAtlasFixtureSet(manifest, sessionIndex, 'fixture set')

    const summary = buildAtlasImportSummary(manifest, sessionIndex)
    expect(summary.manifest.surfaces).toBe(2)
    expect(summary.sessionIndex?.captured).toBe(2)
    expect(summary.sessionIndex?.missing).toBe(1)
  })

  it('rejects manifest surface references that do not exist', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const invalid = JSON.parse(JSON.stringify(manifest)) as AtlasManifestFixture
    invalid.surfaces[0].targetIds = ['ios:unknown:light:en-gb']

    expect(() => validateAtlasManifestFixture(invalid, 'invalid manifest')).toThrow(
      'invalid manifest: surface.targetIds references unknown target ios:unknown:light:en-gb',
    )
  })

  it('rejects unsafe artifact paths and manifest/session mismatches', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>('examples/atlas/session-index.fitkind-mobile.v1.json')

    const unsafe = JSON.parse(JSON.stringify(sessionIndex)) as AtlasSessionCaptureIndex
    unsafe.captures[0].artifactPath = 'artifacts/fitkind/main__journey__list/../outside/journey__list__default/ios__iphone15pro__light__en-gb/journey__list__deeplink/screenshot/frame-001.png'
    expect(() => validateAtlasSessionCaptureIndex(unsafe, 'unsafe session fixture')).toThrow(/unsafe session fixture: capture\.artifactPath/)

    const mismatched = JSON.parse(JSON.stringify(sessionIndex)) as AtlasSessionCaptureIndex
    mismatched.captures[0].targetId = 'ios:unknown:light:en-gb'
    mismatched.captures[0].artifactPath = mismatched.captures[0].artifactPath
      .replace('ios__iphone15pro__light__en-gb', 'ios__unknown__light__en-gb')
    validateAtlasSessionCaptureIndex(mismatched, 'mismatched session fixture')
    expect(() => validateAtlasFixtureSet(manifest, mismatched, 'mismatched fixture set')).toThrow(
      'mismatched fixture set: capture.targetId ios:unknown:light:en-gb does not reference a declared target',
    )
  })

  it('builds a migration plan that keeps legacy capture and Atlas handoff responsibilities explicit', () => {
    const manifest = readJsonFixture<AtlasManifestFixture>('examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>('examples/atlas/session-index.fitkind-mobile.v1.json')

    const plan = buildAtlasMigrationPlan({
      output: 'catalog/',
      screens: [{ slug: 'sign-in' }],
    }, manifest, sessionIndex)

    expect(plan.legacyExport?.surfaces.length).toBe(1)
    expect(plan.atlasImport?.manifest.manifestId).toBe('fitkind.mobile.catalog.v1')
    expect(plan.atlasOwned).toContain('capture session lifecycle')
  })
})
