import { describe, expect, it } from 'vitest'
import { legacyCatalogToSurfaces, legacyScreenToSurface } from '../../catalog/adapter.js'

describe('legacyScreenToSurface', () => {
  it('maps a legacy screen with a flow onto a default Atlas-style scenario', () => {
    const surface = legacyScreenToSurface({
      slug: 'main-discover',
      name: 'Main Discover',
      flow: 'sentinel/flows/catalog/main-discover.yaml',
      scroll_steps: 2,
    })

    expect(surface).toEqual({
      id: 'main-discover',
      name: 'Main Discover',
      kind: 'screen',
      path: {
        segments: [{ kind: 'screen', id: 'main-discover', label: 'Main Discover' }],
        display: 'main-discover',
      },
      scenarios: [
        {
          id: 'default',
          name: 'Default',
          entry: {
            strategy: 'maestro_flow',
            flow: 'sentinel/flows/catalog/main-discover.yaml',
          },
          legacy: {
            slug: 'main-discover',
            flow: 'sentinel/flows/catalog/main-discover.yaml',
            scroll_steps: 2,
          },
        },
      ],
      legacy: {
        slug: 'main-discover',
        flow: 'sentinel/flows/catalog/main-discover.yaml',
        scroll_steps: 2,
      },
    })
  })

  it('maps a legacy screen without a flow to manual upload', () => {
    const surface = legacyScreenToSurface({
      slug: 'profile',
    })

    expect(surface.scenarios[0]?.entry).toEqual({
      strategy: 'manual_upload',
    })
  })
})

describe('legacyCatalogToSurfaces', () => {
  it('maps every legacy catalog screen into a surface', () => {
    const surfaces = legacyCatalogToSurfaces({
      output: 'catalog/',
      screens: [
        { slug: 'sign-in', flow: 'sentinel/flows/catalog/sign-in.yaml' },
        { slug: 'profile' },
      ],
    })

    expect(surfaces.map((surface) => surface.id)).toEqual(['sign-in', 'profile'])
    expect(surfaces[1]?.scenarios[0]?.entry.strategy).toBe('manual_upload')
  })
})
