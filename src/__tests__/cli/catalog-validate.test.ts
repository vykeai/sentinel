import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawnSync } from 'child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAtlasArtifactPath,
  type AtlasSessionCaptureArtifact,
  type AtlasSessionCaptureIndex,
} from '../../catalog/atlas-compat.js'

describe('catalog:validate cli', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports Atlas validation failures with classified output', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-catalog-validate-'))
    const manifestPath = path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndexPath = path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json')
    const sessionIndex = JSON.parse(
      fs.readFileSync(sessionIndexPath, 'utf-8'),
    ) as AtlasSessionCaptureIndex

    for (const capture of sessionIndex.captures) {
      fs.rmSync(path.join(process.cwd(), capture.artifactPath), { force: true })
    }

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        'src/cli/index.ts',
        'catalog:validate',
        '--atlas-manifest',
        manifestPath,
        '--session-index',
        sessionIndexPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Atlas catalog: 0/5 expected captures present')
    expect(result.stdout).toContain('coverage-drift')
    expect(result.stdout).toContain('artifact-mismatch')
  })

  it('passes Atlas validation when all expected artifacts exist', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-catalog-validate-'))
    const manifestPath = path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndexPath = path.join(dir, 'session-index.json')
    const sessionIndex = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json'), 'utf-8'),
    ) as AtlasSessionCaptureIndex

    sessionIndex.captures = [
      ...sessionIndex.captures.map((capture) => ({ ...capture, status: 'captured' as const })),
      {
        pathId: 'main:journey:list',
        surfaceId: 'journey:list',
        scenarioId: 'journey:list:empty-journey',
        targetId: 'ios:iphone15pro:light:en-gb',
        entryStrategyId: 'journey:list:deeplink',
        artifactKind: 'screenshot',
        fileName: 'frame-001.png',
        artifactPath: buildAtlasArtifactPath('fitkind', {
          pathId: 'main:journey:list',
          surfaceId: 'journey:list',
          scenarioId: 'journey:list:empty-journey',
          targetId: 'ios:iphone15pro:light:en-gb',
          entryStrategyId: 'journey:list:deeplink',
          artifactKind: 'screenshot',
          fileName: 'frame-001.png',
        }),
        capturedAt: '2026-04-03T00:10:00.000Z',
        status: 'captured' as const,
      } satisfies AtlasSessionCaptureArtifact,
      {
        pathId: 'main:journey:list',
        surfaceId: 'journey:list',
        scenarioId: 'journey:list:empty-journey',
        targetId: 'android:pixel8:light:en-gb',
        entryStrategyId: 'journey:list:deeplink',
        artifactKind: 'screenshot',
        fileName: 'frame-001.png',
        artifactPath: buildAtlasArtifactPath('fitkind', {
          pathId: 'main:journey:list',
          surfaceId: 'journey:list',
          scenarioId: 'journey:list:empty-journey',
          targetId: 'android:pixel8:light:en-gb',
          entryStrategyId: 'journey:list:deeplink',
          artifactKind: 'screenshot',
          fileName: 'frame-001.png',
        }),
        capturedAt: '2026-04-03T00:10:01.000Z',
        status: 'captured' as const,
      } satisfies AtlasSessionCaptureArtifact,
    ]
    fs.writeFileSync(sessionIndexPath, JSON.stringify(sessionIndex, null, 2))

    for (const capture of sessionIndex.captures) {
      const absolute = path.join(process.cwd(), capture.artifactPath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, '')
    }

    const output = execFileSync(
      process.execPath,
      [
        path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        'src/cli/index.ts',
        'catalog:validate',
        '--atlas-manifest',
        manifestPath,
        '--session-index',
        sessionIndexPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    )

    expect(output).toContain('Atlas catalog: 5/5 expected captures present')
    expect(output).toContain('Parity pairs: 2')
    expect(output).toContain('All Atlas screenshot expectations are satisfied')

    for (const capture of sessionIndex.captures) {
      fs.rmSync(path.join(process.cwd(), capture.artifactPath), { force: true })
    }
  })
})
