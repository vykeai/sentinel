import path from 'path'
import type { ApiErrorEntry, ApiErrorsSchema, ResolvedConfig } from '../../../config/types.js'
import { generatedHeader, hashFile, readJSON, writeFile } from '../../../utils/file.js'
import { log } from '../../../utils/logger.js'

const SOURCE = 'sentinel/schemas/platform/errors.json'

export function loadApiErrorsSchema(config: ResolvedConfig): { schema: ApiErrorsSchema; schemaPath: string } | null {
  const schemaPath = path.join(config.platformDir, 'errors.json')
  try {
    return { schema: readJSON<ApiErrorsSchema>(schemaPath), schemaPath }
  } catch {
    return null
  }
}

export function validateApiErrorsSchema(filename: string, schema: Record<string, unknown>): string[] {
  const errors: string[] = []
  const locales = schema['locales']
  const entries = schema['errors']

  if (!Array.isArray(locales) || locales.length === 0) {
    errors.push(`${filename}: missing 'locales' array`)
  }
  if (!Array.isArray(entries)) {
    errors.push(`${filename}: missing 'errors' array`)
    return errors
  }

  const seenCodes = new Set<string>()
  const seenKeys = new Set<string>()
  const localeList = (Array.isArray(locales) ? locales : []) as string[]

  for (const [index, raw] of entries.entries()) {
    const entry = raw as Partial<ApiErrorEntry>
    const label = `${filename}: errors[${index}]`
    if (!entry.code || !/^[A-Z0-9_]+$/.test(entry.code)) {
      errors.push(`${label}: code must be an uppercase stable key`)
    } else if (seenCodes.has(entry.code)) {
      errors.push(`${label}: duplicate code '${entry.code}'`)
    } else {
      seenCodes.add(entry.code)
    }

    if (!Number.isInteger(entry.httpStatus) || (entry.httpStatus ?? 0) < 100 || (entry.httpStatus ?? 0) > 599) {
      errors.push(`${label}: httpStatus must be an integer HTTP status`)
    }

    if (!entry.translationKey || !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(entry.translationKey)) {
      errors.push(`${label}: translationKey must be dot.case namespaced`)
    } else if (seenKeys.has(entry.translationKey)) {
      errors.push(`${label}: duplicate translationKey '${entry.translationKey}'`)
    } else {
      seenKeys.add(entry.translationKey)
    }

    if (!entry.translations || typeof entry.translations !== 'object') {
      errors.push(`${label}: missing translations object`)
      continue
    }

    for (const locale of localeList) {
      const value = entry.translations[locale]
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`${label}: missing translation for locale '${locale}'`)
      }
    }
  }

  return errors
}

export function generateApiErrors(config: ResolvedConfig): void {
  const loaded = loadApiErrorsSchema(config)
  if (!loaded) return

  const { schema, schemaPath } = loaded
  const schemaHash = hashFile(schemaPath)

  if (config.platforms.api?.output?.errors) {
    writeFile(
      config.platforms.api.output.errors,
      generateTypeScriptErrors(schema, schemaHash),
    )
    log.success(`API errors → ${config.platforms.api.output.errors}`)
  }

  if (config.platforms.apple?.output?.errors) {
    writeFile(
      config.platforms.apple.output.errors,
      generateSwiftErrors(schema, schemaHash),
    )
    log.success(`Apple errors → ${config.platforms.apple.output.errors}`)
  }

  if (config.platforms.google?.output?.errors) {
    writeFile(
      config.platforms.google.output.errors,
      generateKotlinErrors(config.platforms.google.output.errors, schema, schemaHash),
    )
    log.success(`Google errors → ${config.platforms.google.output.errors}`)
  }

  for (const [label, webPlatform] of [
    ['Web', config.platforms.web],
    ['Web admin', config.platforms['web-admin']],
    ['Web public', config.platforms['web-public']],
  ] as const) {
    if (!webPlatform?.output?.errors) continue
    writeFile(
      webPlatform.output.errors,
      generateTypeScriptErrors(schema, schemaHash),
    )
    log.success(`${label} errors → ${webPlatform.output.errors}`)
  }
}

function generateTypeScriptErrors(schema: ApiErrorsSchema, schemaHash: string): string {
  const codes = schema.errors.map((entry) => entry.code)
  const catalog = Object.fromEntries(
    schema.errors.map((entry) => [
      entry.code,
      {
        httpStatus: entry.httpStatus,
        translationKey: entry.translationKey,
        translations: entry.translations,
      },
    ]),
  )

  return [
    generatedHeader('sentinel/generators/shared/errors', SOURCE, schemaHash),
    `export const apiErrorCodes = ${JSON.stringify(codes, null, 2)} as const`,
    ``,
    `export type ApiErrorCode = typeof apiErrorCodes[number]`,
    ``,
    `export const apiErrorCatalog = ${JSON.stringify(catalog, null, 2)} as const`,
    ``,
    `export function isApiErrorCode(value: string): value is ApiErrorCode {`,
    `  return (apiErrorCodes as readonly string[]).includes(value)`,
    `}`,
    ``,
  ].join('\n')
}

function generateSwiftErrors(schema: ApiErrorsSchema, schemaHash: string): string {
  const cases = schema.errors
    .map((entry) => `    case ${toSwiftCase(entry.code)} = "${entry.code}"`)
    .join('\n')
  const messageCases = schema.errors
    .map((entry) => `        case .${toSwiftCase(entry.code)}: return "${escapeSwift(entry.translations.en ?? entry.code)}"`)
    .join('\n')
  const keyCases = schema.errors
    .map((entry) => `        case .${toSwiftCase(entry.code)}: return "${escapeSwift(entry.translationKey)}"`)
    .join('\n')

  return [
    generatedHeader('sentinel/generators/shared/errors', SOURCE, schemaHash),
    `import Foundation`,
    ``,
    `public enum SentinelApiErrorCode: String, CaseIterable {`,
    cases,
    ``,
    `    public var translationKey: String {`,
    `        switch self {`,
    keyCases,
    `        }`,
    `    }`,
    ``,
    `    public var defaultMessage: String {`,
    `        switch self {`,
    messageCases,
    `        }`,
    `    }`,
    `}`,
    ``,
    `public func sentinelLocalizedApiErrorMessage(for code: String?) -> String? {`,
    `    guard let code, let value = SentinelApiErrorCode(rawValue: code) else { return nil }`,
    `    return value.defaultMessage`,
    `}`,
    ``,
  ].join('\n')
}

function generateKotlinErrors(outputPath: string, schema: ApiErrorsSchema, schemaHash: string): string {
  const packageName = deriveKotlinPackage(outputPath)
  const entries = schema.errors
    .map((entry) => `    ${toKotlinEnum(entry.code)}("${entry.code}", "${entry.translationKey}", "${escapeKotlin(entry.translations.en ?? entry.code)}")`)
    .join(',\n')

  return [
    generatedHeader('sentinel/generators/shared/errors', SOURCE, schemaHash),
    `package ${packageName}`,
    ``,
    `enum class SentinelApiErrorCode(`,
    `    val code: String,`,
    `    val translationKey: String,`,
    `    val defaultMessage: String,`,
    `) {`,
    entries,
    `;`,
    ``,
    `    companion object {`,
    `        fun fromCode(code: String?): SentinelApiErrorCode? =`,
    `            entries.firstOrNull { it.code == code }`,
    `    }`,
    `}`,
    ``,
    `fun sentinelApiErrorDefaultMessage(code: String?): String? =`,
    `    SentinelApiErrorCode.fromCode(code)?.defaultMessage`,
    ``,
    `fun sentinelApiErrorTranslationKey(code: String?): String? =`,
    `    SentinelApiErrorCode.fromCode(code)?.translationKey`,
    ``,
  ].join('\n')
}

function deriveKotlinPackage(outputPath: string): string {
  const match = outputPath.match(/kotlin\/(.+)\/[^/]+\.kt$/)
  if (match) return match[1].replace(/\//g, '.')
  return 'app.sentinel'
}

function toSwiftCase(code: string): string {
  const parts = code.toLowerCase().split('_')
  return parts[0] + parts.slice(1).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function toKotlinEnum(code: string): string {
  return code
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('')
}

function escapeSwift(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeKotlin(value: string): string {
  return escapeSwift(value)
}
