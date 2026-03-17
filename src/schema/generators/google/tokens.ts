import path from 'path'
import type { TokensSchema, ResolvedConfig } from '../../../config/types.js'
import { readJSON, writeFile, generatedHeader, parseDimension, hashFile } from '../../../utils/file.js'
import { log } from '../../../utils/logger.js'

export function generateGoogleTokens(config: ResolvedConfig): void {
  const platform = config.platforms.google
  if (!platform?.output?.tokens) return

  const tokensPath = path.join(config.designDir, 'tokens.json')
  const tokens = readJSON<TokensSchema>(tokensPath)

  const pkg = derivePackage(platform.output.tokens)
  const objectName = path.basename(platform.output.tokens, path.extname(platform.output.tokens))

  const output = [
    generatedHeader('sentinel/generators/google/tokens', 'sentinel/schemas/design/tokens.json', hashFile(tokensPath)),
    `package ${pkg}`,
    ``,
    `import androidx.compose.ui.graphics.Color`,
    `import androidx.compose.ui.unit.dp`,
    `import androidx.compose.ui.unit.sp`,
    ``,
    `@Suppress("MemberVisibilityCanBePrivate", "unused")`,
    `object ${objectName} {`,
    generateColors(tokens),
    generateTypography(tokens),
    generateSpacing(tokens),
    generateBorderRadius(tokens),
    generateIconSizes(tokens),
    generateAnimation(tokens),
    `}`,
    ``,
    generateCompatibilityAliases(tokens, objectName),
  ].join('\n')

  writeFile(platform.output.tokens, output)
  log.success(`Google tokens → ${platform.output.tokens}`)
}

function derivePackage(outputPath: string): string {
  // Extract package from path: .../kotlin/com/myapp/design/... → com.myapp.design
  const match = outputPath.match(/kotlin[/\\](.+)[/\\][^/\\]+\.kt$/)
  if (!match) return 'com.app.design'
  return match[1].replace(/[/\\]/g, '.')
}

function hexToLong(hex: string): string {
  const clean = hex.replace('#', '')
  // Compose Color format: 0xAARRGGBB (8 hex digits)
  const full = clean.length === 6 ? `FF${clean}` : clean
  return `0x${full.toUpperCase()}`
}

function generateColors(tokens: TokensSchema): string {
  const lines: string[] = ['    object Colors {']

  function walk(obj: Record<string, unknown>, indent: number): string[] {
    const result: string[] = []
    const pad = '    '.repeat(indent)

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !('value' in value)) {
        const objName = key.charAt(0).toUpperCase() + key.slice(1)
        result.push(`${pad}object ${objName} {`)
        result.push(...walk(value as Record<string, unknown>, indent + 1))
        result.push(`${pad}}`)
      } else if (typeof value === 'object' && value !== null && 'value' in value) {
        const v = (value as { value: string }).value
        if (v.startsWith('#')) {
          result.push(`${pad}val ${key} = Color(${hexToLong(v)})`)
        }
      }
    }
    return result
  }

  lines.push(...walk(tokens.colors as Record<string, unknown>, 2))
  lines.push('    }')
  return lines.join('\n')
}

function generateTypography(tokens: TokensSchema): string {
  const lines: string[] = ['    object Typography {']
  const typo = tokens.typography as Record<string, unknown>

  if ('fontSizes' in typo) {
    lines.push('        object FontSize {')
    for (const [key, val] of Object.entries(typo.fontSizes as Record<string, { value: string }>)) {
      const size = parseDimension(val.value)
      lines.push(`            val ${safeIdentifier(key)} = ${size}.sp`)
    }
    lines.push('        }')
  }

  if ('lineHeights' in typo) {
    lines.push('        object LineHeight {')
    for (const [key, val] of Object.entries(typo.lineHeights as Record<string, { value: string }>)) {
      const size = parseDimension(val.value)
      lines.push(`            val ${safeIdentifier(key)} = ${size}f`)
    }
    lines.push('        }')
  }

  lines.push('    }')
  return lines.join('\n')
}

function generateSpacing(tokens: TokensSchema): string {
  const lines: string[] = ['    object Spacing {']
  for (const [key, val] of Object.entries(tokens.spacing as Record<string, { value: string }>)) {
    const size = parseDimension(val.value)
    const safeName = safeIdentifier(key)
    lines.push(`        val ${safeName} = ${size}.dp`)
  }
  lines.push('    }')
  return lines.join('\n')
}

function generateBorderRadius(tokens: TokensSchema): string {
  if (!tokens.borderRadius) return ''
  const lines: string[] = ['    object CornerRadius {']
  for (const [key, val] of Object.entries(tokens.borderRadius as Record<string, { value: string }>)) {
    const size = parseDimension(val.value)
    const v = isNaN(size) ? '999' : String(size)
    lines.push(`        val ${safeIdentifier(key)} = ${v}.dp`)
  }
  lines.push('    }')
  return lines.join('\n')
}

function generateAnimation(tokens: TokensSchema): string {
  if (!tokens.animation) return ''
  const lines: string[] = ['    object Animation {']
  const anim = tokens.animation as Record<string, unknown>

  if ('duration' in anim) {
    lines.push('        object Duration {')
    for (const [key, val] of Object.entries(anim.duration as Record<string, { value: string }>)) {
      const ms = parseDimension(val.value)
      lines.push(`            val ${key} = ${ms}`)
    }
    lines.push('        }')
  }

  lines.push('    }')
  return lines.join('\n')
}

function generateIconSizes(tokens: TokensSchema): string {
  const extendedTokens = tokens as TokensSchema & { iconSizes?: Record<string, { value: string }> }
  if (!extendedTokens.iconSizes) return ''

  const lines: string[] = ['    object IconSize {']
  for (const [key, val] of Object.entries(extendedTokens.iconSizes)) {
    const size = parseDimension(val.value)
    lines.push(`        val ${safeIdentifier(key)} = ${size}.dp`)
  }
  lines.push('    }')
  return lines.join('\n')
}

function generateCompatibilityAliases(tokens: TokensSchema, objectName: string): string {
  const lines: string[] = []
  const extendedTokens = tokens as TokensSchema & { iconSizes?: Record<string, { value: string }> }
  const colors = tokens.colors as Record<string, unknown>
  const colorAliasPrefixes = ['FKColor', 'AppTokensColor']

  for (const [groupName, rawGroup] of Object.entries(colors)) {
    if (typeof rawGroup !== 'object' || rawGroup === null || 'value' in rawGroup) continue

    const nestedName = toPascal(groupName)
    for (const prefix of colorAliasPrefixes) {
      lines.push(`object ${prefix}${toPascal(groupName)} {`)
      for (const [tokenName, rawValue] of Object.entries(rawGroup as Record<string, unknown>)) {
        if (typeof rawValue !== 'object' || rawValue === null || !('value' in rawValue)) continue
        const safeName = safeIdentifier(tokenName)
        lines.push(`    val ${toPascal(safeName)} get() = ${objectName}.Colors.${nestedName}.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  for (const aliasName of ['FKSpacing', 'AppTokensSpacing']) {
    lines.push(`object ${aliasName} {`)
    for (const key of Object.keys(tokens.spacing as Record<string, { value: string }>)) {
      const safeName = safeIdentifier(key)
      lines.push(`    val ${safeName} get() = ${objectName}.Spacing.${safeName}`)
    }
    for (const [legacyName, canonicalName] of Object.entries(legacySpacingAliases())) {
      lines.push(`    val ${legacyName} get() = ${objectName}.Spacing.${canonicalName}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  if (tokens.borderRadius) {
    for (const aliasName of ['FKRadius', 'AppTokensRadius']) {
      lines.push(`object ${aliasName} {`)
      for (const key of Object.keys(tokens.borderRadius as Record<string, { value: string }>)) {
        const safeName = safeIdentifier(key)
        lines.push(`    val ${safeName} get() = ${objectName}.CornerRadius.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  if (extendedTokens.iconSizes) {
    for (const aliasName of ['FKIconSize', 'AppTokensIconSize']) {
      lines.push(`object ${aliasName} {`)
      for (const key of Object.keys(extendedTokens.iconSizes)) {
        const safeName = safeIdentifier(key)
        lines.push(`    val ${safeName} get() = ${objectName}.IconSize.${safeName}`)
      }
      lines.push(`}`)
      lines.push(``)
    }
  }

  if (tokens.animation && 'duration' in (tokens.animation as Record<string, unknown>)) {
    for (const aliasName of ['FKAnimation', 'AppTokensAnimation']) {
      lines.push(`object ${aliasName} {`)
      for (const key of Object.keys((tokens.animation as Record<string, { value: string }>).duration ?? {})) {
        const safeName = safeIdentifier(key)
        lines.push(`    val ${safeName}Ms get() = ${objectName}.Animation.Duration.${safeName}`)
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
