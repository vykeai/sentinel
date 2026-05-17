import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { findConfigFile, getSentinelPaths, loadConfig } from '../config/loader.js'
import type { ResolvedConfig, SentinelPlatformMap } from '../config/types.js'
import type { GateKind } from './gate-result.js'

export type SentinelDiscoveryStatus = 'configured' | 'not-configured'

export interface SentinelDiscoveryInput {
  path: string
  required: boolean
  exists: boolean
  description: string
}

export interface SentinelDiscoveryGate {
  kind: GateKind
  configured: boolean
  reason: string
  inputs: SentinelDiscoveryInput[]
  replayCommand: string | null
  automationRunnable: boolean
}

export interface SentinelDiscoveryResult {
  schemaVersion: 'sentinel.discovery.v1'
  producer: 'sentinel'
  status: SentinelDiscoveryStatus
  reason: string | null
  cwd: string
  projectRoot: string | null
  configPath: string | null
  project: string | null
  version: string | null
  sentinelDir: string | null
  platforms: string[]
  capabilities: string[]
  gates: SentinelDiscoveryGate[]
  generatedAt: string
}

const CAPABILITIES = [
  'sentinel.discovery.v1',
  'sentinel.gate-plan.v1',
  'sentinel.gate-result.v1',
  'sentinel.copy-validation.v1',
]

const AUTOMATION_RUNNABLE_GATES = new Set<GateKind>(['schema', 'contracts', 'mock', 'copy'])

export function discoverSentinelRepo(startDir = process.cwd()): SentinelDiscoveryResult {
  const configPath = findConfigFile(startDir)

  if (!configPath) {
    return {
      schemaVersion: 'sentinel.discovery.v1',
      producer: 'sentinel',
      status: 'not-configured',
      reason: 'sentinel-config-missing',
      cwd: startDir,
      projectRoot: null,
      configPath: null,
      project: null,
      version: null,
      sentinelDir: null,
      platforms: [],
      capabilities: CAPABILITIES,
      gates: buildUnconfiguredGates(),
      generatedAt: new Date().toISOString(),
    }
  }

  const config = loadConfig(configPath)

  return {
    schemaVersion: 'sentinel.discovery.v1',
    producer: 'sentinel',
    status: 'configured',
    reason: null,
    cwd: startDir,
    projectRoot: config.projectRoot,
    configPath,
    project: config.project,
    version: config.version,
    sentinelDir: config.sentinelDir,
    platforms: Object.keys(config.platforms),
    capabilities: CAPABILITIES,
    gates: buildConfiguredGates(config, configPath),
    generatedAt: new Date().toISOString(),
  }
}

function buildUnconfiguredGates(): SentinelDiscoveryGate[] {
  return gateKinds().map((kind) => ({
    kind,
    configured: false,
    reason: 'sentinel-config-missing',
    inputs: [],
    replayCommand: null,
    automationRunnable: AUTOMATION_RUNNABLE_GATES.has(kind),
  }))
}

function buildConfiguredGates(config: ResolvedConfig, configPath: string): SentinelDiscoveryGate[] {
  const paths = getSentinelPaths(config.sentinelDir)

  return [
    gate('schema', hasAnyFile(paths.schemas, ['.json']), 'schema-files-present', 'schema-files-missing', [
      input(paths.schemas, true, 'Sentinel schema root'),
      input(paths.design, false, 'Design token and string schemas'),
      input(paths.features, false, 'Feature and endpoint schemas'),
      input(paths.models, false, 'Shared model schemas'),
      input(paths.platform, false, 'Platform schemas such as navigation and mock config'),
    ]),
    gate('contracts', hasPlatform(config.platforms, 'api') || hasAnyFile(paths.features, ['.json']), 'api-platform-or-feature-schemas-present', 'api-platform-and-feature-schemas-missing', [
      input(paths.features, true, 'Feature endpoint schemas'),
      config.platforms.api?.openapi
        ? input(join(config.projectRoot, config.platforms.api.openapi), false, 'OpenAPI document')
        : input(paths.features, false, 'OpenAPI document not configured; endpoint schemas are used when present'),
    ]),
    gate('mock', existsSync(join(paths.platform, 'mock-config.json')), 'mock-config-present', 'mock-config-missing', [
      input(join(paths.platform, 'mock-config.json'), true, 'Mock fixture routing schema'),
      input(join(config.sentinelDir, 'fixtures'), true, 'Mock fixture JSON directory'),
    ]),
    gate('copy', true, 'diff-or-manifest-input-supported', 'sentinel-config-missing', [
      input('git diff or --diff-file', false, 'Changed user-facing strings from a git diff'),
      input('copy manifest', false, 'Optional manifest containing strings or files to validate'),
    ]),
    gate('catalog', Boolean(config.catalog), 'catalog-config-present', 'catalog-config-missing', [
      input(config.catalog ? join(config.projectRoot, config.catalog.output) : join(config.projectRoot, 'sentinel-catalog'), true, 'Catalog output directory'),
      input(paths.visual.baselines, false, 'Legacy visual baseline directory'),
    ]),
    gate('flow', hasAnyFile(paths.flows.root, ['.yaml', '.yml', '.ts', '.js']), 'flow-files-present', 'flow-files-missing', [
      input(paths.flows.maestro, false, 'Maestro flow directory'),
      input(paths.flows.playwright, false, 'Playwright flow directory'),
    ]),
    gate('visual', existsSync(paths.visual.baselines), 'visual-baselines-present', 'visual-baselines-missing', [
      input(paths.visual.baselines, true, 'Visual baseline directory'),
      input(paths.flows.root, false, 'Flow directory used to reach visual states'),
    ]),
    gate('chaos', Boolean(config.chaos), 'chaos-config-present', 'chaos-config-missing', [
      input(paths.chaos, false, 'Chaos scenario directory'),
    ]),
    gate('perf', hasAnyFile(paths.perf, ['.json', '.yaml', '.yml']) || Boolean(config.quality?.build), 'perf-inputs-present', 'perf-inputs-missing', [
      input(paths.perf, false, 'Performance budget directory'),
      input(config.quality?.build ?? 'quality.build', false, 'Optional build command used before perf checks'),
    ]),
    gate('doctor', true, 'sentinel-config-present', 'sentinel-config-missing', [
      input(configPath, true, 'Sentinel project config'),
    ]),
    gate('quality', Boolean(config.quality), 'quality-config-present', 'quality-config-missing', [
      input('quality.tests', false, 'Configured test command'),
      input('quality.typecheck', false, 'Configured typecheck command'),
      input('quality.lint', false, 'Configured lint command'),
      input('quality.build', false, 'Configured build command'),
    ]),
  ]
}

function gate(
  kind: GateKind,
  configured: boolean,
  configuredReason: string,
  unconfiguredReason: string,
  inputs: SentinelDiscoveryInput[]
): SentinelDiscoveryGate {
  const automationRunnable = AUTOMATION_RUNNABLE_GATES.has(kind)
  return {
    kind,
    configured,
    reason: configured ? configuredReason : unconfiguredReason,
    inputs,
    replayCommand: configured ? replayCommand(kind, automationRunnable) : null,
    automationRunnable,
  }
}

function replayCommand(kind: GateKind, automationRunnable: boolean): string {
  if (automationRunnable) return `sentinel gate:run --kind ${kind} --json`
  const legacyCommands: Record<GateKind, string> = {
    schema: 'sentinel gate:run --kind schema --json',
    contracts: 'sentinel gate:run --kind contracts --json',
    mock: 'sentinel gate:run --kind mock --json',
    catalog: 'sentinel catalog:validate',
    flow: 'sentinel flows',
    visual: 'sentinel visual',
    chaos: 'sentinel chaos',
    perf: 'sentinel perf',
    doctor: 'sentinel doctor --json',
    quality: 'sentinel quality:check --json',
    copy: 'sentinel gate:run --kind copy --json',
  }
  return legacyCommands[kind]
}

function input(path: string, required: boolean, description: string): SentinelDiscoveryInput {
  return {
    path,
    required,
    exists: isConfigKey(path) ? false : existsSync(path),
    description,
  }
}

function hasPlatform(platforms: SentinelPlatformMap, key: keyof SentinelPlatformMap): boolean {
  return Boolean(platforms[key])
}

function hasAnyFile(dir: string, extensions: string[]): boolean {
  if (!existsSync(dir)) return false

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && hasAnyFile(fullPath, extensions)) return true
    if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) return true
  }
  return false
}

function gateKinds(): GateKind[] {
  return ['schema', 'contracts', 'mock', 'copy', 'catalog', 'flow', 'visual', 'chaos', 'perf', 'doctor', 'quality']
}

function isConfigKey(path: string): boolean {
  return !path.startsWith('/') && !path.startsWith('.') && !path.includes('\\') && !path.includes('/')
}
