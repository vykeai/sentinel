import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runDoctorCheck } from '../../doctor/check.js'
import type { AtlasSessionCaptureIndex } from '../../catalog/atlas-compat.js'

describe('runDoctorCheck', () => {
  let dir = ''

  function writeBaseProject(projectDir: string, scripts: Record<string, string> = {}): void {
    fs.writeFileSync(path.join(projectDir, 'sentinel.yaml'), 'sentinel: "1.0"\nproject: demo\nversion: "1.0.0"\nquality:\n  tests: "echo ok"\n')
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      scripts,
      devDependencies: {
        '@sentinel/cli': '^0.1.0',
      },
    }, null, 2))
  }

  function writeBrandieFiles(projectDir: string, contract: Record<string, unknown>, pack: Record<string, unknown>): string {
    const brandieRoot = path.join(projectDir, 'brandie')
    const reviewAssetsDir = path.join(brandieRoot, 'brands', 'brandie', 'review-assets')
    const packsDir = path.join(reviewAssetsDir, 'packs')
    fs.mkdirSync(packsDir, { recursive: true })
    fs.writeFileSync(path.join(reviewAssetsDir, 'contract.json'), JSON.stringify(contract, null, 2))
    fs.writeFileSync(path.join(packsDir, 'example-app.json'), JSON.stringify(pack, null, 2))
    return brandieRoot
  }

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('normalizes absolute path and npx sentinel scripts when fix is enabled', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    writeBaseProject(dir, {
      'schema:validate': 'node /Users/luke/dev/sentinel/dist/cli/index.js schema:validate',
      'mock:validate': 'npx sentinel mock:validate',
    })

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
    writeBaseProject(dir, {
      'catalog:validate': 'sentinel catalog:validate',
    })

    const manifestPath = path.join(process.cwd(), 'examples/atlas/manifest.example-app.v1.json')
    const invalidSessionPath = path.join(dir, 'session-index.invalid.json')
    const sessionIndex = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'examples/atlas/session-index.example-app.v1.json'), 'utf8'),
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

  it('warns when Atlas review context points at missing Brandie export files', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    writeBaseProject(dir, {
      'doctor:atlas': 'sentinel doctor --atlas-manifest atlas/manifest.json --session-index atlas/session-index.json',
    })

    const result = runDoctorCheck(dir, '@sentinel/cli', {
      atlasManifestPath: path.join(process.cwd(), 'examples/atlas/manifest.example-brand.v1.json'),
      sessionIndexPath: path.join(process.cwd(), 'examples/atlas/session-index.example-brand.v1.json'),
    })

    expect(result.passed).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'brandie-contract-missing')).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'brandie-pack-missing')).toBe(true)
  })

  it('warns when Atlas review context drifts from Brandie pack ids, paths, or overrides', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-doctor-'))
    writeBaseProject(dir, {
      'doctor:atlas': 'sentinel doctor --atlas-manifest atlas/manifest.json --session-index atlas/session-index.json --brandie-root ../brandie',
    })

    const brandieRoot = writeBrandieFiles(
      dir,
      {
        reviewPacks: [
          {
            packId: 'example-app.review-pack',
            packPath: 'brands/brandie/review-assets/packs/example-app-renamed.json',
          },
        ],
      },
      {
        packId: 'example-app.review-pack.v2',
        scenarioFamilies: [
          {
            scenarioOverrides: [
              {
                atlasSurfaceId: 'atlas.example-app.journey.some-other-empty-state',
              },
            ],
          },
        ],
      },
    )

    const result = runDoctorCheck(dir, '@sentinel/cli', {
      atlasManifestPath: path.join(process.cwd(), 'examples/atlas/manifest.example-brand.v1.json'),
      sessionIndexPath: path.join(process.cwd(), 'examples/atlas/session-index.example-brand.v1.json'),
      brandieRoot,
    })

    expect(result.passed).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'brandie-pack-path-stale')).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'brandie-pack-id-stale')).toBe(true)
    expect(result.issues.some((issue) => issue.code === 'brandie-binding-unresolved')).toBe(true)
  })
})
