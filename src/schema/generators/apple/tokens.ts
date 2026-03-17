import path from 'path'
import type { TokensSchema, ResolvedConfig } from '../../../config/types.js'
import { readJSON, writeFile, generatedHeader, parseDimension, hashFile } from '../../../utils/file.js'
import { log } from '../../../utils/logger.js'

export function generateAppleTokens(config: ResolvedConfig): void {
  const platform = config.platforms.apple
  if (!platform?.output?.tokens) return

  const tokensPath = path.join(config.designDir, 'tokens.json')
  const tokens = readJSON<TokensSchema>(tokensPath)

  const enumName = outputFileName(platform.output.tokens)

  const output = [
    generatedHeader('sentinel/generators/apple/tokens', 'sentinel/schemas/design/tokens.json', hashFile(tokensPath)),
    `import SwiftUI`,
    ``,
    `// swiftlint:disable all`,
    `public enum ${enumName} {`,
    generateColors(tokens),
    generateTypography(tokens),
    generateSpacing(tokens),
    generateBorderRadius(tokens),
    generateComponents(tokens),
    generateIconSizes(tokens),
    generateAnimation(tokens),
    `}`,
    ``,
    generateCompatibilityAliases(tokens, enumName),
    ``,
    `// MARK: - Hex Colour Initialiser`,
    ``,
    `private extension Color {`,
    `  init(hex: String) {`,
    `    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)`,
    `    var int: UInt64 = 0`,
    `    Scanner(string: hex).scanHexInt64(&int)`,
    `    let a, r, g, b: UInt64`,
    `    switch hex.count {`,
    `    case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)`,
    `    case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)`,
    `    case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)`,
    `    default: (a, r, g, b) = (255, 0, 0, 0)`,
    `    }`,
    `    self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)`,
    `  }`,
    `}`,
    `// swiftlint:enable all`,
  ].join('\n')

  writeFile(platform.output.tokens, output)
  log.success(`Apple tokens → ${platform.output.tokens}`)
}

/** Derives a PascalCase type name from the output file path, e.g. GeneratedTokens.swift → GeneratedTokens */
function outputFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath))
}

function generateColors(tokens: TokensSchema): string {
  const lines: string[] = ['  public enum Colors {']

  function walk(obj: Record<string, unknown>, indent: number, path: string[]): string[] {
    const result: string[] = []
    const pad = '  '.repeat(indent)

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !('value' in value)) {
        const enumName = key.charAt(0).toUpperCase() + key.slice(1)
        result.push(`${pad}public enum ${enumName} {`)
        result.push(...walk(value as Record<string, unknown>, indent + 1, [...path, key]))
        result.push(`${pad}}`)
      } else if (typeof value === 'object' && value !== null && 'value' in value) {
        const v = (value as { value: string }).value
        if (v.startsWith('#') || v.startsWith('rgb') || v.startsWith('rgba')) {
          result.push(`${pad}public static let ${key} = Color(hex: "${v}")`)
        }
      }
    }
    return result
  }

  lines.push(...walk(tokens.colors as Record<string, unknown>, 2, []))
  lines.push('  }')
  return lines.join('\n')
}

function generateTypography(tokens: TokensSchema): string {
  const lines: string[] = ['  public enum Typography {']
  const typo = tokens.typography as Record<string, unknown>

  if ('fontSizes' in typo) {
    lines.push('    public enum FontSize {')
    for (const [key, val] of Object.entries(typo.fontSizes as Record<string, { value: string }>)) {
      const size = parseDimension(val.value)
      lines.push(`      public static let ${safeIdentifier(key)}: CGFloat = ${size}`)
    }
    lines.push('    }')
  }

  if ('fontWeights' in typo) {
    lines.push('    public enum FontWeight {')
    for (const [key, val] of Object.entries(typo.fontWeights as Record<string, { value: string }>)) {
      lines.push(`      public static let ${safeIdentifier(key)}: Font.Weight = ${toSwiftFontWeight(val.value)}`)
    }
    lines.push('    }')
  }

  if ('lineHeights' in typo) {
    lines.push('    public enum LineHeight {')
    for (const [key, val] of Object.entries(typo.lineHeights as Record<string, { value: string }>)) {
      const size = parseDimension(val.value)
      lines.push(`      public static let ${safeIdentifier(key)}: CGFloat = ${size}`)
    }
    lines.push('    }')
  }

  lines.push('  }')
  return lines.join('\n')
}

function toSwiftFontWeight(value: string): string {
  const weight = Number.parseInt(value, 10)
  if (weight <= 100) return '.ultraLight'
  if (weight <= 200) return '.thin'
  if (weight <= 300) return '.light'
  if (weight <= 400) return '.regular'
  if (weight <= 500) return '.medium'
  if (weight <= 600) return '.semibold'
  if (weight <= 700) return '.bold'
  if (weight <= 800) return '.heavy'
  return '.black'
}

function generateSpacing(tokens: TokensSchema): string {
  const lines: string[] = ['  public enum Spacing {']
  for (const [key, val] of Object.entries(tokens.spacing as Record<string, { value: string }>)) {
    const size = parseDimension(val.value)
    const safeName = safeIdentifier(key)
    lines.push(`    public static let ${safeName}: CGFloat = ${size}`)
  }
  lines.push('  }')
  return lines.join('\n')
}

function generateBorderRadius(tokens: TokensSchema): string {
  if (!tokens.borderRadius) return ''
  const lines: string[] = ['  public enum CornerRadius {']
  for (const [key, val] of Object.entries(tokens.borderRadius as Record<string, { value: string }>)) {
    const size = parseDimension(val.value)
    const v = isNaN(size) ? '999' : String(size)
    lines.push(`    public static let ${safeIdentifier(key)}: CGFloat = ${v}`)
  }
  lines.push('  }')
  return lines.join('\n')
}

function generateComponents(tokens: TokensSchema): string {
  const extendedTokens = tokens as TokensSchema & { components?: Record<string, unknown> }
  if (!extendedTokens.components) return ''

  const lines: string[] = ['  public enum Component {']
  for (const [key, value] of flattenDimensionTokens(extendedTokens.components)) {
    const size = parseDimension(value)
    lines.push(`    public static let ${key}: CGFloat = ${size}`)
  }
  lines.push('  }')
  return lines.join('\n')
}

function generateAnimation(tokens: TokensSchema): string {
  if (!tokens.animation) return ''
  const lines: string[] = ['  public enum Animation {']
  const anim = tokens.animation as Record<string, unknown>

  if ('duration' in anim) {
    lines.push('    public enum Duration {')
    for (const [key, val] of Object.entries(anim.duration as Record<string, { value: string }>)) {
      const ms = parseDimension(val.value)
      lines.push(`      public static let ${key}: Double = ${ms / 1000}`)
    }
    lines.push('    }')
  }

  lines.push('  }')
  return lines.join('\n')
}

function generateIconSizes(tokens: TokensSchema): string {
  const extendedTokens = tokens as TokensSchema & { iconSizes?: Record<string, { value: string }> }
  if (!extendedTokens.iconSizes) return ''

  const lines: string[] = ['  public enum IconSize {']
  for (const [key, val] of Object.entries(extendedTokens.iconSizes)) {
    const size = parseDimension(val.value)
    lines.push(`    public static let ${safeIdentifier(key)}: CGFloat = ${size}`)
  }
  lines.push('  }')
  return lines.join('\n')
}

function generateCompatibilityAliases(tokens: TokensSchema, enumName: string): string {
  const lines: string[] = []
  const extendedTokens = tokens as TokensSchema & {
    components?: Record<string, unknown>
    iconSizes?: Record<string, { value: string }>
  }
  const colors = tokens.colors as Record<string, unknown>
  const colorAliasPrefixes = ['FKColor', 'AppTokensColor']

  for (const [groupName, rawGroup] of Object.entries(colors)) {
    if (typeof rawGroup !== 'object' || rawGroup === null || 'value' in rawGroup) continue

    for (const prefix of colorAliasPrefixes) {
      lines.push(`public enum ${prefix}${toPascal(groupName)} {`)
      for (const [tokenName, rawValue] of Object.entries(rawGroup as Record<string, unknown>)) {
        if (typeof rawValue !== 'object' || rawValue === null || !('value' in rawValue)) continue
        const safeName = safeIdentifier(tokenName)
        lines.push(`  public static let ${safeName} = ${enumName}.Colors.${toPascal(groupName)}.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  for (const aliasName of ['FKSpacing', 'AppTokensSpacing']) {
    lines.push(`public enum ${aliasName} {`)
    for (const key of Object.keys(tokens.spacing as Record<string, { value: string }>)) {
      const safeName = safeIdentifier(key)
      lines.push(`  public static let ${safeName} = ${enumName}.Spacing.${safeName}`)
    }
    for (const [legacyName, canonicalName] of Object.entries(legacySpacingAliases())) {
      lines.push(`  public static let ${legacyName} = ${enumName}.Spacing.${canonicalName}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  if (tokens.borderRadius) {
    for (const aliasName of ['FKRadius', 'AppTokensRadius']) {
      lines.push(`public enum ${aliasName} {`)
      for (const key of Object.keys(tokens.borderRadius as Record<string, { value: string }>)) {
        const safeName = safeIdentifier(key)
        lines.push(`  public static let ${safeName} = ${enumName}.CornerRadius.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  if (extendedTokens.components) {
    for (const aliasName of ['FKComponent', 'AppTokensComponent']) {
      lines.push(`public enum ${aliasName} {`)
      for (const [key] of flattenDimensionTokens(extendedTokens.components)) {
        lines.push(`  public static let ${key} = ${enumName}.Component.${key}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  if (extendedTokens.iconSizes) {
    for (const aliasName of ['FKIconSize', 'AppTokensIconSize']) {
      lines.push(`public enum ${aliasName} {`)
      for (const key of Object.keys(extendedTokens.iconSizes)) {
        const safeName = safeIdentifier(key)
        lines.push(`  public static let ${safeName} = ${enumName}.IconSize.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  if (tokens.animation && 'duration' in (tokens.animation as Record<string, unknown>)) {
    for (const aliasName of ['FKAnimation', 'AppTokensAnimation']) {
      lines.push(`public enum ${aliasName} {`)
      for (const key of Object.keys((tokens.animation as Record<string, { value: string }>).duration ?? {})) {
        const safeName = safeIdentifier(key)
        lines.push(`  public static let ${safeName} = ${enumName}.Animation.Duration.${safeName}`)
      }
      lines.push(`}`)
    }
  }

  return lines.join('\n')
}

function toPascal(value: string): string {
  return value
    .replace(/[_-]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase())
}

function safeIdentifier(key: string): string {
  return /^\d/.test(key) ? `s${key}` : key
}

function legacySpacingAliases(): Record<string, string> {
  return {
    sxs: 'xs',
    ssm: 'sm',
    smd: 'md',
    slg: 'lg',
    sxl: 'xl',
    sxxl: 'xxl',
  }
}

function flattenDimensionTokens(obj: Record<string, unknown>, path: string[] = []): Array<[string, string]> {
  const result: Array<[string, string]> = []

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'object' || value === null) continue
    if ('value' in value) {
      const tokenName = [...path, safeIdentifier(key)].join('.').replace(/\.(\w)/g, (_, c: string) => c.toUpperCase())
      result.push([tokenName, (value as { value: string }).value])
      continue
    }

    result.push(...flattenDimensionTokens(value as Record<string, unknown>, [...path, safeIdentifier(key)]))
  }

  return result
}
