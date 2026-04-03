import fs from 'fs'
import path from 'path'
import type { CatalogConfig, CatalogSurface } from './types.js'
import { legacyCatalogToSurfaces } from './adapter.js'

export const ATLAS_MANIFEST_VERSION = 'atlas.manifest/v1'
export const ATLAS_SESSION_INDEX_VERSION = 'atlas.session-index/v1'
export const SENTINEL_ATLAS_EXPORT_VERSION = 'sentinel.atlas-export/v1'
export const SENTINEL_ATLAS_MIGRATION_VERSION = 'sentinel.atlas-migrate/v1'

export interface AtlasManifestMetadata {
  manifestId: string
  productId: string
  productName: string
  platformFamily: string
  owner: string
  description: string
  revision: number
}

export interface AtlasManifestPath {
  id: string
  kind: string
  title: string
  segments: Array<{ kind: string; value: string; label?: string }>
}

export interface AtlasManifestScenario {
  id: string
  presetId: string
  scope: 'shared' | 'product-extension'
  title: string
  description?: string
}

export interface AtlasManifestTarget {
  id: string
  platform: string
  deviceClass: string
  deviceName: string
  viewport: { width: number; height: number }
  locale: string
  appearance: string
  orientation: string
  variant?: string
}

export interface AtlasManifestEntryStrategy {
  id: string
  kind: string
  title: string
}

export interface AtlasManifestSurface {
  id: string
  kind: string
  title: string
  pathId: string
  scenarioIds: string[]
  targetIds: string[]
  entryStrategyIds: string[]
  scenarioPresetIds?: string[]
  description?: string
}

export interface AtlasManifestFixture {
  schemaVersion: typeof ATLAS_MANIFEST_VERSION
  metadata: AtlasManifestMetadata
  paths: AtlasManifestPath[]
  scenarios: AtlasManifestScenario[]
  targets: AtlasManifestTarget[]
  entryStrategies: AtlasManifestEntryStrategy[]
  surfaces: AtlasManifestSurface[]
}

export type AtlasCaptureStatus = 'captured' | 'missing' | 'failed'

export interface AtlasSessionCaptureArtifact {
  pathId: string
  surfaceId: string
  scenarioId: string
  targetId: string
  entryStrategyId: string
  artifactKind: string
  fileName: string
  artifactPath: string
  capturedAt: string
  status: AtlasCaptureStatus
}

export interface AtlasSessionCaptureIndex {
  schemaVersion: typeof ATLAS_SESSION_INDEX_VERSION
  manifestPath: string
  captures: AtlasSessionCaptureArtifact[]
}

export interface SentinelAtlasExport {
  schemaVersion: typeof SENTINEL_ATLAS_EXPORT_VERSION
  source: 'sentinel.catalog'
  generatedAt: string
  legacy: {
    output: string
    resize?: number
    screens: number
  }
  preserved: string[]
  atlasOwned: string[]
  surfaces: CatalogSurface[]
}

export interface SentinelAtlasImportSummary {
  schemaVersion: 'sentinel.atlas-import-summary/v1'
  manifest: {
    manifestId: string
    productId: string
    surfaces: number
    scenarios: number
    targets: number
    entryStrategies: number
  }
  sessionIndex?: {
    captures: number
    captured: number
    missing: number
    failed: number
  }
  transformed: string[]
  preserved: string[]
  atlasOwned: string[]
}

export interface SentinelAtlasMigrationPlan {
  schemaVersion: typeof SENTINEL_ATLAS_MIGRATION_VERSION
  generatedAt: string
  legacyExport?: SentinelAtlasExport
  atlasImport?: SentinelAtlasImportSummary
  transformed: string[]
  preserved: string[]
  atlasOwned: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(value: unknown, label: string, source: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${source}: ${label} must be a non-empty string`)
  }
}

function assertArray(value: unknown, label: string, source: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${source}: ${label} must be an array`)
  }
}

function assertIdArray(value: unknown, label: string, source: string): asserts value is string[] {
  assertArray(value, label, source)
  for (const item of value) {
    assertString(item, `${label}[]`, source)
  }
}

function assertUniqueIds(items: unknown[], label: string, source: string): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (!isRecord(item)) throw new Error(`${source}: each ${label} entry must be an object`)
    assertString(item.id, `${label}.id`, source)
    if (ids.has(item.id)) throw new Error(`${source}: duplicate ${label} id ${item.id}`)
    ids.add(item.id)
  }
  return ids
}

function assertSafePathToken(value: string, label: string, source: string): void {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`${source}: ${label} must be a single safe path token without traversal`)
  }
}

export function readJsonFixture<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
}

export function buildQualifiedAtlasId(productId: string, localId: string): string {
  const normalizedProductId = productId.trim()
  const normalizedLocalId = localId.trim()
  if (!normalizedProductId) return normalizedLocalId
  if (normalizedLocalId.startsWith(`${normalizedProductId}:`)) return normalizedLocalId
  return `${normalizedProductId}:${normalizedLocalId}`
}

export function deriveAtlasArtifactKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''

  return normalized
    .split(':')
    .map((segment) =>
      segment
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '') || '_',
    )
    .join('__')
}

export function buildAtlasArtifactPath(
  productId: string,
  capture: Pick<
    AtlasSessionCaptureArtifact,
    'pathId' | 'surfaceId' | 'scenarioId' | 'targetId' | 'entryStrategyId' | 'artifactKind' | 'fileName'
  >,
): string {
  return [
    'artifacts',
    productId,
    deriveAtlasArtifactKey(capture.pathId),
    deriveAtlasArtifactKey(capture.surfaceId),
    deriveAtlasArtifactKey(capture.scenarioId),
    deriveAtlasArtifactKey(capture.targetId),
    deriveAtlasArtifactKey(capture.entryStrategyId),
    capture.artifactKind,
    capture.fileName,
  ].join('/')
}

export function validateAtlasManifestFixture(value: unknown, source = 'atlas manifest'): asserts value is AtlasManifestFixture {
  if (!isRecord(value)) throw new Error(`${source}: manifest must be an object`)
  if (value.schemaVersion !== ATLAS_MANIFEST_VERSION) {
    throw new Error(`${source}: schemaVersion must be ${ATLAS_MANIFEST_VERSION}`)
  }

  if (!isRecord(value.metadata)) throw new Error(`${source}: metadata must be an object`)
  assertString(value.metadata.manifestId, 'metadata.manifestId', source)
  assertString(value.metadata.productId, 'metadata.productId', source)

  assertArray(value.paths, 'paths', source)
  assertArray(value.scenarios, 'scenarios', source)
  assertArray(value.targets, 'targets', source)
  assertArray(value.entryStrategies, 'entryStrategies', source)
  assertArray(value.surfaces, 'surfaces', source)

  const pathIds = assertUniqueIds(value.paths, 'path', source)
  const scenarioIds = assertUniqueIds(value.scenarios, 'scenario', source)
  const targetIds = assertUniqueIds(value.targets, 'target', source)
  const entryStrategyIds = assertUniqueIds(value.entryStrategies, 'entryStrategy', source)
  assertUniqueIds(value.surfaces, 'surface', source)

  for (const surface of value.surfaces) {
    if (!isRecord(surface)) throw new Error(`${source}: each surface must be an object`)
    assertString(surface.pathId, 'surface.pathId', source)
    assertIdArray(surface.scenarioIds, 'surface.scenarioIds', source)
    assertIdArray(surface.targetIds, 'surface.targetIds', source)
    assertIdArray(surface.entryStrategyIds, 'surface.entryStrategyIds', source)
    if (surface.scenarioPresetIds !== undefined) {
      assertIdArray(surface.scenarioPresetIds, 'surface.scenarioPresetIds', source)
    }

    if (!pathIds.has(surface.pathId)) {
      throw new Error(`${source}: surface.pathId ${surface.pathId} does not reference a declared path`)
    }

    for (const scenarioId of surface.scenarioIds) {
      if (!scenarioIds.has(scenarioId)) {
        throw new Error(`${source}: surface.scenarioIds references unknown scenario ${scenarioId}`)
      }
    }

    for (const targetId of surface.targetIds) {
      if (!targetIds.has(targetId)) {
        throw new Error(`${source}: surface.targetIds references unknown target ${targetId}`)
      }
    }

    for (const entryStrategyId of surface.entryStrategyIds) {
      if (!entryStrategyIds.has(entryStrategyId)) {
        throw new Error(`${source}: surface.entryStrategyIds references unknown entry strategy ${entryStrategyId}`)
      }
    }
  }
}

export function validateAtlasSessionCaptureIndex(value: unknown, source = 'atlas session index'): asserts value is AtlasSessionCaptureIndex {
  if (!isRecord(value)) throw new Error(`${source}: session index must be an object`)
  if (value.schemaVersion !== ATLAS_SESSION_INDEX_VERSION) {
    throw new Error(`${source}: schemaVersion must be ${ATLAS_SESSION_INDEX_VERSION}`)
  }
  assertString(value.manifestPath, 'manifestPath', source)
  assertArray(value.captures, 'captures', source)

  for (const capture of value.captures) {
    if (!isRecord(capture)) throw new Error(`${source}: each capture must be an object`)
    assertString(capture.pathId, 'capture.pathId', source)
    assertString(capture.surfaceId, 'capture.surfaceId', source)
    assertString(capture.scenarioId, 'capture.scenarioId', source)
    assertString(capture.targetId, 'capture.targetId', source)
    assertString(capture.entryStrategyId, 'capture.entryStrategyId', source)
    assertString(capture.artifactKind, 'capture.artifactKind', source)
    assertString(capture.fileName, 'capture.fileName', source)
    assertString(capture.artifactPath, 'capture.artifactPath', source)
    assertString(capture.capturedAt, 'capture.capturedAt', source)
    assertString(capture.status, 'capture.status', source)
    if (!['captured', 'missing', 'failed'].includes(capture.status)) {
      throw new Error(`${source}: capture.status must be captured, missing, or failed`)
    }
    validateArtifactPath(capture as unknown as AtlasSessionCaptureArtifact, source)
  }
}

function validateArtifactPath(capture: AtlasSessionCaptureArtifact, source: string): void {
  assertSafePathToken(capture.fileName, 'capture.fileName', source)
  if (capture.artifactPath.includes('\\')) {
    throw new Error(`${source}: capture.artifactPath must use forward slashes`)
  }

  const parts = capture.artifactPath.split('/')
  if (parts.length !== 9 || parts[0] !== 'artifacts') {
    throw new Error(`${source}: capture.artifactPath must use artifacts/<productId>/<pathKey>/<surfaceKey>/<scenarioKey>/<targetKey>/<entryStrategyKey>/<artifactKind>/<fileName>`)
  }

  const [, productId, pathId, surfaceId, scenarioId, targetId, entryStrategyId, artifactKind, fileName] = parts
  assertSafePathToken(productId, 'capture.artifactPath productId segment', source)
  assertSafePathToken(pathId, 'capture.artifactPath pathId segment', source)
  assertSafePathToken(surfaceId, 'capture.artifactPath surfaceId segment', source)
  assertSafePathToken(scenarioId, 'capture.artifactPath scenarioId segment', source)
  assertSafePathToken(targetId, 'capture.artifactPath targetId segment', source)
  assertSafePathToken(entryStrategyId, 'capture.artifactPath entryStrategyId segment', source)
  assertSafePathToken(artifactKind, 'capture.artifactPath artifactKind segment', source)
  if (pathId !== deriveAtlasArtifactKey(capture.pathId)) {
    throw new Error(`${source}: capture.artifactPath pathId segment must equal derived storage key ${deriveAtlasArtifactKey(capture.pathId)} for capture.pathId ${capture.pathId}`)
  }
  if (surfaceId !== deriveAtlasArtifactKey(capture.surfaceId)) {
    throw new Error(`${source}: capture.artifactPath surfaceId segment must equal derived storage key ${deriveAtlasArtifactKey(capture.surfaceId)} for capture.surfaceId ${capture.surfaceId}`)
  }
  if (scenarioId !== deriveAtlasArtifactKey(capture.scenarioId)) {
    throw new Error(`${source}: capture.artifactPath scenarioId segment must equal derived storage key ${deriveAtlasArtifactKey(capture.scenarioId)} for capture.scenarioId ${capture.scenarioId}`)
  }
  if (targetId !== deriveAtlasArtifactKey(capture.targetId)) {
    throw new Error(`${source}: capture.artifactPath targetId segment must equal derived storage key ${deriveAtlasArtifactKey(capture.targetId)} for capture.targetId ${capture.targetId}`)
  }
  if (entryStrategyId !== deriveAtlasArtifactKey(capture.entryStrategyId)) {
    throw new Error(`${source}: capture.artifactPath entryStrategyId segment must equal derived storage key ${deriveAtlasArtifactKey(capture.entryStrategyId)} for capture.entryStrategyId ${capture.entryStrategyId}`)
  }
  if (artifactKind !== capture.artifactKind) throw new Error(`${source}: capture.artifactPath artifactKind does not match capture.artifactKind`)
  if (fileName !== capture.fileName) throw new Error(`${source}: capture.artifactPath fileName does not match capture.fileName`)
}

export function validateAtlasFixtureSet(
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
  source = 'atlas fixture set',
): void {
  const pathIds = new Set(manifest.paths.map((entry) => entry.id))
  const scenarioIds = new Set(manifest.scenarios.map((entry) => entry.id))
  const targetIds = new Set(manifest.targets.map((entry) => entry.id))
  const entryStrategyIds = new Set(manifest.entryStrategies.map((entry) => entry.id))
  const surfaceById = new Map(manifest.surfaces.map((surface) => [surface.id, surface]))

  for (const capture of sessionIndex.captures) {
    const surface = surfaceById.get(capture.surfaceId)
    if (!surface) {
      throw new Error(`${source}: capture.surfaceId ${capture.surfaceId} does not reference a declared surface`)
    }
    if (!pathIds.has(capture.pathId)) {
      throw new Error(`${source}: capture.pathId ${capture.pathId} does not reference a declared path`)
    }
    if (!scenarioIds.has(capture.scenarioId)) {
      throw new Error(`${source}: capture.scenarioId ${capture.scenarioId} does not reference a declared scenario`)
    }
    if (!targetIds.has(capture.targetId)) {
      throw new Error(`${source}: capture.targetId ${capture.targetId} does not reference a declared target`)
    }
    if (!entryStrategyIds.has(capture.entryStrategyId)) {
      throw new Error(`${source}: capture.entryStrategyId ${capture.entryStrategyId} does not reference a declared entry strategy`)
    }
    if (surface.pathId !== capture.pathId) {
      throw new Error(`${source}: capture.pathId ${capture.pathId} does not match surface.pathId ${surface.pathId}`)
    }
    if (!surface.scenarioIds.includes(capture.scenarioId)) {
      throw new Error(`${source}: capture.scenarioId ${capture.scenarioId} is not declared on surface ${surface.id}`)
    }
    if (!surface.targetIds.includes(capture.targetId)) {
      throw new Error(`${source}: capture.targetId ${capture.targetId} is not declared on surface ${surface.id}`)
    }
    if (!surface.entryStrategyIds.includes(capture.entryStrategyId)) {
      throw new Error(`${source}: capture.entryStrategyId ${capture.entryStrategyId} is not declared on surface ${surface.id}`)
    }

    const [, productId] = capture.artifactPath.split('/')
    if (productId !== manifest.metadata.productId) {
      throw new Error(`${source}: capture.artifactPath productId ${productId} does not match manifest.metadata.productId ${manifest.metadata.productId}`)
    }
  }
}

export function buildLegacyAtlasExport(config: CatalogConfig): SentinelAtlasExport {
  return {
    schemaVersion: SENTINEL_ATLAS_EXPORT_VERSION,
    source: 'sentinel.catalog',
    generatedAt: new Date().toISOString(),
    legacy: {
      output: config.output,
      resize: config.resize,
      screens: config.screens.length,
    },
    preserved: [
      'legacy screen slug',
      'legacy screen name',
      'legacy Maestro flow path',
      'legacy scroll_steps',
    ],
    atlasOwned: [
      'path taxonomy',
      'scenario preset library',
      'target matrix',
      'entry strategy normalization',
      'artifact naming contract',
    ],
    surfaces: legacyCatalogToSurfaces(config),
  }
}

export function buildAtlasImportSummary(
  manifest: AtlasManifestFixture,
  sessionIndex?: AtlasSessionCaptureIndex,
): SentinelAtlasImportSummary {
  const captured = sessionIndex?.captures.filter((capture) => capture.status === 'captured').length ?? 0
  const missing = sessionIndex?.captures.filter((capture) => capture.status === 'missing').length ?? 0
  const failed = sessionIndex?.captures.filter((capture) => capture.status === 'failed').length ?? 0

  return {
    schemaVersion: 'sentinel.atlas-import-summary/v1',
    manifest: {
      manifestId: manifest.metadata.manifestId,
      productId: manifest.metadata.productId,
      surfaces: manifest.surfaces.length,
      scenarios: manifest.scenarios.length,
      targets: manifest.targets.length,
      entryStrategies: manifest.entryStrategies.length,
    },
    sessionIndex: sessionIndex ? {
      captures: sessionIndex.captures.length,
      captured,
      missing,
      failed,
    } : undefined,
    transformed: [
      'Atlas manifest references into Sentinel compatibility summaries and review indexes',
      'Atlas session artifact records into Sentinel dashboard inputs',
    ],
    preserved: [
      'Atlas local ids',
      'Atlas-derived fully-qualified ids where consumers need global uniqueness',
      'Atlas artifact paths as produced by Atlas',
    ],
    atlasOwned: [
      'manifest authoring',
      'capture orchestration',
      'artifact naming',
      'path and scenario semantics',
    ],
  }
}

export function buildAtlasMigrationPlan(
  config: CatalogConfig | undefined,
  manifest?: AtlasManifestFixture,
  sessionIndex?: AtlasSessionCaptureIndex,
): SentinelAtlasMigrationPlan {
  return {
    schemaVersion: SENTINEL_ATLAS_MIGRATION_VERSION,
    generatedAt: new Date().toISOString(),
    legacyExport: config ? buildLegacyAtlasExport(config) : undefined,
    atlasImport: manifest ? buildAtlasImportSummary(manifest, sessionIndex) : undefined,
    transformed: [
      'legacy flat screens into surface-based compatibility fixtures',
      'Atlas manifest references into Sentinel migration summaries',
      'Atlas session captures into validation-facing capture indexes',
    ],
    preserved: [
      'existing legacy catalog commands during migration',
      'existing screenshot files until products switch validation inputs',
      'surface/scenario/target ids provided by Atlas fixtures',
    ],
    atlasOwned: [
      'surface taxonomy',
      'scenario preset library',
      'capture session lifecycle',
      'artifact file naming and storage layout',
    ],
  }
}

export function writeJsonFile(filePath: string, value: unknown): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8')
  return filePath
}
