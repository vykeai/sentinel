import type {
  CatalogConfig,
  CatalogScreen,
  CatalogSurface,
  CatalogSurfaceScenario,
} from './types.js'

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

export function legacyScreenToSurface(screen: CatalogScreen): CatalogSurface {
  const scenario: CatalogSurfaceScenario = {
    id: 'default',
    name: 'Default',
    entry: screen.flow
      ? { strategy: 'maestro_flow', flow: screen.flow }
      : { strategy: 'manual_upload' },
    legacy: {
      slug: screen.slug,
      flow: screen.flow,
      scroll_steps: screen.scroll_steps,
    },
  }

  return {
    id: screen.slug,
    name: screen.name ?? titleFromSlug(screen.slug),
    kind: 'screen',
    path: {
      segments: [{ kind: 'screen', id: screen.slug, label: screen.name }],
      display: screen.slug,
    },
    scenarios: [scenario],
    legacy: {
      slug: screen.slug,
      flow: screen.flow,
      scroll_steps: screen.scroll_steps,
    },
  }
}

export function legacyCatalogToSurfaces(config: CatalogConfig): CatalogSurface[] {
  return config.screens.map(legacyScreenToSurface)
}
