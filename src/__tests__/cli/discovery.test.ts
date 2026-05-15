import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverSentinelRepo } from '../../cli/discovery.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-discovery-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('Sentinel repo discovery', () => {
  it('returns not-configured without failing when config is missing', () => {
    const repo = tempRepo()
    const result = discoverSentinelRepo(repo)

    expect(result.schemaVersion).toBe('sentinel.discovery.v1')
    expect(result.producer).toBe('sentinel')
    expect(result.status).toBe('not-configured')
    expect(result.reason).toBe('sentinel-config-missing')
    expect(result.configPath).toBeNull()
    expect(result.platforms).toEqual([])
    expect(result.gates).toHaveLength(10)
    expect(result.gates.every((gate) => gate.configured === false)).toBe(true)
  })

  it('reports configured gates and required inputs for a repo', () => {
    const repo = tempRepo()
    mkdirSync(join(repo, 'sentinel', 'schemas', 'features'), { recursive: true })
    mkdirSync(join(repo, 'sentinel', 'schemas', 'platform'), { recursive: true })
    mkdirSync(join(repo, 'sentinel', 'flows', 'playwright'), { recursive: true })
    mkdirSync(join(repo, 'sentinel', 'visual', 'baselines'), { recursive: true })
    writeFileSync(join(repo, 'sentinel', 'schemas', 'features', 'auth.json'), '{}\n')
    writeFileSync(join(repo, 'sentinel', 'schemas', 'platform', 'mock-config.json'), '{}\n')
    writeFileSync(join(repo, 'sentinel', 'flows', 'playwright', 'auth.spec.ts'), 'test("auth", () => {})\n')
    writeFileSync(join(repo, 'sentinel.yaml'), [
      'sentinel: "1.0"',
      'project: discovery-app',
      'version: "1.2.3"',
      'platforms:',
      '  api:',
      '    path: api/',
      '    language: typescript',
      '    framework: express',
      'catalog:',
      '  output: catalog/',
      '  screens: []',
      'quality:',
      '  tests: npm test',
      '',
    ].join('\n'))

    const result = discoverSentinelRepo(repo)
    const gates = Object.fromEntries(result.gates.map((gate) => [gate.kind, gate]))

    expect(result.status).toBe('configured')
    expect(result.project).toBe('discovery-app')
    expect(result.version).toBe('1.2.3')
    expect(result.platforms).toEqual(['api'])
    expect(gates.schema.configured).toBe(true)
    expect(gates.contracts.configured).toBe(true)
    expect(gates.mock.configured).toBe(true)
    expect(gates.catalog.configured).toBe(true)
    expect(gates.flow.configured).toBe(true)
    expect(gates.visual.configured).toBe(true)
    expect(gates.quality.configured).toBe(true)
    expect(gates.chaos.configured).toBe(false)
    expect(gates.schema.replayCommand).toBe('sentinel gate:run --kind schema --json')
    expect(gates.visual.replayCommand).toBe('sentinel visual')
    expect(gates.mock.inputs.some((input) => input.required && input.exists)).toBe(true)
  })
})
