// ─── Expected shots builder ─────────────────────────────────────────────────
// Single source of truth for all expected screenshot filenames.
// Used by capture, validate, and html generation.

import type {
  CatalogConfig, CatalogOSKey, CatalogDeviceType, CatalogVariant, ExpectedShot,
} from './types.js'
import { ALL_OS_KEYS } from './types.js'

function variantsFor(os: CatalogOSKey, glossy: boolean): CatalogVariant[] {
  const base: CatalogVariant[] = ['light', 'dark']
  if (os === 'ios26' && glossy) base.push('glossy-light', 'glossy-dark')
  return base
}

export function buildExpectedShots(config: CatalogConfig): ExpectedShot[] {
  const shots: ExpectedShot[] = []

  for (const screen of config.screens) {
    const scrollPositions = 1 + (screen.scroll_steps ?? 0)

    for (const os of ALL_OS_KEYS) {
      const osConfig = config[os]
      if (!osConfig) continue

      for (const [deviceType, deviceCfg] of Object.entries(osConfig) as [CatalogDeviceType, NonNullable<typeof osConfig[CatalogDeviceType]>][]) {
        if (!deviceCfg) continue
        const variants = variantsFor(os, !!deviceCfg.glossy)

        for (const variant of variants) {
          for (let scroll = 1; scroll <= scrollPositions; scroll++) {
            const scrollSuffix = scrollPositions > 1 ? `-scroll${scroll}` : ''
            const filename = `${screen.slug}-${os}-${deviceType}-${variant}${scrollSuffix}.png`
            shots.push({ filename, screen: screen.slug, os, device: deviceType, variant, scroll })
          }
        }
      }
    }
  }

  return shots
}

// Enumerate all active (os, device) pairs in a config
export function activeOSDevicePairs(config: CatalogConfig): Array<{ os: CatalogOSKey; device: CatalogDeviceType }> {
  const pairs: Array<{ os: CatalogOSKey; device: CatalogDeviceType }> = []
  for (const os of ALL_OS_KEYS) {
    const osConfig = config[os]
    if (!osConfig) continue
    for (const device of Object.keys(osConfig) as CatalogDeviceType[]) {
      if (osConfig[device]) pairs.push({ os, device })
    }
  }
  return pairs
}
