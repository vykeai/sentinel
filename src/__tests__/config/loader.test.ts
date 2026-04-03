import { afterEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadConfig } from '../../config/loader.js'

describe('loadConfig', () => {
  let dir = ''

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('accepts catalog device variants via app_ids', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-loader-'))
    const configPath = path.join(dir, 'sentinel.yaml')
    fs.writeFileSync(configPath, [
      'sentinel: "1.0"',
      'project: demo',
      'version: "1.0.0"',
      'platforms:',
      '  apple:',
      '    path: apple/',
      '    language: swift',
      '    output:',
      '      tokens: apple/Tokens.swift',
      'catalog:',
      '  output: catalog/',
      '  android:',
      '    phone:',
      '      slug: demo-android',
      '      app_ids:',
      '        dev: app.demo.dev',
      '        prod: app.demo',
      '  screens:',
      '    - slug: home',
    ].join('\n'))

    const config = loadConfig(configPath)
    expect(config.catalog?.android?.phone?.app_ids?.dev).toBe('app.demo.dev')
  })

  it('normalizes ios and android platform aliases onto the canonical platform keys', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-loader-'))
    const configPath = path.join(dir, 'sentinel.yaml')
    fs.writeFileSync(configPath, [
      'sentinel: "1.0"',
      'project: demo',
      'version: "1.0.0"',
      'platforms:',
      '  ios:',
      '    path: apple/',
      '    language: swift',
      '    output:',
      '      tokens: apple/Tokens.swift',
      '  android:',
      '    path: android/',
      '    language: kotlin',
      '    output:',
      '      tokens: android/Tokens.kt',
    ].join('\n'))

    const config = loadConfig(configPath)
    expect(config.platforms.apple?.path).toBe('apple/')
    expect(config.platforms.google?.path).toBe('android/')
  })

  it('rejects mixed canonical and alias platform keys for ios', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-loader-'))
    const configPath = path.join(dir, 'sentinel.yaml')
    fs.writeFileSync(configPath, [
      'sentinel: "1.0"',
      'project: demo',
      'version: "1.0.0"',
      'platforms:',
      '  ios:',
      '    path: apple/',
      '    language: swift',
      '    output:',
      '      tokens: apple/AliasTokens.swift',
      '  apple:',
      '    path: legacy-apple/',
      '    language: swift',
      '    output:',
      '      tokens: legacy-apple/Tokens.swift',
    ].join('\n'))

    expect(() => loadConfig(configPath)).toThrow(/platforms\.ios and platforms\.apple are both declared/)
  })

  it('rejects mixed canonical and alias platform keys for android', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-loader-'))
    const configPath = path.join(dir, 'sentinel.yaml')
    fs.writeFileSync(configPath, [
      'sentinel: "1.0"',
      'project: demo',
      'version: "1.0.0"',
      'platforms:',
      '  android:',
      '    path: android/',
      '    language: kotlin',
      '    output:',
      '      tokens: android/AliasTokens.kt',
      '  google:',
      '    path: legacy-google/',
      '    language: kotlin',
      '    output:',
      '      tokens: legacy-google/Tokens.kt',
    ].join('\n'))

    expect(() => loadConfig(configPath)).toThrow(/platforms\.android and platforms\.google are both declared/)
  })

  it('rejects catalog devices with neither app_id nor app_ids', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-loader-'))
    const configPath = path.join(dir, 'sentinel.yaml')
    fs.writeFileSync(configPath, [
      'sentinel: "1.0"',
      'project: demo',
      'version: "1.0.0"',
      'platforms:',
      '  apple:',
      '    path: apple/',
      '    language: swift',
      '    output:',
      '      tokens: apple/Tokens.swift',
      'catalog:',
      '  output: catalog/',
      '  android:',
      '    phone:',
      '      slug: demo-android',
      '  screens:',
      '    - slug: home',
    ].join('\n'))

    expect(() => loadConfig(configPath)).toThrow(/declare app_id or app_ids/)
  })
})
