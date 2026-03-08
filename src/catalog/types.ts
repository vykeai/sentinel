// ─── Catalog Types ─────────────────────────────────────────────────────────────
// These map to the `catalog:` section in sentinel.yaml.

// OS version keys — what OS the screenshot was taken on
export type CatalogOSKey = 'ios18' | 'ios26' | 'android' | 'watchos' | 'tvos'

// Device form factor — what hardware the screenshot was taken on
export type CatalogDeviceType = 'iphone' | 'ipad' | 'watch' | 'phone' | 'tablet' | 'tv'

// Appearance variant
export type CatalogVariant = 'light' | 'dark' | 'glossy-light' | 'glossy-dark'

// Config for a single device on a single OS
export interface CatalogDeviceConfig {
  slug: string        // simemu slug for this device (e.g. "fitkind-ios", "fitkind-ipad")
  app_id: string      // bundle ID / Android package (e.g. "com.fitkind.app")
  glossy?: boolean    // ios26 only — capture glossy-light + glossy-dark variants too
}

// Per-OS config: device type → device config
// Only declare device types the project actually supports
export type CatalogOSConfig = Partial<Record<CatalogDeviceType, CatalogDeviceConfig>>

export interface CatalogScreen {
  slug: string          // kebab-case, e.g. "sign-in", "library-home"
  name?: string         // human-readable label, e.g. "Sign In" (used in catalog index + registry output)
  flow?: string         // path to Maestro YAML relative to project root (optional — use catalog:upload if no flow)
  scroll_steps?: number // number of additional scroll positions to capture (0 = no scroll)
}

export interface CatalogConfig {
  output: string         // relative to project root, e.g. "catalog/"
  resize?: number        // longest dimension in px after capture. default: 1000
  ios18?: CatalogOSConfig
  ios26?: CatalogOSConfig
  android?: CatalogOSConfig
  watchos?: CatalogOSConfig
  tvos?: CatalogOSConfig
  screens: CatalogScreen[]
}

// ─── Internal types ──────────────────────────────────────────────────────────

export interface ExpectedShot {
  filename: string          // e.g. "sign-in-ios18-iphone-light.png"
  screen: string            // screen slug
  os: CatalogOSKey
  device: CatalogDeviceType
  variant: CatalogVariant
  scroll: number            // 1 = first view (no scroll), 2+ = after N-1 scrolls
}

export interface CaptureResult {
  shot: ExpectedShot
  success: boolean
  error?: string
  skipped?: boolean
}

// All OS keys in display order
export const ALL_OS_KEYS: CatalogOSKey[] = ['ios18', 'ios26', 'android', 'watchos', 'tvos']

// Human-readable labels
export const OS_LABELS: Record<CatalogOSKey, string> = {
  ios18: 'iOS 18',
  ios26: 'iOS 26',
  android: 'Android',
  watchos: 'watchOS',
  tvos: 'tvOS',
}

export const DEVICE_LABELS: Record<CatalogDeviceType, string> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  watch: 'Watch',
  phone: 'Phone',
  tablet: 'Tablet',
  tv: 'TV',
}

export const VARIANT_LABELS: Record<CatalogVariant, string> = {
  light: 'Light',
  dark: 'Dark',
  'glossy-light': 'Glossy Light',
  'glossy-dark': 'Glossy Dark',
}
