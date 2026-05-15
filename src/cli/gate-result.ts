import type { ValidationIssue } from '../config/types.js'

export type CodeuctorGateKind =
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

export type CodeuctorFailureClass = 'gate-failed' | 'visual-invalid'

export interface CodeuctorGateFailure {
  class: CodeuctorFailureClass
  severity: string
  layer: string
  rule: string
  message: string
  file?: string
  fix?: string
}

export interface CodeuctorGateResult {
  schemaVersion: 'sentinel.gate-result.v1'
  gate: {
    kind: CodeuctorGateKind
    command: string[]
    replayCommand: string
  }
  verdict: 'passed' | 'failed'
  failures: CodeuctorGateFailure[]
  artifactRefs: Array<{ kind: string; path: string }>
  durationMs: number
  checkedCount: number
  generatedAt: string
}

export function buildGateResult(input: {
  kind: CodeuctorGateKind
  command: string[]
  issues: ValidationIssue[]
  passed: boolean
  durationMs: number
  checkedCount: number
  artifactRefs?: Array<{ kind: string; path: string }>
}): CodeuctorGateResult {
  return {
    schemaVersion: 'sentinel.gate-result.v1',
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

export function selectGateKinds(input: {
  repoType?: string
  taskType?: string
  configured?: CodeuctorGateKind[]
}): CodeuctorGateKind[] {
  if (input.configured?.length) return dedupe(input.configured)
  const repoType = input.repoType ?? ''
  const taskType = input.taskType ?? ''
  const selected: CodeuctorGateKind[] = ['schema']

  if (repoType === 'api' || taskType === 'api') selected.push('contracts', 'mock')
  if (repoType === 'mobile' || taskType === 'mobile') selected.push('catalog', 'flow', 'visual')
  if (repoType === 'web' || taskType === 'web' || taskType === 'ui') selected.push('flow', 'visual', 'perf')
  if (taskType === 'chaos') selected.push('chaos')
  if (taskType === 'quality') selected.push('quality')

  return dedupe(selected)
}

function failureClass(kind: CodeuctorGateKind, issue: ValidationIssue): CodeuctorFailureClass {
  if (kind === 'visual' || issue.layer.startsWith('visual')) return 'visual-invalid'
  return 'gate-failed'
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)]
}
