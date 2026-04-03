import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import {
  readJsonFixture,
  validateAtlasFixtureSet,
  validateAtlasManifestFixture,
  validateAtlasSessionCaptureIndex,
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
} from '../catalog/atlas-compat.js'

export interface DoctorIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  fix?: string
}

export interface DoctorResult {
  passed: boolean
  fixed: boolean
  issues: DoctorIssue[]
}

interface DoctorOptions {
  fix?: boolean
  atlasManifestPath?: string
  sessionIndexPath?: string
  brandieRoot?: string
}

interface PackageJsonShape {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

interface BrandieReviewPackIndexEntry {
  packId?: unknown
  packPath?: unknown
}

interface BrandieReviewAssetsContract {
  reviewPacks?: BrandieReviewPackIndexEntry[]
}

interface BrandieReviewScenarioOverride {
  atlasSurfaceId?: unknown
}

interface BrandieReviewScenarioFamily {
  scenarioOverrides?: BrandieReviewScenarioOverride[]
}

interface BrandieReviewPack {
  packId?: unknown
  scenarioFamilies?: BrandieReviewScenarioFamily[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T
}

function resolveDoctorPath(baseRoot: string, candidate: string): string {
  return path.resolve(baseRoot, candidate)
}

function collectPackAtlasNamespaceRefs(pack: BrandieReviewPack): Set<string> {
  const namespaceRefs = new Set<string>()

  for (const family of pack.scenarioFamilies ?? []) {
    if (!isRecord(family) || !Array.isArray(family.scenarioOverrides)) continue
    for (const override of family.scenarioOverrides) {
      if (!isRecord(override) || typeof override.atlasSurfaceId !== 'string') continue
      if (override.atlasSurfaceId.trim().length === 0) continue
      namespaceRefs.add(override.atlasSurfaceId)
    }
  }

  return namespaceRefs
}

function collectBrandieReviewIssues(
  manifest: AtlasManifestFixture,
  projectRoot: string,
  brandieRootOverride?: string,
): DoctorIssue[] {
  if (!manifest.reviewContext) return []

  const issues: DoctorIssue[] = []
  const reviewContext = manifest.reviewContext
  const reviewBindingsBySource = new Map<string, typeof reviewContext.bindings>()
  const brandieRoot = resolveDoctorPath(projectRoot, brandieRootOverride ?? '.')

  for (const binding of reviewContext.bindings) {
    const bindings = reviewBindingsBySource.get(binding.sourceId) ?? []
    bindings.push(binding)
    reviewBindingsBySource.set(binding.sourceId, bindings)
  }

  for (const source of reviewContext.sources) {
    const contractPath = resolveDoctorPath(brandieRoot, source.contractPath)
    const packPath = resolveDoctorPath(brandieRoot, source.packPath)
    let contract: BrandieReviewAssetsContract | null = null
    let pack: BrandieReviewPack | null = null

    if (!existsSync(contractPath)) {
      issues.push({
        severity: 'warning',
        code: 'brandie-contract-missing',
        message: `Brandie export missing: Atlas review source "${source.id}" points at "${source.contractPath}", but Sentinel could not find that Brandie contract`,
        fix: `Pass --brandie-root <brandie-repo> or restore ${source.contractPath} so Sentinel can verify the Brandie export referenced by Atlas`,
      })
    } else {
      try {
        contract = parseJsonFile<BrandieReviewAssetsContract>(contractPath)
      } catch (error) {
        issues.push({
          severity: 'warning',
          code: 'brandie-contract-invalid',
          message: `Brandie export invalid: Sentinel could not parse "${source.contractPath}" for Atlas review source "${source.id}" (${error instanceof Error ? error.message : String(error)})`,
          fix: `Repair ${source.contractPath} in Brandie or regenerate the review-assets export before rerunning Sentinel Doctor`,
        })
      }
    }

    if (!existsSync(packPath)) {
      issues.push({
        severity: 'warning',
        code: 'brandie-pack-missing',
        message: `Brandie export missing: Atlas review source "${source.id}" points at pack "${source.packPath}", but Sentinel could not find that Brandie pack`,
        fix: `Pass --brandie-root <brandie-repo> or restore ${source.packPath} so Sentinel can inspect the Brandie review pack Atlas references`,
      })
    } else {
      try {
        pack = parseJsonFile<BrandieReviewPack>(packPath)
      } catch (error) {
        issues.push({
          severity: 'warning',
          code: 'brandie-pack-invalid',
          message: `Brandie export invalid: Sentinel could not parse "${source.packPath}" for Atlas review source "${source.id}" (${error instanceof Error ? error.message : String(error)})`,
          fix: `Repair ${source.packPath} in Brandie or regenerate the product review pack before rerunning Sentinel Doctor`,
        })
      }
    }

    if (contract) {
      if (!Array.isArray(contract.reviewPacks)) {
        issues.push({
          severity: 'warning',
          code: 'brandie-contract-invalid',
          message: `Brandie export invalid: "${source.contractPath}" does not expose a reviewPacks index Sentinel can use for Atlas review source "${source.id}"`,
          fix: `Regenerate ${source.contractPath} so reviewPacks[] indexes Brandie review packs for Atlas consumers`,
        })
      } else {
        const indexedPack = contract.reviewPacks.find((entry) => isRecord(entry) && entry.packId === source.packId)

        if (!indexedPack) {
          issues.push({
            severity: 'warning',
            code: 'brandie-pack-reference-stale',
            message: `Brandie export drift: "${source.contractPath}" does not index packId "${source.packId}" for Atlas review source "${source.id}"`,
            fix: `Regenerate Brandie review-assets so ${source.packId} appears in reviewPacks[], or update Atlas reviewContext.sources[] if the pack id changed`,
          })
        } else if (typeof indexedPack.packPath === 'string' && indexedPack.packPath !== source.packPath) {
          issues.push({
            severity: 'warning',
            code: 'brandie-pack-path-stale',
            message: `Sentinel consumption drift: Atlas review source "${source.id}" expects packPath "${source.packPath}", but Brandie indexes "${indexedPack.packPath}" for packId "${source.packId}"`,
            fix: `Update Atlas reviewContext.sources[].packPath to ${indexedPack.packPath}, or regenerate Brandie if the contract index is stale`,
          })
        }
      }
    }

    if (pack) {
      if (typeof pack.packId !== 'string' || pack.packId.trim().length === 0 || !Array.isArray(pack.scenarioFamilies)) {
        issues.push({
          severity: 'warning',
          code: 'brandie-pack-invalid',
          message: `Brandie export invalid: "${source.packPath}" is missing the packId or scenarioFamilies data Sentinel needs for Atlas review source "${source.id}"`,
          fix: `Regenerate ${source.packPath} from Brandie so it includes packId plus scenarioFamilies[].scenarioOverrides[]`,
        })
        continue
      }

      if (pack.packId !== source.packId) {
        issues.push({
          severity: 'warning',
          code: 'brandie-pack-id-stale',
          message: `Sentinel consumption drift: Atlas review source "${source.id}" expects packId "${source.packId}", but "${source.packPath}" declares "${pack.packId}"`,
          fix: `Update Atlas reviewContext.sources[].packId to ${pack.packId}, or regenerate ${source.packPath} if Brandie exported the wrong pack id`,
        })
      }

      const exportedNamespaceRefs = collectPackAtlasNamespaceRefs(pack)
      for (const binding of reviewBindingsBySource.get(source.id) ?? []) {
        if (exportedNamespaceRefs.has(binding.atlasNamespaceRef)) continue
        issues.push({
          severity: 'warning',
          code: 'brandie-binding-unresolved',
          message: `Atlas binding drift: review binding "${binding.id}" points at "${binding.atlasNamespaceRef}", but "${source.packPath}" does not export that Brandie override`,
          fix: `Update Atlas reviewContext.bindings[] to a current Brandie atlasNamespaceRef, or regenerate ${source.packPath} so the expected override exists`,
        })
      }
    }
  }

  return issues
}

function loadPackageJson(projectRoot: string): { path: string; pkg: PackageJsonShape | null } {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  if (!existsSync(packageJsonPath)) return { path: packageJsonPath, pkg: null }
  return {
    path: packageJsonPath,
    pkg: JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonShape,
  }
}

function collectIssues(projectRoot: string, packageName: string, options: DoctorOptions = {}): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const { path: packageJsonPath, pkg } = loadPackageJson(projectRoot)

  if (!pkg) {
    issues.push({
      severity: 'warning',
      code: 'package-json-missing',
      message: 'No package.json found at the project root',
      fix: 'Create package.json or install Sentinel through your package manager workspace root',
    })
  } else {
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    }
    const scripts = pkg.scripts ?? {}

    for (const [name, command] of Object.entries(scripts)) {
      if (/(^|\s)(node\s+)?\/[^\s'"]*sentinel(?:\/|\b)/.test(command)) {
        issues.push({
          severity: 'error',
          code: 'absolute-sentinel-script',
          message: `Script "${name}" hardcodes an absolute Sentinel path`,
          fix: `Rewrite "${name}" to use the local bin, e.g. "sentinel ${command.split(' ').slice(-1).join(' ')}"`,
        })
      }

      if (/\bnpx\s+(--no-install\s+)?sentinel\b/.test(command) && !command.includes('--no-install')) {
        issues.push({
          severity: 'warning',
          code: 'npx-install-risk',
          message: `Script "${name}" uses "npx sentinel" without --no-install`,
          fix: 'In package.json scripts, prefer the bare "sentinel" bin; in docs/shell usage, prefer "npx --no-install sentinel"',
        })
      }
    }

    if (!deps[packageName]) {
      issues.push({
        severity: 'warning',
        code: 'sentinel-dependency-missing',
        message: `${packageName} is not declared in dependencies or devDependencies`,
        fix: `Install ${packageName} as a local dependency so every machine resolves the same Sentinel CLI`,
      })
    }

    if (deps['sentinel']) {
      issues.push({
        severity: 'warning',
        code: 'legacy-package-name',
        message: 'Legacy "sentinel" package reference found',
        fix: `Migrate to ${packageName} to avoid npm package-name collisions`,
      })
    }

    if (!existsSync(path.join(projectRoot, 'node_modules', '.bin', 'sentinel'))) {
      issues.push({
        severity: 'warning',
        code: 'local-bin-missing',
        message: 'node_modules/.bin/sentinel is missing',
        fix: 'Run your package manager install so the local Sentinel bin is available to scripts and CI',
      })
    }
  }

  if (!existsSync(path.join(projectRoot, 'sentinel.yaml'))
    && !existsSync(path.join(projectRoot, 'sentinel.yml'))
    && !existsSync(path.join(projectRoot, 'sentinel.json'))) {
    issues.push({
      severity: 'warning',
      code: 'config-missing',
      message: 'No sentinel.yaml found at the project root',
      fix: 'Copy sentinel.yaml.example into the repo root and configure your platform outputs',
    })
  }

  if (options.sessionIndexPath && !options.atlasManifestPath) {
    issues.push({
      severity: 'error',
      code: 'atlas-session-without-manifest',
      message: 'An Atlas session index was provided without an Atlas manifest',
      fix: 'Pass --atlas-manifest alongside --session-index so Sentinel can validate the fixture set coherently',
    })
  }

  if (options.atlasManifestPath) {
    let manifest: AtlasManifestFixture | null = null
    try {
      manifest = readJsonFixture<AtlasManifestFixture>(options.atlasManifestPath)
      validateAtlasManifestFixture(manifest, options.atlasManifestPath)

      if (!options.sessionIndexPath) {
        issues.push({
          severity: 'warning',
          code: 'atlas-session-index-missing',
          message: 'An Atlas manifest was provided without a session index',
          fix: 'Pass --session-index to let Sentinel validate capture coverage instead of only manifest structure',
        })
      } else {
        const sessionIndex = readJsonFixture<AtlasSessionCaptureIndex>(options.sessionIndexPath)
        validateAtlasSessionCaptureIndex(sessionIndex, options.sessionIndexPath)
        validateAtlasFixtureSet(manifest, sessionIndex, 'doctor atlas fixture set')
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'atlas-fixture-invalid',
        message: error instanceof Error ? error.message : String(error),
        fix: 'Repair the Atlas manifest/session pair so Sentinel can validate the migration inputs cleanly',
      })
    }

    if (manifest) {
      issues.push(...collectBrandieReviewIssues(manifest, projectRoot, options.brandieRoot))
    }

    const scripts = pkg?.scripts ?? {}
    const usesCatalogScripts = Object.values(scripts).some((command) => /\bcatalog:(validate|index)\b/.test(command))
    const atlasWiredScripts = Object.values(scripts).some((command) =>
      /\bcatalog:(validate|index)\b/.test(command) && command.includes('--atlas-manifest'),
    )

    if (usesCatalogScripts && !atlasWiredScripts) {
      issues.push({
        severity: 'warning',
        code: 'atlas-scripts-not-wired',
        message: 'Project scripts still call catalog:index or catalog:validate without Atlas flags',
        fix: 'Add --atlas-manifest (and usually --session-index) to the scripts that should exercise Atlas-backed review or validation',
      })
    }
  }

  if (!existsSync(packageJsonPath)) return issues
  return issues
}

function normalizeScript(command: string): string {
  return command
    .replace(/\bnpx\s+(--no-install\s+)?sentinel\b/g, 'sentinel')
    .replace(/(^|\s)(node\s+)?\/[^\s'"]*sentinel(?:\/[^\s'"]*)*/g, '$1sentinel')
    .replace(/\s+/g, ' ')
    .trim()
}

function applySafeFixes(projectRoot: string): boolean {
  const { path: packageJsonPath, pkg } = loadPackageJson(projectRoot)
  if (!pkg || !pkg.scripts) return false

  let changed = false
  for (const [name, command] of Object.entries(pkg.scripts)) {
    const normalized = normalizeScript(command)
    if (normalized !== command) {
      pkg.scripts[name] = normalized
      changed = true
    }
  }

  if (!changed) return false
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  return true
}

export function runDoctorCheck(
  projectRoot: string,
  packageName: string,
  options: DoctorOptions = {},
): DoctorResult {
  const fixed = options.fix ? applySafeFixes(projectRoot) : false
  const issues = collectIssues(projectRoot, packageName, options)

  return {
    passed: issues.every((issue) => issue.severity !== 'error'),
    fixed,
    issues,
  }
}
