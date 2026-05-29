import type { ValidationIssue } from '../config/types.js'

export interface SentinelArtifactRef {
  kind: string
  path: string
  sha256: string | null
  exists: boolean
}

export interface SentinelProofContext {
  taskId?: string
  repo?: string
  commit?: string
  currentCommit?: string
  host?: string
}

export type GateKind =
  | 'schema'
  | 'contracts'
  | 'mock'
  | 'catalog'
  | 'flow'
  | 'visual'
  | 'chaos'
  | 'perf'
  | 'doctor'
  | 'quality'
  | 'copy'
  | 'onlytools'

export type GateFailureClass = 'gate-failed' | 'visual-invalid'

export interface GateFailure {
  class: GateFailureClass
  severity: string
  layer: string
  rule: string
  message: string
  file?: string
  fix?: string
}

export interface GateResult {
  schemaVersion: 'sentinel.gate-result.v1'
  producer: 'sentinel'
  proofKind: string
  proofy: {
    producer: 'sentinel'
    proofKind: string
    context: SentinelProofContext
    artifactRefs: SentinelArtifactRef[]
  }
  gate: {
    kind: GateKind
    command: string[]
    replayCommand: string
  }
  verdict: 'passed' | 'failed'
  failures: GateFailure[]
  artifactRefs: SentinelArtifactRef[]
  durationMs: number
  checkedCount: number
  generatedAt: string
}

export interface ValidationBundle {
  schemaVersion: 'sentinel.validation-bundle.v1'
  producer: 'sentinel'
  requestor: string | null
  generatedAt: string
  summary: {
    verdict: 'passed' | 'failed'
    gateCount: number
    failedGateCount: number
    failureCount: number
  }
  gateResults: GateResult[]
  artifactRefs: SentinelArtifactRef[]
  failures: GateFailure[]
}

export function buildGateResult(input: {
  kind: GateKind
  command: string[]
  issues: ValidationIssue[]
  passed: boolean
  durationMs: number
  checkedCount: number
  artifactRefs?: SentinelArtifactRef[]
  proofKind?: string
  proofContext?: SentinelProofContext
}): GateResult {
  const proofKind = input.proofKind ?? `sentinel-${input.kind}-gate`
  return {
    schemaVersion: 'sentinel.gate-result.v1',
    producer: 'sentinel',
    proofKind,
    proofy: {
      producer: 'sentinel',
      proofKind,
      context: input.proofContext ?? {},
      artifactRefs: input.artifactRefs ?? [],
    },
    gate: {
      kind: input.kind,
      command: input.command,
      replayCommand: input.command.join(' '),
    },
    verdict: input.passed ? 'passed' : 'failed',
    failures: input.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => ({
        class: failureClass(input.kind, issue),
        severity: issue.severity,
        layer: issue.layer,
        rule: issue.rule,
        message: issue.message,
        file: issue.file,
        fix: issue.fix,
      })),
    artifactRefs: input.artifactRefs ?? [],
    durationMs: input.durationMs,
    checkedCount: input.checkedCount,
    generatedAt: new Date().toISOString(),
  }
}

export function buildValidationBundle(input: {
  gateResults: GateResult[]
  requestor?: string
  artifactRefs?: SentinelArtifactRef[]
}): ValidationBundle {
  const failures = input.gateResults.flatMap((result) => result.failures)
  const artifactRefs = dedupeArtifactRefs([
    ...(input.artifactRefs ?? []),
    ...input.gateResults.flatMap((result) => result.artifactRefs),
  ])
  return {
    schemaVersion: 'sentinel.validation-bundle.v1',
    producer: 'sentinel',
    requestor: input.requestor?.trim() || null,
    generatedAt: new Date().toISOString(),
    summary: {
      verdict: failures.length === 0 ? 'passed' : 'failed',
      gateCount: input.gateResults.length,
      failedGateCount: input.gateResults.filter((result) => result.verdict === 'failed').length,
      failureCount: failures.length,
    },
    gateResults: input.gateResults,
    artifactRefs,
    failures,
  }
}

export function selectGateKinds(input: {
  repoType?: string
  taskType?: string
  configured?: GateKind[]
}): GateKind[] {
  if (input.configured?.length) return dedupe(input.configured)
  const repoType = input.repoType ?? ''
  const taskType = input.taskType ?? ''
  const selected: GateKind[] = ['schema']

  if (repoType === 'api' || taskType === 'api') selected.push('contracts', 'mock')
  if (repoType === 'mobile' || taskType === 'mobile') selected.push('catalog', 'flow', 'visual')
  if (repoType === 'web' || taskType === 'web' || taskType === 'ui') selected.push('flow', 'visual', 'perf')
  if (taskType === 'chaos') selected.push('chaos')
  if (taskType === 'quality') selected.push('quality')

  return dedupe(selected)
}

function failureClass(kind: GateKind, issue: ValidationIssue): GateFailureClass {
  if (kind === 'visual' || issue.layer.startsWith('visual')) return 'visual-invalid'
  return 'gate-failed'
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function dedupeArtifactRefs(items: SentinelArtifactRef[]): SentinelArtifactRef[] {
  return [
    ...new Map(
      items.map((ref) => [`${ref.kind}:${ref.sha256 ?? ref.path}:${ref.exists}`, ref] as const),
    ).values(),
  ]
}
