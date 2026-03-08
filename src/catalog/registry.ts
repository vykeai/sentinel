// ─── Registry Scanner ────────────────────────────────────────────────────────
// Finds screen files in the codebase and cross-references against the
// sentinel.yaml screens: list. Unregistered screens exit 1 for CI gating.
//
// Detection heuristics:
//   *Screen.swift / *Screen.kt         → always a screen
//   *View.swift   in Features/ dirs    → treated as a screen
//   *View.kt      in features/ dirs    → treated as a screen
//   Anything in DesignSystem/Components/design/shared dirs → skipped

import { readdirSync, statSync } from 'fs'
import { join, basename, relative } from 'path'
import type { CatalogConfig } from './types.js'

export interface UnregisteredScreen {
  file: string          // path relative to project root
  suggestedSlug: string
}

export interface RegistryScanResult {
  registeredCount: number
  foundCount: number       // total screen files detected
  unregistered: UnregisteredScreen[]
}

// ─── Slug derivation ─────────────────────────────────────────────────────────

// PascalCase → kebab-case:  ProfileDetailView → profile-detail-view
function pascalToKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')   // camelBump → camel-Bump
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2') // ABCName → ABC-Name
    .toLowerCase()
}

const SCREEN_SUFFIXES = [
  'screen', 'view', 'controller', 'viewcontroller',
  'activity', 'fragment', 'page',
]

export function fileToSlug(filename: string): string {
  const name = filename
    .replace(/\.(swift|kt)$/, '') // strip extension
  const kebab = pascalToKebab(name)
  // Strip trailing screen/view/etc suffix (e.g. -view, -screen, -controller)
  for (const suffix of SCREEN_SUFFIXES) {
    if (kebab.endsWith(`-${suffix}`)) {
      return kebab.slice(0, -(suffix.length + 1))
    }
  }
  return kebab
}

// ─── File detection ───────────────────────────────────────────────────────────

// Directories to never recurse into
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.build', 'DerivedData',
  'catalog', 'sentinel', '.gradle', 'Pods', 'xcuserdata',
])

// Directory names that contain components, not screens — skip *View files here
const COMPONENT_DIRS = new Set([
  'DesignSystem', 'Design', 'Components', 'Component', 'Shared',
  'Common', 'design', 'components', 'shared', 'common', 'ui',
])

// Directory names that reliably contain navigable screens
const SCREEN_DIRS = new Set([
  'Features', 'Feature', 'Screens', 'Screen', 'Modules', 'Module',
  'Pages', 'Page', 'Views', 'features', 'screens', 'modules', 'pages',
])

function isInScreenDir(absPath: string): boolean {
  const parts = absPath.split('/')
  return parts.some((p) => SCREEN_DIRS.has(p))
}

function isInComponentDir(absPath: string): boolean {
  const parts = absPath.split('/')
  return parts.some((p) => COMPONENT_DIRS.has(p))
}

function isScreenFile(absPath: string): boolean {
  const name = basename(absPath)
  // Definite screen: *Screen.swift or *Screen.kt (explicit naming convention)
  if (/Screen\.(swift|kt)$/.test(name)) return !isInComponentDir(absPath)
  // Likely screen: *View.swift or *View.kt in a features/screens dir
  if (/View\.(swift|kt)$/.test(name)) {
    return isInScreenDir(absPath) && !isInComponentDir(absPath)
  }
  return false
}

function walkDir(dir: string, root: string, results: string[], depth = 0): void {
  if (depth > 10) return
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let stat
    try { stat = statSync(full) } catch { continue }
    if (stat.isDirectory()) {
      walkDir(full, root, results, depth + 1)
    } else if (isScreenFile(full)) {
      results.push(relative(root, full))
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function scanRegistry(
  catalog: CatalogConfig,
  projectRoot: string,
  singleFile?: string,
): RegistryScanResult {
  const registeredSlugs = new Set(catalog.screens.map((s) => s.slug))

  let screenFiles: string[]
  if (singleFile) {
    const rel = singleFile.startsWith(projectRoot)
      ? relative(projectRoot, singleFile)
      : singleFile
    screenFiles = isScreenFile(singleFile) ? [rel] : []
  } else {
    screenFiles = []
    walkDir(projectRoot, projectRoot, screenFiles)
  }

  const unregistered: UnregisteredScreen[] = []
  for (const file of screenFiles) {
    const slug = fileToSlug(basename(file))
    if (!registeredSlugs.has(slug)) {
      unregistered.push({ file, suggestedSlug: slug })
    }
  }

  return {
    registeredCount: registeredSlugs.size,
    foundCount: screenFiles.length,
    unregistered,
  }
}
