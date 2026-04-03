import fs from 'fs'
import path from 'path'
import {
  type AtlasManifestFixture,
  type AtlasManifestReviewBinding,
  type AtlasSessionCaptureArtifact,
  type AtlasSessionCaptureIndex,
  validateAtlasFixtureSet,
  validateAtlasManifestFixture,
  validateAtlasSessionCaptureIndex,
} from './atlas-compat.js'

export type AtlasValidationIssueKind =
  | 'coverage-drift'
  | 'artifact-mismatch'
  | 'adapter-misuse'
  | 'review-metadata-missing'

export interface ExpectedAtlasArtifact {
  key: string
  pathId: string
  pathTitle: string
  surfaceId: string
  surfaceTitle: string
  scenarioId: string
  scenarioTitle: string
  targetId: string
  targetLabel: string
}

export interface AtlasComparisonUnit {
  name: string
  pathId: string
  surfaceId: string
  scenarioId: string
  targetId: string
  targetPlatform: string
  targetDeviceName: string
  artifactPath: string
  absolutePath: string
  exists: boolean
}

export interface AtlasParityPair {
  name: string
  scenarioKey: string
  left: AtlasComparisonUnit
  right: AtlasComparisonUnit
}

export interface AtlasValidationIssue {
  kind: AtlasValidationIssueKind
  key: string
  message: string
  fix?: string
}

export interface AtlasValidationResult {
  expected: number
  present: number
  passed: boolean
  issues: AtlasValidationIssue[]
  missing: ExpectedAtlasArtifact[]
  comparisonUnits: AtlasComparisonUnit[]
  parityPairs: AtlasParityPair[]
}

function buildLookupMaps(manifest: AtlasManifestFixture) {
  return {
    pathById: new Map(manifest.paths.map((entry) => [entry.id, entry])),
    scenarioById: new Map(manifest.scenarios.map((entry) => [entry.id, entry])),
    targetById: new Map(manifest.targets.map((entry) => [entry.id, entry])),
  }
}

function buildExpectedLabel(pathTitle: string, surfaceTitle: string, scenarioTitle: string, targetLabel: string): string {
  return `${pathTitle} › ${surfaceTitle} › ${scenarioTitle} › ${targetLabel}`
}

function buildArtifactLabel(
  manifest: AtlasManifestFixture,
  capture: AtlasSessionCaptureArtifact,
): string {
  const { pathById, scenarioById, targetById } = buildLookupMaps(manifest)
  const surface = manifest.surfaces.find((entry) => entry.id === capture.surfaceId)
  const pathEntry = pathById.get(capture.pathId)
  const scenario = scenarioById.get(capture.scenarioId)
  const target = targetById.get(capture.targetId)

  return buildExpectedLabel(
    pathEntry?.title ?? capture.pathId,
    surface?.title ?? capture.surfaceId,
    scenario?.title ?? capture.scenarioId,
    target?.deviceName ?? capture.targetId,
  )
}

function buildReviewBindingLabel(
  manifest: AtlasManifestFixture,
  binding: AtlasManifestReviewBinding,
): string {
  const { pathById, scenarioById } = buildLookupMaps(manifest)
  const surface = manifest.surfaces.find((entry) => entry.id === binding.surfaceId)
  const pathEntry = surface ? pathById.get(surface.pathId) : null
  const scenario = scenarioById.get(binding.scenarioId)

  return buildExpectedLabel(
    pathEntry?.title ?? surface?.pathId ?? binding.surfaceId,
    surface?.title ?? binding.surfaceId,
    scenario?.title ?? binding.scenarioId,
    'Brandie review context',
  )
}

function bindingHasReviewPayload(binding: AtlasManifestReviewBinding): boolean {
  return Boolean(binding.sourceScreenId || binding.voiceContext || binding.mascot || binding.illustration)
}

export function buildExpectedAtlasArtifacts(manifest: AtlasManifestFixture): ExpectedAtlasArtifact[] {
  validateAtlasManifestFixture(manifest, 'atlas manifest')
  const { pathById, scenarioById, targetById } = buildLookupMaps(manifest)

  return manifest.surfaces.flatMap((surface) => {
    const pathEntry = pathById.get(surface.pathId)
    return surface.scenarioIds.flatMap((scenarioId) => {
      const scenario = scenarioById.get(scenarioId)
      return surface.targetIds.map((targetId) => {
        const target = targetById.get(targetId)
        const targetLabel = target ? `${target.deviceName} (${target.platform})` : targetId
        return {
          key: `${surface.id}::${scenarioId}::${targetId}`,
          pathId: surface.pathId,
          pathTitle: pathEntry?.title ?? surface.pathId,
          surfaceId: surface.id,
          surfaceTitle: surface.title,
          scenarioId,
          scenarioTitle: scenario?.title ?? scenarioId,
          targetId,
          targetLabel,
        }
      })
    })
  })
}

export function buildAtlasComparisonUnits(
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
  projectRoot: string,
): AtlasComparisonUnit[] {
  validateAtlasManifestFixture(manifest, 'atlas manifest')
  validateAtlasSessionCaptureIndex(sessionIndex, 'atlas session index')
  validateAtlasFixtureSet(manifest, sessionIndex, 'atlas fixture set')
  const { pathById, scenarioById, targetById } = buildLookupMaps(manifest)

  return sessionIndex.captures
    .filter((capture) => capture.artifactKind === 'screenshot')
    .map((capture) => {
      const absolutePath = path.resolve(projectRoot, capture.artifactPath)
      const surface = manifest.surfaces.find((entry) => entry.id === capture.surfaceId)
      const pathEntry = pathById.get(capture.pathId)
      const scenario = scenarioById.get(capture.scenarioId)
      const target = targetById.get(capture.targetId)
      return {
        name: buildExpectedLabel(
          pathEntry?.title ?? capture.pathId,
          surface?.title ?? capture.surfaceId,
          scenario?.title ?? capture.scenarioId,
          target?.deviceName ?? capture.targetId,
        ),
        pathId: capture.pathId,
        surfaceId: capture.surfaceId,
        scenarioId: capture.scenarioId,
        targetId: capture.targetId,
        targetPlatform: target?.platform ?? 'unknown',
        targetDeviceName: target?.deviceName ?? capture.targetId,
        artifactPath: capture.artifactPath,
        absolutePath,
        exists: capture.status === 'captured' && fs.existsSync(absolutePath),
      }
    })
}

export function buildAtlasParityPairs(
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
  projectRoot: string,
): AtlasParityPair[] {
  const units = buildAtlasComparisonUnits(manifest, sessionIndex, projectRoot)
    .filter((unit) => unit.exists)
  const unitsByScenario = new Map<string, AtlasComparisonUnit[]>()

  for (const unit of units) {
    const scenarioKey = `${unit.surfaceId}::${unit.scenarioId}`
    const existing = unitsByScenario.get(scenarioKey) ?? []
    existing.push(unit)
    unitsByScenario.set(scenarioKey, existing)
  }

  const pairs: AtlasParityPair[] = []
  for (const [scenarioKey, scenarioUnits] of unitsByScenario.entries()) {
    for (let index = 0; index < scenarioUnits.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < scenarioUnits.length; otherIndex += 1) {
        const left = scenarioUnits[index]
        const right = scenarioUnits[otherIndex]
        pairs.push({
          name: `${left.name} parity`,
          scenarioKey,
          left,
          right,
        })
      }
    }
  }

  return pairs
}

export function validateAtlasCatalog(
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
  projectRoot: string,
): AtlasValidationResult {
  const issues: AtlasValidationIssue[] = []

  try {
    validateAtlasManifestFixture(manifest, 'atlas manifest')
    validateAtlasSessionCaptureIndex(sessionIndex, 'atlas session index')
    validateAtlasFixtureSet(manifest, sessionIndex, 'atlas fixture set')
  } catch (error) {
    return {
      expected: 0,
      present: 0,
      passed: false,
      missing: [],
      comparisonUnits: [],
      parityPairs: [],
      issues: [{
        kind: 'adapter-misuse',
        key: 'atlas-adapter-misuse',
        message: error instanceof Error ? error.message : String(error),
        fix: 'Repair the Atlas manifest/session fixture pair before asking Sentinel to validate review coverage',
      }],
    }
  }

  const expected = buildExpectedAtlasArtifacts(manifest)
  const comparisonUnits = buildAtlasComparisonUnits(manifest, sessionIndex, projectRoot)
  const parityPairs = buildAtlasParityPairs(manifest, sessionIndex, projectRoot)
  const capturesByKey = new Map<string, AtlasSessionCaptureArtifact[]>()

  for (const capture of sessionIndex.captures.filter((entry) => entry.artifactKind === 'screenshot')) {
    const key = `${capture.surfaceId}::${capture.scenarioId}::${capture.targetId}`
    const existing = capturesByKey.get(key) ?? []
    existing.push(capture)
    capturesByKey.set(key, existing)
  }

  const missing: ExpectedAtlasArtifact[] = []
  let present = 0

  for (const artifact of expected) {
    const captures = capturesByKey.get(artifact.key) ?? []
    if (captures.length === 0) {
      missing.push(artifact)
      issues.push({
        kind: 'coverage-drift',
        key: artifact.key,
        message: `${buildExpectedLabel(artifact.pathTitle, artifact.surfaceTitle, artifact.scenarioTitle, artifact.targetLabel)} is missing a screenshot capture record`,
        fix: 'Run the Atlas capture flow for this surface/scenario/target so the session index includes a screenshot record',
      })
      continue
    }

    const hasRenderableCapture = captures.some((capture) => {
      const absolutePath = path.resolve(projectRoot, capture.artifactPath)
      return capture.status === 'captured' && fs.existsSync(absolutePath)
    })

    if (hasRenderableCapture) {
      present += 1
      continue
    }

    const primary = captures[0]
    issues.push({
      kind: 'artifact-mismatch',
      key: artifact.key,
      message: `${buildArtifactLabel(manifest, primary)} has a screenshot record but no renderable artifact (${primary.status})`,
      fix: `Repair or regenerate ${primary.artifactPath} so the screenshot artifact exists on disk and matches the Atlas session index`,
    })
  }

  for (const binding of manifest.reviewContext?.bindings ?? []) {
    if (bindingHasReviewPayload(binding)) continue
    issues.push({
      kind: 'review-metadata-missing',
      key: `${binding.surfaceId}::${binding.scenarioId}::review-context`,
      message: `${buildReviewBindingLabel(manifest, binding)} is bound to Brandie source "${binding.sourceId}" but Atlas did not attach any review payload`,
      fix: 'Attach Brandie review payload in Atlas reviewContext.bindings[] (voiceContext, mascot, illustration, or sourceScreenId), or remove the binding until Atlas resolves that metadata honestly',
    })
  }

  return {
    expected: expected.length,
    present,
    passed: issues.length === 0,
    issues,
    missing,
    comparisonUnits,
    parityPairs,
  }
}
