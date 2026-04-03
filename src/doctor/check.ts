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
}

interface PackageJsonShape {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
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
    try {
      const manifest = readJsonFixture<AtlasManifestFixture>(options.atlasManifestPath)
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
