import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../../config/loader.js'
import { buildLegacyAtlasExport } from '../../catalog/atlas-compat.js'

const fixtureRoot = path.join(process.cwd(), 'examples', 'ecosystem')

describe('ecosystem sentinel fixtures', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('loads the Onlystack-style alias config and keeps the empty starter catalog explicit', () => {
    const config = loadConfig(path.join(fixtureRoot, 'onlystack.sentinel.yaml'))
    const exported = buildLegacyAtlasExport(config.catalog!)

    expect(config.platforms.apple?.path).toBe('./apps/starter-ios')
    expect(config.platforms.google?.path).toBe('./apps/starter-android')
    expect(config.catalog?.ios26?.iphone?.glossy).toBe(true)
    expect(exported.legacy.screens).toBe(0)
    expect(exported.surfaces).toEqual([])
  })

  it('exports FitKind-style launch-arg flows into compatibility surfaces', () => {
    const config = loadConfig(path.join(fixtureRoot, 'fitkind.sentinel.yaml'))
    const exported = buildLegacyAtlasExport(config.catalog!)

    expect(config.catalog?.android?.phone?.app_ids?.dev).toBe('app.fitkind.dev')
    expect(exported.surfaces.map((surface) => surface.id)).toEqual(['welcome', 'journey', 'analytics'])
    expect(exported.surfaces[0].scenarios[0].entry).toEqual({
      strategy: 'maestro_flow',
      flow: expect.stringContaining('--screen=welcome'),
    })
    expect(exported.surfaces[2].legacy?.flow).toContain('--screen=analytics')
  })

  it('exports Sitches-style sparse screens as manual-upload compatibility surfaces', () => {
    const config = loadConfig(path.join(fixtureRoot, 'sitches.sentinel.yaml'))
    const exported = buildLegacyAtlasExport(config.catalog!)

    expect(config.platforms.google?.path).toBe('./google')
    expect(config.catalog?.android?.phone?.app_id).toBe('app.sitches.ios.dev')
    expect(exported.surfaces.map((surface) => surface.id)).toEqual(['welcome', 'browse', 'chat', 'profile'])
    expect(exported.surfaces.every((surface) => surface.scenarios[0].entry.strategy === 'manual_upload')).toBe(true)
  })

  it('reports actionable config drift when an ecosystem sample loses its app ids', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ecosystem-fixture-'))
    const brokenPath = path.join(dir, 'onlystack.sentinel.yaml')
    const source = fs.readFileSync(path.join(fixtureRoot, 'onlystack.sentinel.yaml'), 'utf8')
      .replace('      app_id: com.onlystack.starterapp.mock\n', '')
    fs.writeFileSync(brokenPath, source)

    expect(() => loadConfig(brokenPath)).toThrow(/catalog\.android\.phone: declare app_id or app_ids/)
  })
})
