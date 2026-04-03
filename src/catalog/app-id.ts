import type { CatalogDeviceConfig } from './types.js'

export interface ResolvedCatalogAppId {
  appId: string | null
  variant: string | null
  error?: string
}

export function resolveCatalogAppId(
  device: CatalogDeviceConfig,
  requestedVariant?: string,
): ResolvedCatalogAppId {
  const variants = device.app_ids ?? {}
  const variantNames = Object.keys(variants)

  if (requestedVariant) {
    if (variants[requestedVariant]) {
      return { appId: variants[requestedVariant], variant: requestedVariant }
    }
    if (requestedVariant === 'default' && device.app_id) {
      return { appId: device.app_id, variant: 'default' }
    }

    const available = [
      ...(device.app_id ? ['default'] : []),
      ...variantNames,
    ]
    return {
      appId: null,
      variant: null,
      error: `Unknown app variant "${requestedVariant}". Available variants: ${available.join(', ')}`,
    }
  }

  if (device.app_id) {
    return { appId: device.app_id, variant: 'default' }
  }

  if (variants.default) {
    return { appId: variants.default, variant: 'default' }
  }

  if (variantNames.length === 1) {
    const [onlyVariant] = variantNames
    return { appId: variants[onlyVariant], variant: onlyVariant }
  }

  return {
    appId: null,
    variant: null,
    error: `Multiple app variants declared (${variantNames.join(', ')}). Re-run with --app-variant <name>.`,
  }
}
