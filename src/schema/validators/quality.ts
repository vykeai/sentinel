/**
 * Quality Checker
 * Runs code quality gates: tests, typecheck, banned patterns, commit format, push status.
 * Reads the `quality` block from sentinel.yaml.
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { glob } from 'glob'
import type { ValidationResult, ValidationIssue, QualityConfig } from '../../config/types.js'

export async function checkQuality(
  projectRoot: string,
  config: QualityConfig,
): Promise<ValidationResult> {
  const start = performance.now()
  const issues: ValidationIssue[] = []
  let checked = 0

  // ─── Tests ────────────────────────────────────────────────────────────────
  if (config.tests) {
    checked++
    try {
      execSync(config.tests, { cwd: projectRoot, stdio: 'pipe', timeout: 120_000 })
    } catch (e: unknown) {
      const stderr = e instanceof Error && 'stderr' in e
        ? String((e as { stderr: Buffer }).stderr).slice(0, 500)
        : 'unknown error'
      issues.push({
        severity: 'error',
        layer: 'quality',
        rule: 'tests-fail',
        message: `Test command failed: ${config.tests}`,
        fix: stderr,
      })
    }
  }

  // ─── Typecheck ────────────────────────────────────────────────────────────
  if (config.typecheck) {
    checked++
    try {
      execSync(config.typecheck, { cwd: projectRoot, stdio: 'pipe', timeout: 60_000 })
    } catch (e: unknown) {
      const stderr = e instanceof Error && 'stderr' in e
        ? String((e as { stderr: Buffer }).stderr).slice(0, 500)
        : 'unknown error'
      issues.push({
        severity: 'error',
        layer: 'quality',
        rule: 'typecheck-fail',
        message: `Typecheck command failed: ${config.typecheck}`,
        fix: stderr,
      })
    }
  }

  // ─── Banned patterns ──────────────────────────────────────────────────────
  if (config['banned-patterns'] && config['banned-patterns'].length > 0) {
    const include = config.include ?? ['src/**/*.{ts,tsx,js,jsx}']
    const exclude = config.exclude ?? ['node_modules/**', 'dist/**', '*.test.*', '*.spec.*']

    const files: string[] = []
    for (const pattern of include) {
      const matched = await glob(pattern, {
        cwd: projectRoot,
        absolute: true,
        ignore: exclude,
      })
      files.push(...matched)
    }

    for (const banned of config['banned-patterns']) {
      checked++
      // Group hits by file: { relativePath: lineNumbers[] }
      const hits: Map<string, number[]> = new Map()

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const lineNums: number[] = []
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(banned.pattern)) {
            lineNums.push(i + 1)
          }
        }
        if (lineNums.length > 0) {
          const rel = path.relative(projectRoot, file)
          hits.set(rel, lineNums)
        }
      }

      if (hits.size > 0) {
        let totalHits = 0
        const fileDetails: string[] = []
        for (const [file, lineNums] of hits) {
          totalHits += lineNums.length
          if (lineNums.length <= 3) {
            fileDetails.push(`${file}:${lineNums.join(',')}`)
          } else {
            fileDetails.push(`${file} (${lineNums.length} hits)`)
          }
        }

        issues.push({
          severity: banned.severity,
          layer: 'quality',
          rule: 'banned-pattern',
          message: `${banned.message ?? `"${banned.pattern}"`} — ${totalHits} occurrence${totalHits !== 1 ? 's' : ''} in ${hits.size} file${hits.size !== 1 ? 's' : ''}`,
          fix: fileDetails.join(', '),
        })
      }
    }
  }

  // ─── Commit format ────────────────────────────────────────────────────────
  if (config['commit-format']) {
    checked++
    try {
      const msg = execSync('git log -1 --format=%s', { cwd: projectRoot, stdio: 'pipe' })
        .toString()
        .trim()
      const re = new RegExp(config['commit-format'])
      if (!re.test(msg)) {
        issues.push({
          severity: 'error',
          layer: 'quality',
          rule: 'commit-format',
          message: `Last commit doesn't match format "${config['commit-format']}": "${msg}"`,
          fix: `Use conventional commits: feat:, fix:, chore:, docs:, refactor:, test:`,
        })
      }
    } catch {
      issues.push({
        severity: 'warning',
        layer: 'quality',
        rule: 'commit-format',
        message: `Could not read git log — not a git repo or no commits`,
      })
    }
  }

  // ─── Require pushed ───────────────────────────────────────────────────────
  if (config['require-pushed']) {
    checked++
    try {
      const status = execSync('git status --porcelain -b', { cwd: projectRoot, stdio: 'pipe' })
        .toString()
      if (status.includes('[ahead')) {
        issues.push({
          severity: 'error',
          layer: 'quality',
          rule: 'not-pushed',
          message: `Branch has unpushed commits`,
          fix: `Run git push`,
        })
      }
    } catch {
      issues.push({
        severity: 'warning',
        layer: 'quality',
        rule: 'not-pushed',
        message: `Could not check push status — not a git repo or no remote`,
      })
    }
  }

  return {
    layer: 'quality',
    passed: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    durationMs: Math.round(performance.now() - start),
    checkedCount: checked,
  }
}
