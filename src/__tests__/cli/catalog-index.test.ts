import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { afterEach, describe, expect, it } from 'vitest'

describe('catalog:index cli', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('renders the Atlas dashboard through the production catalog:index command', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-catalog-index-'))
    const outputDir = path.join(dir, 'dashboard')
    const manifestPath = path.join(process.cwd(), 'examples/atlas/manifest.fitkind-mobile.v1.json')
    const sessionIndexPath = path.join(process.cwd(), 'examples/atlas/session-index.fitkind-mobile.v1.json')

    execFileSync(
      process.execPath,
      [
        path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        'src/cli/index.ts',
        'catalog:index',
        '--atlas-manifest',
        manifestPath,
        '--session-index',
        sessionIndexPath,
        '--output-dir',
        outputDir,
      ],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      },
    )

    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8')
    expect(html).toContain('Atlas Review Dashboard')
    expect(html).toContain('frame-001.png')
    expect(html).toContain('iPhone 15 Pro')
  })
})
