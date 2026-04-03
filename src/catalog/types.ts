// ─── Catalog Types ─────────────────────────────────────────────────────────────
// These map to the `catalog:` section in sentinel.yaml today, while also defining
// the Atlas-era adapter boundary Sentinel consumes internally.

// OS version keys — what OS the screenshot was taken on
export type CatalogOSKey = 'ios18' | 'ios26' | 'android' | 'watchos' | 'tvos'

// Device form factor — what hardware the screenshot was taken on
export type CatalogDeviceType = 'iphone' | 'ipad' | 'watch' | 'phone' | 'tablet' | 'tv'

// Appearance variant
export type CatalogVariant = 'light' | 'dark' | 'glossy-light' | 'glossy-dark'

// Config for a single device on a single OS
export interface CatalogDeviceConfig {
  slug: string        // simemu slug for this device (e.g. "fitkind-ios", "fitkind-ipad")
  app_id?: string     // default bundle ID / Android package (e.g. "com.fitkind.app")
  app_ids?: Record<string, string> // named app variants, e.g. { dev: "app.fitkind.dev", prod: "app.fitkind" }
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
  screens: CatalogScreen[] // legacy flat contract; Atlas surfaces map through the adapter types below
}

// ─── Atlas adapter boundary ──────────────────────────────────────────────────

export type CatalogSurfaceKind =
  | 'screen'
  | 'modal'
  | 'sheet'
  | 'alert'
  | 'overlay'
  | 'paywall'
  | 'admin-surface'
  | 'widget'

export type CatalogPathSegmentKind =
  | 'stack'
  | 'tab'
  | 'screen'
  | 'modal'
  | 'sheet'
  | 'alert'
  | 'overlay'
  | 'menu'
  | 'surface'
  | 'admin'

export interface CatalogPathSegment {
  kind: CatalogPathSegmentKind
  id: string
  label?: string
}

export interface CatalogPath {
  segments: CatalogPathSegment[]
  display?: string
}

export type CatalogEntryStrategy =
  | 'launch_args'
  | 'deeplink'
  | 'maestro_flow'
  | 'manual_upload'

export interface CatalogEntryDefinition {
  strategy: CatalogEntryStrategy
  flow?: string
  deeplink?: string
  args?: string[]
}

export interface CatalogCaptureTarget {
  os: CatalogOSKey
  device: CatalogDeviceType
  variant?: CatalogVariant
  appVariant?: string
}

export interface CatalogLegacyScreenBinding {
  slug: string
  flow?: string
  scroll_steps?: number
}

export interface CatalogSurfaceScenario {
  id: string
  name?: string
  entry: CatalogEntryDefinition
  targets?: CatalogCaptureTarget[]
  legacy?: CatalogLegacyScreenBinding
}

export interface CatalogSurface {
  id: string
  name?: string
  kind: CatalogSurfaceKind
  path: CatalogPath
  scenarios: CatalogSurfaceScenario[]
  legacy?: CatalogLegacyScreenBinding
}

// ─── Internal types ──────────────────────────────────────────────────────────

export interface ExpectedShot {
  filename: string          // e.g. "sign-in-ios18-iphone-light.png"
  screen: string            // legacy screen slug compatibility field
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
