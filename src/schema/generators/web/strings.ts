import path from 'path'
import type { StringsSchema, ResolvedConfig } from '../../../config/types.js'
import { readJSON, writeFile, generatedHeader, hashFile } from '../../../utils/file.js'
import { log } from '../../../utils/logger.js'

export function generateWebStrings(config: ResolvedConfig): void {
  const platform = config.platforms.web ?? config.platforms['web-admin']
  if (!platform?.output?.strings) return

  const stringsPath = path.join(config.designDir, 'strings.json')
  const schema = readJSON<StringsSchema>(stringsPath)

  const output = [
    generatedHeader('sentinel/generators/web/strings', 'sentinel/schemas/design/strings.json', hashFile(stringsPath)),
    `// Supports multiple locales — add locale keys to strings.json`,
    ``,
    `export const strings = ${JSON.stringify(flattenStrings(schema.strings), null, 2)} as const`,
    ``,
    `export type Strings = typeof strings`,
    `export type StringKey = keyof typeof strings`,
  ].join('\n')

  writeFile(platform.output.strings, output)
  log.success(`Web strings → ${platform.output.strings}`)
}

function flattenStrings(
  strings: Record<string, string | Record<string, string>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(strings).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : (value['en'] ?? Object.values(value)[0] ?? key),
    ]),
  )
}
