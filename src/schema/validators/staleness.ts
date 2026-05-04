/**
 * Staleness Checker
 * Verifies generated files are up-to-date with their source schemas.
 * Uses embedded SHA-256 content hashes (not mtime) so CI fresh-checkout is safe.
 */
import fs from 'fs'
import path from 'path'
import type { ResolvedConfig, ValidationResult, ValidationIssue } from '../../config/types.js'
import { hashFile, readEmbeddedHash } from '../../utils/file.js'

interface OutputCheck {
  label: string
  schema: string
  output: string
}

export function checkStaleness(config: ResolvedConfig): ValidationResult {
  const start = performance.now()
  const issues: ValidationIssue[] = []

  const checks: OutputCheck[] = []

  const tokensSchema = path.join(config.designDir, 'tokens.json')
  const stringsSchema = path.join(config.designDir, 'strings.json')
  const flagsSchema = path.join(config.platformDir, 'feature-flags.json')
  const errorsSchema = path.join(config.platformDir, 'errors.json')

  if (config.platforms.api?.output?.errors) {
    checks.push({
      label: 'api/errors',
      schema: errorsSchema,
      output: resolveOutputPath(config, config.platforms.api.output.errors),
    })
  }

  if (config.platforms.apple) {
    const { tokens, strings, flags, errors } = config.platforms.apple.output
    if (tokens)  checks.push({ label: 'apple/tokens',  schema: tokensSchema,  output: resolveOutputPath(config, tokens) })
    if (strings) checks.push({ label: 'apple/strings', schema: stringsSchema, output: resolveOutputPath(config, strings) })
    if (flags)   checks.push({ label: 'apple/flags',   schema: flagsSchema,   output: resolveOutputPath(config, flags) })
    if (errors)  checks.push({ label: 'apple/errors',  schema: errorsSchema,  output: resolveOutputPath(config, errors) })
  }

  if (config.platforms.google) {
    const { tokens, strings, flags, errors } = config.platforms.google.output
    if (tokens)  checks.push({ label: 'google/tokens',  schema: tokensSchema,  output: resolveOutputPath(config, tokens) })
    if (strings) checks.push({ label: 'google/strings', schema: stringsSchema, output: resolveOutputPath(config, strings) })
    if (flags)   checks.push({ label: 'google/flags',   schema: flagsSchema,   output: resolveOutputPath(config, flags) })
    if (errors)  checks.push({ label: 'google/errors',  schema: errorsSchema,  output: resolveOutputPath(config, errors) })
  }

  const webPlatform = config.platforms.web ?? config.platforms['web-admin']
  if (webPlatform) {
    const { tokens, strings, flags, errors } = webPlatform.output
    if (tokens)  checks.push({ label: 'web/tokens',  schema: tokensSchema,  output: resolveOutputPath(config, tokens) })
    if (strings) checks.push({ label: 'web/strings', schema: stringsSchema, output: resolveOutputPath(config, strings) })
    if (flags)   checks.push({ label: 'web/flags',   schema: flagsSchema,   output: resolveOutputPath(config, flags) })
    if (errors)  checks.push({ label: 'web/errors',  schema: errorsSchema,  output: resolveOutputPath(config, errors) })
  }

  if (config.platforms['web-public']?.output?.errors) {
    checks.push({
      label: 'web-public/errors',
      schema: errorsSchema,
      output: resolveOutputPath(config, config.platforms['web-public'].output.errors),
    })
  }

  for (const check of checks) {
    if (!fs.existsSync(check.output)) {
      issues.push({
        severity: 'error',
        layer: 'schema',
        rule: 'staleness',
        file: check.output,
        message: `Generated file missing: ${check.label} — run "sentinel schema:generate"`,
        fix: `sentinel schema:generate`,
      })
      continue
    }

    if (!fs.existsSync(check.schema)) continue // schema missing handled by completeness checker

    const embeddedHash = readEmbeddedHash(check.output)

    if (!embeddedHash) {
      // Generated file has no hash — fall back to mtime comparison
      const schemaMtime = fs.statSync(check.schema).mtimeMs
      const outputMtime = fs.statSync(check.output).mtimeMs
      if (schemaMtime > outputMtime) {
        issues.push({
          severity: 'warning',
          layer: 'schema',
          rule: 'staleness',
          file: check.output,
          message: `Possibly stale: ${check.label} — no hash embedded, regenerate to enable CI-safe staleness detection`,
          fix: `sentinel schema:generate`,
        })
      }
      continue
    }

    const currentHash = hashFile(check.schema)
    if (embeddedHash !== currentHash) {
      issues.push({
        severity: 'error',
        layer: 'schema',
        rule: 'staleness',
        file: check.output,
        message: `Stale generated file: ${check.label} — schema changed since last generate`,
        fix: `sentinel schema:generate`,
      })
    }
  }

  return {
    layer: 'staleness',
    passed: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    durationMs: Math.round(performance.now() - start),
    checkedCount: checks.length,
  }
}

function resolveOutputPath(config: ResolvedConfig, configuredPath: string): string {
  const output = path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(config.projectRoot, configuredPath)
  const relative = path.relative(config.projectRoot, output)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Configured generated output escapes project root: ${configuredPath}`)
  }
  return output
}
