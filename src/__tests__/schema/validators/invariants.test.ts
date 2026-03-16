import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ResolvedConfig } from '../../../config/types.js'
import { checkInvariants } from '../../../schema/validators/invariants.js'

function makeConfig(dir: string, invariants: ResolvedConfig['invariants']): ResolvedConfig {
  const sentinelDir = path.join(dir, 'sentinel')
  const schemasDir = path.join(sentinelDir, 'schemas')

  fs.mkdirSync(path.join(schemasDir, 'design'), { recursive: true })
  fs.mkdirSync(path.join(schemasDir, 'features'), { recursive: true })
  fs.mkdirSync(path.join(schemasDir, 'platform'), { recursive: true })
  fs.mkdirSync(path.join(schemasDir, 'models'), { recursive: true })

  return {
    sentinel: '1.0',
    project: 'testapp',
    version: '1.0.0',
    projectRoot: dir,
    sentinelDir,
    schemasDir,
    featuresDir: path.join(schemasDir, 'features'),
    designDir: path.join(schemasDir, 'design'),
    platformDir: path.join(schemasDir, 'platform'),
    modelsDir: path.join(schemasDir, 'models'),
    invariants,
    platforms: {
      apple: {
        path: './apple',
        language: 'swift',
        output: {},
      },
    },
  }
}

describe('checkInvariants', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('passes contains invariants when the required text exists', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-invariants-'))
    const filePath = path.join(dir, 'Info.plist')
    fs.writeFileSync(filePath, '<key>UILaunchScreen</key><dict/>')

    const result = checkInvariants(makeConfig(dir, [{
      file: './Info.plist',
      contains: '<key>UILaunchScreen</key>',
      error: 'missing launch screen',
    }]))

    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('reports pattern invariant matches and respects excludes', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-invariants-'))
    const srcDir = path.join(dir, 'apple', 'FitKind')
    const excludedDir = path.join(srcDir, 'DesignSystem', 'Tokens')
    fs.mkdirSync(excludedDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'Journey.swift'), 'Color(red: 0.09, green: 0.09, blue: 0.11)\n')
    fs.writeFileSync(path.join(excludedDir, 'Tokens.swift'), 'Color(red: 0.09, green: 0.09, blue: 0.11)\n')

    const result = checkInvariants(makeConfig(dir, [{
      pattern: 'Color\\(red: 0\\.09, green: 0\\.09',
      files: './apple/FitKind/**/*.swift',
      exclude: './apple/FitKind/DesignSystem/Tokens/**',
      error: 'Hardcoded colour value in Swift',
    }]))

    expect(result.passed).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.rule).toBe('pattern')
    expect(result.issues[0]?.file).toContain('Journey.swift')
  })

  it('treats invalid regex patterns as literal substring checks', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-invariants-'))
    const srcDir = path.join(dir, 'apple', 'FitKind')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'Journey.swift'), 'Color(red: 0.09, green: 0.09, blue: 0.11)\n')

    const result = checkInvariants(makeConfig(dir, [{
      pattern: 'Color(red: 0.09, green: 0.09',
      files: './apple/FitKind/**/*.swift',
      error: 'Hardcoded colour value in Swift',
    }]))

    expect(result.passed).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.rule).toBe('pattern')
  })
})
