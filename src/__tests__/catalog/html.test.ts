import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateAtlasIndex, generateIndex } from '../../catalog/html.js'
import {
  readJsonFixture,
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
} from '../../catalog/atlas-compat.js'

describe('catalog html', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('renders legacy catalogs as hierarchical path, surface, scenario, and target groups', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-html-'))
    fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'catalog', 'sign-in-ios18-iphone-light.png'), '')

    generateIndex({
      output: 'catalog/',
      ios18: {
        iphone: { slug: 'demo-ios', app_id: 'app.demo' },
      },
      screens: [
        { slug: 'sign-in', name: 'Sign In' },
      ],
    }, dir)

    const html = fs.readFileSync(path.join(dir, 'catalog', 'index.html'), 'utf-8')
    expect(html).toContain('Screen Catalog')
    expect(html).toContain('Sign In')
    expect(html).toContain('Default')
    expect(html).toContain('iOS 18 iPhone')
  })

  it('renders Atlas artifacts by path, surface, scenario, and target', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-atlas-html-'))
    const outputDir = path.join(dir, 'catalog')
    const manifest = readJsonFixture<AtlasManifestFixture>(path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json'))
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>(path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json'))

    const captured = sessionIndex.captures.filter((capture) => capture.status === 'captured')
    for (const capture of captured) {
      const absolute = path.join(dir, capture.artifactPath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, '')
    }

    generateAtlasIndex(outputDir, dir, manifest, sessionIndex)

    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8')
    expect(html).toContain('Atlas Review Dashboard')
    expect(html).toContain('Workouts list')
    expect(html).toContain('Default list')
    expect(html).toContain('iPhone 15 Pro')
    expect(html).toContain('frame-001.png')
    expect(html).toContain('<img src="../artifacts/fitkind/')
    expect(html).toContain('MISSING')
  })

  it('escapes dynamic Atlas content before writing HTML', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-atlas-html-'))
    const outputDir = path.join(dir, 'catalog')
    const manifest = readJsonFixture<AtlasManifestFixture>(path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json'))
    const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>(path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json'))
    const escapedManifest = JSON.parse(JSON.stringify(manifest)) as AtlasManifestFixture

    escapedManifest.surfaces[0].title = '<img src=x onerror=alert(1)>'
    escapedManifest.scenarios[0].title = '<script>alert(1)</script>'

    const captured = sessionIndex.captures.filter((capture) => capture.status === 'captured')
    for (const capture of captured) {
      const absolute = path.join(dir, capture.artifactPath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, '')
    }

    generateAtlasIndex(outputDir, dir, escapedManifest, sessionIndex)

    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
