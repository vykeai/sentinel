import chalk from 'chalk'
import { findConfigFile, loadConfig } from '../config/loader.js'
import {
  buildAtlasImportSummary,
  buildAtlasMigrationPlan,
  buildLegacyAtlasExport,
  readJsonFixture,
  validateAtlasFixtureSet,
  validateAtlasManifestFixture,
  validateAtlasSessionCaptureIndex,
  writeJsonFile,
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
} from '../catalog/atlas-compat.js'

type AtlasCommand = 'atlas:import' | 'atlas:export' | 'atlas:migrate'

function getArgs() {
  return process.argv.slice(3)
}

function getFlagValue(name: string): string | undefined {
  const args = getArgs()
  return args.find((_, index) => args[index - 1] === `--${name}`)
}

function hasFlag(name: string): boolean {
  return getArgs().includes(`--${name}`)
}

function usage(command: AtlasCommand): string {
  switch (command) {
    case 'atlas:import':
      return 'Usage: sentinel atlas:import --atlas-manifest <file> [--session-index <file>] [--json]'
    case 'atlas:export':
      return 'Usage: sentinel atlas:export [--output <file>] [--json]'
    case 'atlas:migrate':
      return 'Usage: sentinel atlas:migrate [--atlas-manifest <file>] [--session-index <file>] [--write <file>] [--json]'
  }
}

function maybeLoadSessionIndex(): AtlasSessionCaptureIndex | undefined {
  const sessionIndexPath = getFlagValue('session-index')
  if (!sessionIndexPath) return undefined
  const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>(sessionIndexPath)
  validateAtlasSessionCaptureIndex(sessionIndex, sessionIndexPath)
  return sessionIndex
}

export function cmdAtlasImport(): void {
  const manifestPath = getFlagValue('atlas-manifest')
  if (!manifestPath) {
    console.error(usage('atlas:import'))
    process.exit(1)
  }

  const manifest = readJsonFixture<AtlasManifestFixture>(manifestPath)
  validateAtlasManifestFixture(manifest, manifestPath)
  const sessionIndex = maybeLoadSessionIndex()
  if (sessionIndex) validateAtlasFixtureSet(manifest, sessionIndex, 'atlas:import')
  const summary = buildAtlasImportSummary(manifest, sessionIndex)

  if (hasFlag('json')) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    return
  }

  console.log(chalk.bold('\n  Atlas import contract\n'))
  console.log(`  manifest: ${manifest.metadata.manifestId} (${summary.manifest.surfaces} surfaces)`)
  if (summary.sessionIndex) {
    console.log(`  session captures: ${summary.sessionIndex.captures} (${summary.sessionIndex.captured} captured, ${summary.sessionIndex.missing} missing, ${summary.sessionIndex.failed} failed)`)
  }
  if (summary.reviewContext) {
    console.log(`  review context: ${summary.reviewContext.sources} source${summary.reviewContext.sources === 1 ? '' : 's'}, ${summary.reviewContext.bindings} binding${summary.reviewContext.bindings === 1 ? '' : 's'}`)
  }
  console.log(chalk.dim('\n  Sentinel transforms'))
  summary.transformed.forEach((item) => console.log(`    - ${item}`))
  console.log(chalk.dim('\n  Sentinel preserves'))
  summary.preserved.forEach((item) => console.log(`    - ${item}`))
  console.log(chalk.dim('\n  Atlas still owns'))
  summary.atlasOwned.forEach((item) => console.log(`    - ${item}`))
}

export function cmdAtlasExport(): void {
  const config = loadConfig()
  if (!config.catalog) {
    console.error('No catalog: section in sentinel.yaml')
    process.exit(1)
  }

  const exportPreview = buildLegacyAtlasExport(config.catalog)
  const outputPath = getFlagValue('output')
  if (outputPath) writeJsonFile(outputPath, exportPreview)

  if (hasFlag('json')) {
    process.stdout.write(JSON.stringify(exportPreview, null, 2) + '\n')
    return
  }

  console.log(chalk.bold('\n  Atlas export contract\n'))
  console.log(`  legacy screens: ${exportPreview.legacy.screens}`)
  console.log(`  compatibility surfaces: ${exportPreview.surfaces.length}`)
  if (outputPath) console.log(`  wrote: ${outputPath}`)
  console.log(chalk.dim('\n  Atlas still owns'))
  exportPreview.atlasOwned.forEach((item) => console.log(`    - ${item}`))
}

export function cmdAtlasMigrate(): void {
  const configPath = findConfigFile(process.cwd())
  const config = configPath ? loadConfig(configPath) : null
  const manifestPath = getFlagValue('atlas-manifest')
  const manifest = manifestPath ? readJsonFixture<AtlasManifestFixture>(manifestPath) : undefined
  if (manifest && manifestPath) validateAtlasManifestFixture(manifest, manifestPath)
  const sessionIndex = manifest ? maybeLoadSessionIndex() : undefined
  if (manifest && sessionIndex) validateAtlasFixtureSet(manifest, sessionIndex, 'atlas:migrate')

  if (!config?.catalog && !manifest) {
    console.error(usage('atlas:migrate'))
    process.exit(1)
  }

  const plan = buildAtlasMigrationPlan(config?.catalog, manifest, sessionIndex)
  const writePath = getFlagValue('write')
  if (writePath) writeJsonFile(writePath, plan)

  if (hasFlag('json')) {
    process.stdout.write(JSON.stringify(plan, null, 2) + '\n')
    return
  }

  console.log(chalk.bold('\n  Atlas migration contract\n'))
  if (plan.legacyExport) {
    console.log(`  legacy export surfaces: ${plan.legacyExport.surfaces.length}`)
  }
  if (plan.atlasImport) {
    console.log(`  atlas manifest surfaces: ${plan.atlasImport.manifest.surfaces}`)
  }
  if (writePath) console.log(`  wrote: ${writePath}`)
  console.log(chalk.dim('\n  Transforms'))
  plan.transformed.forEach((item) => console.log(`    - ${item}`))
  console.log(chalk.dim('\n  Preserves'))
  plan.preserved.forEach((item) => console.log(`    - ${item}`))
  console.log(chalk.dim('\n  Atlas still owns'))
  plan.atlasOwned.forEach((item) => console.log(`    - ${item}`))
}
