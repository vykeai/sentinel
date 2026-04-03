import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runDoctorCheck } from '../../doctor/check.js'
import type { AtlasSessionCaptureIndex } from '../../catalog/atlas-compat.js'

describe('runDoctorCheck', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('normalizes absolute path and npx sentinel scripts when fix is enabled', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    fs.writeFileSync(path.join(dir, 'sentinel.yaml'), 'sentinel: "1.0"\nproject: demo\nversion: "1.0.0"\nquality:\n  tests: "echo ok"\n')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        'schema:validate': 'node /Users/luke/dev/sentinel/dist/cli/index.js schema:validate',
        'mock:validate': 'npx sentinel mock:validate',
      },
      devDependencies: {
        '@sentinel/cli': '^0.1.0',
      },
    }, null, 2))

    const result = runDoctorCheck(dir, '@sentinel/cli', { fix: true })
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

    expect(result.fixed).toBe(true)
    expect(pkg.scripts['schema:validate']).toBe('sentinel schema:validate')
    expect(pkg.scripts['mock:validate']).toBe('sentinel mock:validate')
  })

  it('warns when sentinel dependency is missing', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    fs.writeFileSync(path.join(dir, 'sentinel.yaml'), 'sentinel: "1.0"\nproject: demo\nversion: "1.0.0"\nquality:\n  tests: "echo ok"\n')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {} }, null, 2))

    const result = runDoctorCheck(dir, '@sentinel/cli')
    expect(result.issues.some((issue) => issue.code === 'sentinel-dependency-missing')).toBe(true)
  })

  it('flags invalid Atlas fixture combinations and unwired scripts during migration', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    fs.writeFileSync(path.join(dir, 'sentinel.yaml'), 'sentinel: "1.0"\nproject: demo\nversion: "1.0.0"\nquality:\n  tests: "echo ok"\n')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      scripts: {
        'catalog:validate': 'sentinel catalog:validate',
      },
      devDependencies: {
        '@sentinel/cli': '^0.1.0',
      },
    }, null, 2))

    const manifestPath = path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json')
    const invalidSessionPath = path.join(dir, 'session-index.invalid.json')
    const sessionIndex = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json'), 'utf8'),
    ) as AtlasSessionCaptureIndex
    sessionIndex.captures[0].targetId = 'ios:invalid:light:en-gb'
    sessionIndex.captures[0].artifactPath = sessionIndex.captures[0].artifactPath.replace(
      'ios__iphone15pro__light__en-gb',
      'ios__invalid__light__en-gb',
    )
    fs.writeFileSync(invalidSessionPath, JSON.stringify(sessionIndex, null, 2))

    const result = runDoctorCheck(dir, '@sentinel/cli', {
      atlasManifestPath: manifestPath,
      sessionIndexPath: invalidSessionPath,
    })

    expect(result.passed).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'atlas-fixture-invalid')).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'atlas-scripts-not-wired')).toBe(true)
  })
})
