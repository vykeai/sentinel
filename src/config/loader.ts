import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import type {
  CatalogConfig,
  CatalogDeviceDef,
  ResolvedConfig,
  SentinelConfig,
  SentinelConfigFile,
  SentinelInputPlatformMap,
  SentinelPlatformMap,
} from './types.js'

const CONFIG_FILES = ['sentinel.yaml', 'sentinel.yml', 'sentinel.json']

export function findConfigFile(startDir: string): string | null {
  let dir = startDir
  while (true) {
    for (const name of CONFIG_FILES) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function loadConfig(configPath?: string): ResolvedConfig {
  const cwd = process.cwd()
  const filePath = configPath ?? findConfigFile(cwd)

  if (!filePath) {
    throw new Error(
      `No sentinel.yaml found. Run "sentinel init" to create one, or run from a project root.`
    )
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const ext = path.extname(filePath)
  const configFile = (ext === '.json' ? JSON.parse(raw) : yaml.load(raw)) as SentinelConfigFile
  const config = normalizeConfig(configFile, filePath)

  validateConfig(config, filePath)

  const projectRoot = path.dirname(filePath)
  const location = config.location ?? './sentinel'
  const sentinelDir = path.resolve(projectRoot, location)
  const schemasDir = path.join(sentinelDir, 'schemas')

  return {
    ...config,
    projectRoot,
    sentinelDir,
    schemasDir,
    featuresDir: path.join(schemasDir, 'features'),
    designDir: path.join(schemasDir, 'design'),
    platformDir: path.join(schemasDir, 'platform'),
    modelsDir: path.join(schemasDir, 'models'),
  }
}

function normalizeConfig(configFile: SentinelConfigFile, filePath: string): SentinelConfig {
  return {
    ...configFile,
    platforms: normalizePlatformAliases(configFile.platforms, filePath),
  }
}

function normalizePlatformAliases(platforms: SentinelInputPlatformMap | undefined, filePath: string): SentinelPlatformMap {
  if (!platforms) return {}

  if (platforms.apple && platforms.ios) {
    throw new Error(
      `Invalid sentinel.yaml at ${filePath}:\n  • platforms.ios and platforms.apple are both declared — choose one (prefer ios)`
    )
  }

  if (platforms.google && platforms.android) {
    throw new Error(
      `Invalid sentinel.yaml at ${filePath}:\n  • platforms.android and platforms.google are both declared — choose one (prefer android)`
    )
  }

  const normalized: SentinelPlatformMap = {}

  if (platforms.api) normalized.api = platforms.api
  if (platforms.ios ?? platforms.apple) normalized.apple = platforms.ios ?? platforms.apple
  if (platforms.android ?? platforms.google) normalized.google = platforms.android ?? platforms.google
  if (platforms.web) normalized.web = platforms.web
  if (platforms['web-admin']) normalized['web-admin'] = platforms['web-admin']
  if (platforms.desktop) normalized.desktop = platforms.desktop

  return normalized
}

function validateConfig(config: SentinelConfig, filePath: string): void {
  const errors: string[] = []

  if (!config.sentinel) errors.push('Missing required field: sentinel (version)')
  if (!config.project) errors.push('Missing required field: project')
  if (!config.version) errors.push('Missing required field: version')
  if ((!config.platforms || Object.keys(config.platforms).length === 0) && !config.quality) {
    errors.push('Missing required field: platforms (must declare at least one) or quality')
  }

  validateCatalogConfig(config.catalog, errors)

  if (errors.length > 0) {
    throw new Error(
      `Invalid sentinel.yaml at ${filePath}:\n${errors.map(e => `  • ${e}`).join('\n')}`
    )
  }
}

function validateCatalogConfig(catalog: CatalogConfig | undefined, errors: string[]): void {
  if (!catalog) return

  const osKeys = ['ios18', 'ios26', 'android', 'watchos', 'tvos'] as const
  for (const osKey of osKeys) {
    const osConfig = catalog[osKey]
    if (!osConfig) continue

    for (const [deviceKey, device] of Object.entries(osConfig) as [string, CatalogDeviceDef | undefined][]) {
      if (!device) continue
      const hasDefaultAppId = typeof device.app_id === 'string' && device.app_id.trim().length > 0
      const variantEntries = Object.entries(device.app_ids ?? {})
      const hasVariantAppIds = variantEntries.length > 0

      if (!hasDefaultAppId && !hasVariantAppIds) {
        errors.push(`catalog.${osKey}.${deviceKey}: declare app_id or app_ids`)
      }

      if (device.app_ids && !hasVariantAppIds) {
        errors.push(`catalog.${osKey}.${deviceKey}: app_ids must contain at least one variant`)
      }

      for (const [variant, appId] of variantEntries) {
        if (!variant.trim()) {
          errors.push(`catalog.${osKey}.${deviceKey}: app_ids contains an empty variant key`)
        }
        if (typeof appId !== 'string' || appId.trim().length === 0) {
          errors.push(`catalog.${osKey}.${deviceKey}: app_ids.${variant} must be a non-empty string`)
        }
      }
    }
  }
}

// ─── Sentinel Directory Structure ─────────────────────────────────────────────
// These paths are hardcoded — projects do not configure them.

export function getSentinelPaths(sentinelDir: string) {
  return {
    root:         sentinelDir,
    schemas:      path.join(sentinelDir, 'schemas'),
    features:     path.join(sentinelDir, 'schemas', 'features'),
    design:       path.join(sentinelDir, 'schemas', 'design'),
    platform:     path.join(sentinelDir, 'schemas', 'platform'),
    models:       path.join(sentinelDir, 'schemas', 'models'),
    chaos:        path.join(sentinelDir, 'chaos'),
    flows: {
      root:       path.join(sentinelDir, 'flows'),
      maestro:    path.join(sentinelDir, 'flows', 'maestro'),
      playwright: path.join(sentinelDir, 'flows', 'playwright'),
    },
    visual: {
      root:       path.join(sentinelDir, 'visual'),
      baselines:  path.join(sentinelDir, 'visual', 'baselines'),
    },
    perf:         path.join(sentinelDir, 'perf'),
  }
}

export function ensureSentinelDir(sentinelDir: string): void {
  const paths = getSentinelPaths(sentinelDir)
  const dirs = [
    paths.schemas,
    paths.features,
    paths.design,
    paths.platform,
    paths.models,
    paths.chaos,
    paths.flows.root,
    paths.flows.maestro,
    paths.flows.playwright,
    paths.visual.root,
    paths.visual.baselines,
    paths.perf,
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
