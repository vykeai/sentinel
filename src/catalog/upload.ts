// ─── Catalog Upload ──────────────────────────────────────────────────────────
// Copies a single screenshot into the catalog with the correct naming convention.
// Use when you have a screenshot from simemu but no Maestro flow yet.
// Replaces any existing file at the target path.
//
// Usage:
//   sentinel catalog:upload --screen sign-in --os ios18 --device iphone --variant light /tmp/shot.png
//   sentinel catalog:upload --screen home --os android --device phone --variant dark --scroll 2 /tmp/shot.png

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import chalk from 'chalk'
import type { CatalogConfig, CatalogOSKey, CatalogDeviceType, CatalogVariant } from './types.js'
import { ALL_OS_KEYS } from './types.js'

const VALID_DEVICES: CatalogDeviceType[] = ['iphone', 'ipad', 'watch', 'phone', 'tablet', 'tv']
const VALID_VARIANTS: CatalogVariant[] = ['light', 'dark', 'glossy-light', 'glossy-dark']

export interface UploadOptions {
  screen: string
  os: CatalogOSKey
  device: CatalogDeviceType
  variant: CatalogVariant
  scroll?: number
  file: string
}

export function validateUploadOptions(opts: Partial<UploadOptions>, config: CatalogConfig): string[] {
  const errors: string[] = []
  if (!opts.screen)  errors.push('--screen is required')
  if (!opts.os)      errors.push('--os is required (ios18 | ios26 | android | watchos | tvos)')
  else if (!ALL_OS_KEYS.includes(opts.os)) errors.push(`--os must be one of: ${ALL_OS_KEYS.join(' | ')}`)
  if (!opts.device)  errors.push('--device is required (iphone | ipad | watch | phone | tablet | tv)')
  else if (!VALID_DEVICES.includes(opts.device)) errors.push(`--device must be one of: ${VALID_DEVICES.join(' | ')}`)
  if (!opts.variant) errors.push('--variant is required (light | dark | glossy-light | glossy-dark)')
  else if (!VALID_VARIANTS.includes(opts.variant)) errors.push(`--variant must be one of: ${VALID_VARIANTS.join(' | ')}`)
  if (!opts.file)    errors.push('file path is required (last positional argument)')

  if (opts.os && opts.device && !errors.some((e) => e.includes('--os') || e.includes('--device'))) {
    if (!config[opts.os]?.[opts.device]) {
      errors.push(`${opts.os}/${opts.device} is not declared in sentinel.yaml → catalog. Add it first.`)
    }
  }
  if (opts.variant === 'glossy-light' || opts.variant === 'glossy-dark') {
    if (opts.os !== 'ios26') errors.push('glossy variants are only valid for --os ios26')
    if (opts.os === 'ios26' && opts.device && !config.ios26?.[opts.device]?.glossy) {
      errors.push('glossy variants require glossy: true on this device in sentinel.yaml')
    }
  }
  return errors
}

export function runUpload(config: CatalogConfig, projectRoot: string, opts: UploadOptions): boolean {
  const outputDir = path.resolve(projectRoot, config.output)
  fs.mkdirSync(outputDir, { recursive: true })

  const scroll = opts.scroll ?? 1
  const scrollSuffix = scroll > 1 ? `-scroll${scroll}` : ''
  const filename = `${opts.screen}-${opts.os}-${opts.device}-${opts.variant}${scrollSuffix}.png`
  const destPath = path.join(outputDir, filename)

  const srcPath = path.resolve(process.cwd(), opts.file)
  if (!fs.existsSync(srcPath)) {
    console.error(chalk.red(`  ✗  File not found: ${opts.file}`))
    return false
  }

  const replacing = fs.existsSync(destPath)
  fs.copyFileSync(srcPath, destPath)

  const resize = config.resize ?? 1000
  spawnSync('sips', ['-Z', String(resize), destPath], { cwd: path.dirname(destPath) })

  console.log(chalk.green(`  ✓  ${filename}${replacing ? chalk.dim(' (replaced)') : ''}`))
  return true
}
