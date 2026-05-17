import { describe, expect, it } from 'vitest'
import { buildGateResult, selectGateKinds } from '../../cli/gate-result.js'

describe('machine-readable gate result helpers', () => {
  it('builds a stable machine-readable gate result', () => {
    const result = buildGateResult({
      kind: 'schema',
      command: ['sentinel', 'schema:validate'],
      passed: false,
      durationMs: 42,
      checkedCount: 3,
      proofKind: 'sentinel-schema-gate',
      proofContext: {
        taskId: 'SENTINEL-002',
        repo: 'vykeai/sentinel',
        commit: 'abc123',
        currentCommit: 'abc123',
        host: 'mac-studio',
      },
      artifactRefs: [{ kind: 'status-json', path: 'tmp/sentinel-status.json', sha256: 'abc', exists: true }],
      issues: [
        {
          severity: 'error',
          layer: 'schema',
          rule: 'staleness',
          message: 'Generated file stale',
          file: 'src/generated.ts',
          fix: 'sentinel schema:generate',
        },
      ],
    })

    expect(result.schemaVersion).toBe('sentinel.gate-result.v1')
    expect(result.producer).toBe('sentinel')
    expect(result.proofKind).toBe('sentinel-schema-gate')
    expect(result.proofy).toMatchObject({
      producer: 'sentinel',
      proofKind: 'sentinel-schema-gate',
      context: {
        taskId: 'SENTINEL-002',
        repo: 'vykeai/sentinel',
        commit: 'abc123',
        currentCommit: 'abc123',
        host: 'mac-studio',
      },
    })
    expect(result.gate.kind).toBe('schema')
    expect(result.verdict).toBe('failed')
    expect(result.failures).toEqual([
      {
        class: 'gate-failed',
        severity: 'error',
        layer: 'schema',
        rule: 'staleness',
        message: 'Generated file stale',
        file: 'src/generated.ts',
        fix: 'sentinel schema:generate',
      },
    ])
    expect(result.artifactRefs).toEqual([{ kind: 'status-json', path: 'tmp/sentinel-status.json', sha256: 'abc', exists: true }])
    expect(result.gate.replayCommand).toBe('sentinel schema:validate')
  })

  it('maps visual failures to visual-invalid', () => {
    const result = buildGateResult({
      kind: 'visual',
      command: ['sentinel', 'visual'],
      passed: false,
      durationMs: 12,
      checkedCount: 1,
      issues: [
        {
          severity: 'error',
          layer: 'visual.parity',
          rule: 'low-parity-score',
          message: 'Parity score 3/10',
        },
      ],
    })

    expect(result.failures[0].class).toBe('visual-invalid')
  })

  it('selects configured gates by repo and task type', () => {
    expect(selectGateKinds({ repoType: 'api' })).toEqual(['schema', 'contracts', 'mock'])
    expect(selectGateKinds({ repoType: 'web', taskType: 'ui' })).toEqual(['schema', 'flow', 'visual', 'perf'])
    expect(selectGateKinds({ configured: ['quality', 'copy', 'schema', 'quality'] })).toEqual(['quality', 'copy', 'schema'])
  })
})
