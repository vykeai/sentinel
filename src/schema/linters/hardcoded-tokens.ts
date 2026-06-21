/**
 * Hardcoded-token linter — fails when a screen renders raw colour / spacing / font
 * literals instead of generated design tokens. Part of `sentinel design:validate`.
 *
 * Heuristic + allowlist: a line that references a token namespace (BrandTokens / Theme_ /
 * *Tokens. / tokens.) is fine; an inline hex / Color(...) / .dp / .sp / .system(size:) is not.
 */
import fs from 'fs'
import path from 'path'
import type { ResolvedConfig, ValidationResult, ValidationIssue } from '../../config/types.js'
import { findScreenFiles } from '../../catalog/registry.js'

const PATTERNS: { re: RegExp; what: string }[] = [
  { re: /#[0-9A-Fa-f]{6}\b/, what: 'hex colour' },
  { re: /\bColor\(\s*red:/, what: 'inline SwiftUI Color(red:…)' },
  { re: /\bColor\(0x[0-9A-Fa-f]{6,8}\)/, what: 'inline Compose Color(0x…)' },
  { re: /\bUIColor\(\s*(red|white):/, what: 'inline UIColor(…)' },
  { re: /\b\d+(\.\d+)?\.dp\b/, what: 'inline .dp dimension' },
  { re: /\b\d+(\.\d+)?\.sp\b/, what: 'inline .sp font size' },
  { re: /\.system\(\s*size:\s*\d+/, what: 'inline SwiftUI .system(size:)' },
]

// Lines that reference a generated token namespace are allowed.
const TOKEN_REF = /(BrandTokens|Theme_[A-Za-z0-9_]+|[A-Za-z]+Tokens\.|tokens\.|DesignTokens)/

export function lintHardcodedTokens(config: ResolvedConfig, singleFile?: string): ValidationResult {
  const start = performance.now()
  const issues: ValidationIssue[] = []
  const files = findScreenFiles(config.projectRoot, singleFile)

  for (const rel of files) {
    const abs = path.resolve(config.projectRoot, rel)
    let src: string
    try { src = fs.readFileSync(abs, 'utf-8') } catch { continue }

    src.split('\n').forEach((line, i) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
      if (TOKEN_REF.test(line)) return // references a token — fine
      for (const { re, what } of PATTERNS) {
        if (re.test(line)) {
          issues.push({
            severity: 'error',
            layer: 'design',
            rule: 'hardcoded-tokens',
            file: `${rel}:${i + 1}`,
            message: `Hardcoded ${what} in a screen — use a design token instead`,
            fix: 'Reference the generated tokens (BrandTokens / Theme) rather than a literal value',
          })
          break
        }
      }
    })
  }

  return {
    layer: 'design',
    passed: issues.filter((iss) => iss.severity === 'error').length === 0,
    issues,
    durationMs: Math.round(performance.now() - start),
    checkedCount: files.length,
  }
}
