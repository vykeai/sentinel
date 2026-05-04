import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ResolvedConfig } from '../../../config/types.js'
import {
  generateApiErrors,
  validateApiErrorsSchema,
} from '../../../schema/generators/shared/errors.js'

function makeConfig(): { config: ResolvedConfig; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-errors-test-'))
  const sentinelDir = path.join(dir, 'sentinel')
  const schemasDir = path.join(sentinelDir, 'schemas')
  const platformDir = path.join(schemasDir, 'platform')
  fs.mkdirSync(platformDir, { recursive: true })
  fs.writeFileSync(path.join(platformDir, 'errors.json'), JSON.stringify({
    $sentinel: '1.0',
    type: 'api-errors',
    version: '1.0.0',
    locales: ['en'],
    errors: [
      {
        code: 'AUTH_INVALID_CODE',
        httpStatus: 401,
        translationKey: 'apiErrors.auth.invalidCode',
        translations: {
          en: 'That code is not valid.',
        },
      },
    ],
  }))

  const config: ResolvedConfig = {
    sentinel: '1.0',
    project: 'testapp',
    version: '1.0.0',
    projectRoot: dir,
    sentinelDir,
    schemasDir,
    featuresDir: path.join(schemasDir, 'features'),
    designDir: path.join(schemasDir, 'design'),
    platformDir,
    modelsDir: path.join(schemasDir, 'models'),
    platforms: {
      api: {
        path: './api',
        language: 'typescript',
        output: {
          errors: path.join(dir, 'api-errors.ts'),
        },
      },
      apple: {
        path: './apple',
        language: 'swift',
        output: {
          errors: path.join(dir, 'ApiErrors.swift'),
        },
      },
      google: {
        path: './google',
        language: 'kotlin',
        output: {
          errors: path.join(dir, 'src', 'main', 'kotlin', 'com', 'testapp', 'ApiErrors.kt'),
        },
      },
      'web-public': {
        path: './web-public',
        language: 'typescript',
        output: {
          errors: path.join(dir, 'apiErrors.ts'),
        },
      },
    },
  }

  return { config, dir }
}

describe('api error generator', () => {
  let dir: string
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('generates API error catalogs for backend and client platforms', () => {
    const fixture = makeConfig()
    dir = fixture.dir

    generateApiErrors(fixture.config)

    const api = fs.readFileSync(fixture.config.platforms.api!.output!.errors!, 'utf-8')
    expect(api).toContain('export type ApiErrorCode')
    expect(api).toContain('AUTH_INVALID_CODE')
    expect(api).toContain('apiErrors.auth.invalidCode')

    const swift = fs.readFileSync(fixture.config.platforms.apple!.output.errors!, 'utf-8')
    expect(swift).toContain('public enum SentinelApiErrorCode')
    expect(swift).toContain('case authInvalidCode = "AUTH_INVALID_CODE"')

    const kotlin = fs.readFileSync(fixture.config.platforms.google!.output.errors!, 'utf-8')
    expect(kotlin).toContain('package com.testapp')
    expect(kotlin).toContain('AuthInvalidCode("AUTH_INVALID_CODE"')

    const webPublic = fs.readFileSync(fixture.config.platforms['web-public']!.output.errors!, 'utf-8')
    expect(webPublic).toContain('apiErrorCatalog')
  })

  it('rejects duplicate codes, duplicate keys, and missing locale values', () => {
    const errors = validateApiErrorsSchema('errors.json', {
      locales: ['en', 'es'],
      errors: [
        {
          code: 'AUTH_INVALID_CODE',
          httpStatus: 401,
          translationKey: 'apiErrors.auth.invalidCode',
          translations: { en: 'Invalid.' },
        },
        {
          code: 'AUTH_INVALID_CODE',
          httpStatus: 700,
          translationKey: 'apiErrors.auth.invalidCode',
          translations: { en: 'Invalid again.', es: 'No valido.' },
        },
      ],
    })

    expect(errors).toContain("errors.json: errors[0]: missing translation for locale 'es'")
    expect(errors).toContain("errors.json: errors[1]: duplicate code 'AUTH_INVALID_CODE'")
    expect(errors).toContain('errors.json: errors[1]: httpStatus must be an integer HTTP status')
    expect(errors).toContain("errors.json: errors[1]: duplicate translationKey 'apiErrors.auth.invalidCode'")
  })
})
