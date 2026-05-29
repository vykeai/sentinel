import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { validateOnlytoolsEstate, type CommandRunner } from '../../onlytools/validator.js'

let tempDirs: string[] = []

function fixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-onlytools-'))
  tempDirs.push(dir)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  mkdirSync(join(dir, 'fed', 'dist'), { recursive: true })
  writeFileSync(join(dir, 'bin', 'onlytools'), '#!/usr/bin/env bash\n')
  writeFileSync(join(dir, 'fed', 'dist', 'cli.js'), '#!/usr/bin/env node\n')
  return dir
}

function runner(overrides: Record<string, { status: number; stdout?: string; stderr?: string }> = {}): CommandRunner {
  return (command) => {
    const full = command.join(' ')
    const response = overrides[full] ?? Object.entries(overrides).find(([key]) => full.includes(key))?.[1]
    if (response) {
      return { status: response.status, stdout: response.stdout ?? '', stderr: response.stderr ?? '' }
    }
    if (full.includes('catalog validate')) return { status: 0, stdout: JSON.stringify({ ok: true, entries: 3, errors: [] }), stderr: '' }
    if (full.includes('ports validate')) return { status: 0, stdout: JSON.stringify({ ok: true, reservations: 2, errors: [] }), stderr: '' }
    if (full.includes('mdns list')) return { status: 0, stdout: JSON.stringify({ ok: true, broadcasts: [], errors: [] }), stderr: '' }
    if (full.includes('graph validate')) {
      return {
        status: 0,
        stdout: [
          'Real manifest graph has no install cycles',
          'Fixture install graph resolves transitive dependencies',
          'Cycle fixture reports exact dependency path',
        ].join('\n'),
        stderr: '',
      }
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${full}` }
  }
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs = []
})

describe('Onlytools Sentinel validator', () => {
  it('aggregates manifest, graph, port, and mDNS broadcast checks', () => {
    const result = validateOnlytoolsEstate({ repoRoot: fixtureRepo(), runner: runner(), mdnsTimeoutMs: 10 })

    expect(result.ok).toBe(true)
    expect(result.repoRoot).toBe('<repo>')
    expect(result.summary).toEqual({
      manifest: 'pass',
      graph: 'pass',
      ports: 'pass',
      broadcasts: 'pass',
    })
    expect(result.checks.map(check => check.section)).toEqual(['manifest', 'graph', 'ports', 'broadcasts'])
    expect(result.checks.find(check => check.section === 'manifest')?.command).toEqual(['node', 'fed/dist/cli.js', 'catalog', 'validate', '--json'])
    expect(result.checks.find(check => check.section === 'broadcasts')?.details).toEqual({ broadcasts: 0 })
  })

  it('fails stale mDNS broadcasts so release gates do not treat old cache as inventory', () => {
    const result = validateOnlytoolsEstate({
      repoRoot: fixtureRepo(),
      runner: runner({
        'mdns list --json --timeout 10': {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            broadcasts: [{ slug: 'sweech', environment: 'dev', mdnsName: 'sweech-dev.local', status: 'stale' }],
            errors: [],
          }),
        },
      }),
      mdnsTimeoutMs: 10,
    })

    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.section === 'broadcasts')?.errors).toEqual([
      'stale-mdns-record: sweech:dev:sweech-dev.local',
    ])
  })

  it('fails graph validation when the exact graph proof lines are missing', () => {
    const result = validateOnlytoolsEstate({
      repoRoot: fixtureRepo(),
      runner: runner({
        'graph validate --fixtures': { status: 0, stdout: 'Real manifest graph has no install cycles', stderr: '' },
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.section === 'graph')?.errors).toContain('missing proof line: Fixture install graph resolves transitive dependencies')
  })

  it('reports a missing Fed build as a machine-readable failure', () => {
    const repo = fixtureRepo()
    rmSync(join(repo, 'fed'), { recursive: true, force: true })

    const result = validateOnlytoolsEstate({ repoRoot: repo, runner: runner() })

    expect(result.ok).toBe(false)
    expect(result.checks.filter(check => check.status === 'fail').map(check => check.section)).toEqual(['manifest', 'ports', 'broadcasts'])
    expect(result.summary).toEqual({
      manifest: 'fail',
      graph: 'fail',
      ports: 'fail',
      broadcasts: 'fail',
    })
  })

  it('turns failed tool responses without errors into explicit machine-readable failures', () => {
    const result = validateOnlytoolsEstate({
      repoRoot: fixtureRepo(),
      runner: runner({
        'catalog validate --json': { status: 0, stdout: JSON.stringify({ ok: false, entries: 3, errors: [] }), stderr: '' },
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.section === 'manifest')?.errors).toEqual([
      'manifest validation failed without detailed errors',
    ])
  })

  it('redacts unsafe broadcast data from validation output', () => {
    const result = validateOnlytoolsEstate({
      repoRoot: fixtureRepo(),
      runner: runner({
        'mdns list --json': {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            broadcasts: [{
              slug: 'sweech',
              environment: 'dev',
              status: 'active',
              token: 'my-secret-token',
              configRoot: '/Users/luke/dev/onlytools/sweech',
            }],
            errors: [],
          }),
          stderr: '',
        },
      }),
    })

    const serialized = JSON.stringify(result)
    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.section === 'broadcasts')?.errors).toEqual(['unsafe-mdns-payload: sweech:dev'])
    expect(serialized).not.toContain('my-secret-token')
    expect(serialized).not.toContain('/Users/luke')
  })

  it('does not echo invalid JSON payloads into machine-readable errors', () => {
    const result = validateOnlytoolsEstate({
      repoRoot: fixtureRepo(),
      runner: runner({
        'catalog validate --json': { status: 0, stdout: 'my-secret-token', stderr: '' },
      }),
    })

    const serialized = JSON.stringify(result)
    expect(result.ok).toBe(false)
    expect(result.checks.find(check => check.section === 'manifest')?.errors).toEqual(['invalid-json'])
    expect(serialized).not.toContain('my-secret-token')
  })

  it('can reject repo roots outside an allowed Onlytools checkout', () => {
    const allowed = fixtureRepo()
    const rejected = fixtureRepo()

    const result = validateOnlytoolsEstate({ repoRoot: rejected, allowedRepoRoot: allowed, runner: runner() })

    expect(result.ok).toBe(false)
    expect(result.repoRoot).toBeNull()
    expect(result.checks).toHaveLength(4)
    expect(result.checks.every(check => check.errors[0].startsWith('repo-root-not-allowed'))).toBe(true)
  })
})
