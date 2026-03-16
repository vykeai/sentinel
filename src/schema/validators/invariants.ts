/**
 * Invariants Checker
 * Verifies non-negotiable project rules.
 * Configured via the `invariants` section of sentinel.yaml.
 *
 * Use this for platform-specific requirements that must never regress —
 * e.g. UILaunchScreen in iOS Info.plist, required manifest entries, etc.
 */
import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import type {
  InvariantCheck,
  InvariantContainsCheck,
  InvariantPatternCheck,
  ResolvedConfig,
  ValidationIssue,
  ValidationResult,
} from '../../config/types.js'

function isContainsCheck(check: InvariantCheck): check is InvariantContainsCheck {
  return 'file' in check && 'contains' in check
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function addContainsIssue(
  issues: ValidationIssue[],
  config: ResolvedConfig,
  check: InvariantContainsCheck,
): void {
  const filePath = path.resolve(config.projectRoot, check.file)

  if (!fs.existsSync(filePath)) {
    issues.push({
      severity: 'error',
      layer: 'invariants',
      rule: 'file-exists',
      file: filePath,
      message: `Invariant check failed — file not found: ${check.file}`,
      fix: check.fix,
    })
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  if (!content.includes(check.contains)) {
    issues.push({
      severity: 'error',
      layer: 'invariants',
      rule: 'contains',
      file: filePath,
      message: check.error,
      fix: check.fix ?? `Ensure "${check.contains}" is present in ${check.file}`,
    })
  }
}

function addPatternIssues(
  issues: ValidationIssue[],
  config: ResolvedConfig,
  check: InvariantPatternCheck,
): void {
  let pattern: RegExp | null = null
  let literalPattern: string | null = null

  try {
    pattern = new RegExp(check.pattern, 'g')
  } catch {
    literalPattern = check.pattern
  }

  const includePatterns = toArray(check.files)
  const excludePatterns = toArray(check.exclude)
  const matchedFiles = includePatterns.flatMap((filePattern) =>
    globSync(filePattern, {
      cwd: config.projectRoot,
      absolute: true,
      nodir: true,
      ignore: excludePatterns,
    }),
  )

  if (matchedFiles.length === 0) {
    issues.push({
      severity: 'error',
      layer: 'invariants',
      rule: 'pattern-files',
      message: `Invariant pattern matched no files: ${includePatterns.join(', ')}`,
      fix: check.fix ?? 'Fix the files/exclude globs in sentinel.yaml',
    })
    return
  }

  for (const filePath of [...new Set(matchedFiles)]) {
    const content = fs.readFileSync(filePath, 'utf8')
    const matches = pattern
      ? content.match(pattern)
      : literalPattern
        ? Array.from(content.matchAll(new RegExp(literalPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')))
        : []
    if (!matches || matches.length === 0) continue

    issues.push({
      severity: 'error',
      layer: 'invariants',
      rule: 'pattern',
      file: filePath,
      message: `${check.error} (${matches.length} match${matches.length === 1 ? '' : 'es'})`,
      fix: check.fix ?? `Remove matches for /${check.pattern}/ in ${path.relative(config.projectRoot, filePath)}`,
    })
  }
}

export function checkInvariants(config: ResolvedConfig): ValidationResult {
  const start = performance.now()
  const issues: ValidationIssue[] = []
  const checks = config.invariants ?? []

  for (const check of checks) {
    if (isContainsCheck(check)) addContainsIssue(issues, config, check)
    else addPatternIssues(issues, config, check)
  }

  return {
    layer: 'invariants',
    passed: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    durationMs: Math.round(performance.now() - start),
    checkedCount: checks.length,
  }
}
