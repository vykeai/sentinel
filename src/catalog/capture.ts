// ─── Catalog Capture ────────────────────────────────────────────────────────
// Captures screenshots for all catalog screens across all OS/device/variant combinations.
// Uses simemu for simulator control and sips for resizing.

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import chalk from 'chalk'
import type {
  CatalogConfig, CatalogOSKey, CatalogDeviceType, CatalogVariant, CaptureResult, ExpectedShot,
} from './types.js'
import { resolveCatalogAppId } from './app-id.js'
import { buildExpectedShots } from './expected.js'

// iOS logical point swipe — scroll down (from bottom to top of viewport)
const IOS_SWIPE   = { x: 200, y1: 700, y2: 250 }
// Android pixel swipe — scroll down
const AND_SWIPE   = { x: 540, y1: 1900, y2: 700 }
const SWIPE_DURATION_MS = 500

function run(cmd: string, args: string[], cwd: string): { ok: boolean; stderr: string } {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 60_000 })
  return { ok: result.status === 0, stderr: result.stderr ?? '' }
}

function simemu(projectRoot: string, ...args: string[]): boolean {
  return run('simemu', args, projectRoot).ok
}

function sips(filePath: string, maxSize: number): boolean {
  return run('sips', ['-Z', String(maxSize), filePath], path.dirname(filePath)).ok
}

function setAppearance(projectRoot: string, slug: string, variant: CatalogVariant): boolean {
  if (variant === 'glossy-light' || variant === 'glossy-dark') {
    const mode = variant === 'glossy-light' ? 'light' : 'dark'
    simemu(projectRoot, 'appearance', slug, mode)
    return simemu(projectRoot, 'appearance', slug, 'glossy')
  }
  return simemu(projectRoot, 'appearance', slug, variant)
}

function getSwipe(os: CatalogOSKey) {
  return os === 'android' ? AND_SWIPE : IOS_SWIPE
}

export interface CaptureOptions {
  screenFilter?: string
  osFilter?: CatalogOSKey
  deviceFilter?: CatalogDeviceType
  variantFilter?: CatalogVariant
  appVariant?: string
  skipExisting?: boolean
}

export async function runCapture(
  config: CatalogConfig,
  projectRoot: string,
  opts: CaptureOptions = {}
): Promise<CaptureResult[]> {
  const outputDir = path.resolve(projectRoot, config.output)
  fs.mkdirSync(outputDir, { recursive: true })

  const resize = config.resize ?? 1000

  let shots = buildExpectedShots(config)
  if (opts.screenFilter)  shots = shots.filter((s) => s.screen === opts.screenFilter)
  if (opts.osFilter)      shots = shots.filter((s) => s.os     === opts.osFilter)
  if (opts.deviceFilter)  shots = shots.filter((s) => s.device === opts.deviceFilter)
  if (opts.variantFilter) shots = shots.filter((s) => s.variant === opts.variantFilter)

  const results: CaptureResult[] = []

  // Group by (screen, os, device) — each device has its own simemu slug
  const byScreenOSDevice = new Map<string, ExpectedShot[]>()
  for (const shot of shots) {
    const key = `${shot.screen}::${shot.os}::${shot.device}`
    const arr = byScreenOSDevice.get(key) ?? []
    arr.push(shot)
    byScreenOSDevice.set(key, arr)
  }

  for (const [key, groupShots] of byScreenOSDevice) {
    const [screenSlug, os, device] = key.split('::') as [string, CatalogOSKey, CatalogDeviceType]
    const screen = config.screens.find((s) => s.slug === screenSlug)!
    const deviceCfg = config[os]?.[device]!
    const simSlug = deviceCfg.slug
    const swipe = getSwipe(os)

    console.log(chalk.dim(`\n  ▸ ${screenSlug} / ${os} / ${device}`))

    const appSelection = resolveCatalogAppId(deviceCfg, opts.appVariant)
    if (!appSelection.appId) {
      console.log(chalk.red(`    ✗  ${appSelection.error}`))
      for (const shot of groupShots) {
        results.push({ shot, success: false, error: appSelection.error ?? 'No app_id configured' })
      }
      continue
    }

    // Skip screens with no flow — use catalog:upload instead
    if (!screen.flow) {
      console.log(chalk.dim(`    ○  no flow defined — use: sentinel catalog:upload`))
      for (const shot of groupShots) {
        results.push({ shot, success: false, error: 'No flow — use sentinel catalog:upload' })
      }
      continue
    }

    simemu(projectRoot, 'terminate', simSlug, appSelection.appId)
    const launched = simemu(projectRoot, 'launch', simSlug, appSelection.appId)
    if (!launched) {
      console.log(chalk.red(`    ✗  Failed to launch ${appSelection.appId}`))
      for (const shot of groupShots) {
        results.push({ shot, success: false, error: `Failed to launch ${appSelection.appId}` })
      }
      continue
    }
    console.log(chalk.dim(`    ○  app ${appSelection.appId}${appSelection.variant && appSelection.variant !== 'default' ? ` (${appSelection.variant})` : ''}`))
    spawnSync('sleep', ['1'])

    const flowPath = path.resolve(projectRoot, screen.flow)
    if (!fs.existsSync(flowPath)) {
      console.log(chalk.yellow(`    ⚠  Flow not found: ${screen.flow} — skipping`))
      for (const shot of groupShots) {
        results.push({ shot, success: false, error: `Flow not found: ${screen.flow}` })
      }
      continue
    }

    const navigated = simemu(projectRoot, 'maestro', simSlug, flowPath)
    if (!navigated) {
      console.log(chalk.red(`    ✗  Maestro navigation failed`))
      for (const shot of groupShots) {
        results.push({ shot, success: false, error: 'Maestro navigation failed' })
      }
      continue
    }

    // Group by variant — set appearance once per variant
    const byVariant = new Map<CatalogVariant, ExpectedShot[]>()
    for (const shot of groupShots) {
      const arr = byVariant.get(shot.variant) ?? []
      arr.push(shot)
      byVariant.set(shot.variant, arr)
    }

    for (const [variant, variantShots] of byVariant) {
      setAppearance(projectRoot, simSlug, variant)
      variantShots.sort((a, b) => a.scroll - b.scroll)

      let currentScroll = 1
      for (const shot of variantShots) {
        const outputPath = path.join(outputDir, shot.filename)

        if (opts.skipExisting && fs.existsSync(outputPath)) {
          console.log(chalk.dim(`    ○  ${shot.filename} — skipped`))
          results.push({ shot, success: true, skipped: true })
          continue
        }

        while (currentScroll < shot.scroll) {
          simemu(projectRoot, 'swipe', simSlug,
            String(swipe.x), String(swipe.y1),
            String(swipe.x), String(swipe.y2),
            '--duration', String(SWIPE_DURATION_MS)
          )
          currentScroll++
          spawnSync('sleep', ['0.5'])
        }

        const captured = simemu(projectRoot, 'screenshot', simSlug, '-o', outputPath)
        if (!captured) {
          console.log(chalk.red(`    ✗  ${shot.filename}`))
          results.push({ shot, success: false, error: 'Screenshot failed' })
          continue
        }

        sips(outputPath, resize)
        console.log(chalk.green(`    ✓  ${shot.filename}`))
        results.push({ shot, success: true })
      }
    }
  }

  return results
}
