import { spawnSync } from 'child_process'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

let tempDirs: string[] = []

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content)
  chmodSync(path, 0o755)
}

function fixtureRepo(options: { fedDist?: boolean } = { fedDist: true }): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-onlytools-cli-'))
  tempDirs.push(dir)
  mkdirSync(join(dir, 'bin'), { recursive: true })
  mkdirSync(join(dir, 'fed'), { recursive: true })
  mkdirSync(join(dir, 'sentinel'), { recursive: true })
  writeExecutable(join(dir, 'bin', 'onlytools'), [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "Real manifest graph has no install cycles"',
    'printf "%s\\n" "Fixture install graph resolves transitive dependencies"',
    'printf "%s\\n" "Cycle fixture reports exact dependency path"',
    '',
  ].join('\n'))
  writeFileSync(join(dir, 'sentinel', 'sentinel.yaml'), [
    'sentinel: "1.0"',
    'project: onlytools-cli-fixture',
    'version: "1.0.0"',
    'quality:',
    '  tests: npm test',
    '',
  ].join('\n'))

  if (options.fedDist !== false) {
    mkdirSync(join(dir, 'fed', 'dist'), { recursive: true })
    writeExecutable(join(dir, 'fed', 'dist', 'cli.js'), [
      '#!/usr/bin/env node',
      'const args = process.argv.slice(2).join(" ")',
      'if (args.includes("catalog validate")) console.log(JSON.stringify({ ok: true, entries: 1, errors: [] }))',
      'else if (args.includes("ports validate")) console.log(JSON.stringify({ ok: true, reservations: 1, errors: [] }))',
      'else if (args.includes("mdns list")) console.log(JSON.stringify({ ok: true, broadcasts: [], errors: [] }))',
      'else process.exit(1)',
      '',
    ].join('\n'))
  }

  return dir
}

function runSentinel(cwd: string, args: string[]) {
  return spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      join(process.cwd(), 'src', 'cli', 'index.ts'),
      ...args,
    ],
    { cwd, encoding: 'utf-8' },
  )
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs = []
})

describe('Onlytools CLI gate', () => {
  it('runs gate:run from a nested Sentinel project without an explicit repo root', () => {
    const repo = fixtureRepo()
    const result = runSentinel(join(repo, 'sentinel'), ['gate:run', '--kind', 'onlytools', '--json'])

    expect(result.status).toBe(0)
    const body = JSON.parse(result.stdout)
    expect(body.verdict).toBe('passed')
    expect(body.checkedCount).toBe(4)
  })

  it('redacts explicit repo root paths from gate-result command metadata', () => {
    const repo = fixtureRepo()
    const result = runSentinel(join(repo, 'sentinel'), ['gate:run', '--kind', 'onlytools', '--json', '--repo-root', repo])

    expect(result.status).toBe(0)
    const body = JSON.parse(result.stdout)
    expect(body.verdict).toBe('passed')
    expect(JSON.stringify(body.gate)).not.toContain(repo)
    expect(body.gate.command).toContain('<repo>')
  })

  it('returns a failed gate-result payload and exit code when onlytools inputs are missing', () => {
    const repo = fixtureRepo({ fedDist: false })
    const result = runSentinel(join(repo, 'sentinel'), ['gate:run', '--kind', 'onlytools', '--json'])

    expect(result.status).toBe(1)
    const body = JSON.parse(result.stdout)
    expect(body.verdict).toBe('failed')
    expect(body.failures.length).toBeGreaterThan(0)
    expect(body.failures[0].layer).toBe('onlytools.manifest')
  })

  it('writes failed non-JSON validation diagnostics to stderr', () => {
    const repo = fixtureRepo({ fedDist: false })
    const result = runSentinel(join(repo, 'sentinel'), ['onlytools'])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('fed CLI build missing')
  })
})
