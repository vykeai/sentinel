import { describe, expect, it } from 'vitest'
import { resolveCatalogAppId } from '../../catalog/app-id.js'

describe('resolveCatalogAppId', () => {
  it('uses default app_id when no variant is requested', () => {
    const result = resolveCatalogAppId({
      slug: 'demo-ios',
      app_id: 'com.example.app',
    })

    expect(result).toEqual({
      appId: 'com.example.app',
      variant: 'default',
    })
  })

  it('resolves named variants from app_ids', () => {
    const result = resolveCatalogAppId({
      slug: 'demo-android',
      app_ids: {
        dev: 'app.example.dev',
        prod: 'app.example',
      },
    }, 'dev')

    expect(result).toEqual({
      appId: 'app.example.dev',
      variant: 'dev',
    })
  })

  it('requires --app-variant when multiple variants exist and no default is declared', () => {
    const result = resolveCatalogAppId({
      slug: 'demo-android',
      app_ids: {
        dev: 'app.example.dev',
        stage: 'app.example.stage',
      },
    })

    expect(result.appId).toBeNull()
    expect(result.error).toContain('--app-variant')
  })
})
