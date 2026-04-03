// ─── Catalog HTML Index ─────────────────────────────────────────────────────
// Generates reviewable HTML for both legacy flat catalogs and Atlas-era
// surface/scenario/target artifacts.

import fs from 'fs'
import path from 'path'
import type {
  CatalogConfig,
  CatalogPath,
  CatalogSurface,
  CatalogVariant,
} from './types.js'
import {
  type AtlasManifestFixture,
  type AtlasSessionCaptureIndex,
  validateAtlasFixtureSet,
  validateAtlasManifestFixture,
  validateAtlasSessionCaptureIndex,
} from './atlas-compat.js'
import { legacyCatalogToSurfaces } from './adapter.js'
import { buildExpectedShots } from './expected.js'
import { DEVICE_LABELS, OS_LABELS, VARIANT_LABELS } from './types.js'

interface DashboardCapture {
  key: string
  label: string
  src?: string
  status: 'captured' | 'missing' | 'failed'
}

interface DashboardTargetGroup {
  id: string
  title: string
  subtitle?: string
  captures: DashboardCapture[]
}

interface DashboardScenarioGroup {
  id: string
  title: string
  subtitle?: string
  targets: DashboardTargetGroup[]
}

interface DashboardSurfaceGroup {
  id: string
  title: string
  subtitle?: string
  scenarios: DashboardScenarioGroup[]
}

interface DashboardPathGroup {
  id: string
  title: string
  subtitle?: string
  surfaces: DashboardSurfaceGroup[]
}

interface DashboardModel {
  title: string
  summary: string
  paths: DashboardPathGroup[]
}

function formatPath(pathValue: CatalogPath): string {
  if (pathValue.display) return pathValue.display
  return pathValue.segments
    .map((segment) => segment.label ?? segment.id)
    .join(' / ')
}

function titleFromId(value: string): string {
  return value
    .split(/[.:-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toDomId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'
}

function renderCapture(capture: DashboardCapture): string {
  const statusClass = capture.status === 'captured'
    ? 'captured'
    : capture.status === 'failed'
      ? 'failed'
      : 'missing'

  const preview = capture.src
    ? `<img src="${escapeHtml(capture.src)}" alt="${escapeHtml(capture.label)}" loading="lazy" class="shot">`
    : `<div class="shot placeholder">${capture.status.toUpperCase()}</div>`

  return `
<div class="capture ${statusClass}">
  <div class="capture-label">${escapeHtml(capture.label)}</div>
  ${preview}
</div>`
}

function renderTarget(target: DashboardTargetGroup): string {
  return `
<div class="target-card" id="${toDomId(target.id)}">
  <div class="target-header">
    <h5>${escapeHtml(target.title)}</h5>
    ${target.subtitle ? `<div class="meta">${escapeHtml(target.subtitle)}</div>` : ''}
  </div>
  <div class="capture-grid">
    ${target.captures.map(renderCapture).join('\n')}
  </div>
</div>`
}

function renderScenario(scenario: DashboardScenarioGroup): string {
  return `
<section class="scenario-card" id="${toDomId(scenario.id)}">
  <h4>${escapeHtml(scenario.title)}</h4>
  ${scenario.subtitle ? `<div class="meta">${escapeHtml(scenario.subtitle)}</div>` : ''}
  <div class="target-grid">
    ${scenario.targets.map(renderTarget).join('\n')}
  </div>
</section>`
}

function renderSurface(surface: DashboardSurfaceGroup): string {
  return `
<section class="surface-card" id="${toDomId(surface.id)}">
  <h3>${escapeHtml(surface.title)}</h3>
  ${surface.subtitle ? `<div class="meta">${escapeHtml(surface.subtitle)}</div>` : ''}
  <div class="scenario-stack">
    ${surface.scenarios.map(renderScenario).join('\n')}
  </div>
</section>`
}

function renderPathGroup(pathGroup: DashboardPathGroup): string {
  return `
<section class="path-card" id="${toDomId(pathGroup.id)}">
  <h2>${escapeHtml(pathGroup.title)}</h2>
  ${pathGroup.subtitle ? `<div class="meta">${escapeHtml(pathGroup.subtitle)}</div>` : ''}
  <div class="surface-stack">
    ${pathGroup.surfaces.map(renderSurface).join('\n')}
  </div>
</section>`
}

function renderDashboard(model: DashboardModel): string {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #ececec; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 700; color: #fff; margin-bottom: 0.35rem; }
  h2 { font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 0.35rem; }
  h3 { font-size: 1rem; font-weight: 650; color: #fff; margin-bottom: 0.35rem; }
  h4 { font-size: 0.92rem; font-weight: 650; color: #fff; margin-bottom: 0.3rem; }
  h5 { font-size: 0.82rem; font-weight: 650; color: #fff; }
  p, .meta { color: #a6a6a6; line-height: 1.4; }
  .summary { margin-bottom: 1.75rem; color: #c5c5c5; }
  .path-card, .surface-card, .scenario-card, .target-card {
    border: 1px solid #1f1f1f;
    border-radius: 14px;
    background: #111;
  }
  .path-card { padding: 1.2rem; margin-bottom: 1.25rem; }
  .surface-card { padding: 1rem; margin-top: 0.9rem; background: #131313; }
  .scenario-card { padding: 0.9rem; margin-top: 0.8rem; background: #151515; }
  .target-card { padding: 0.8rem; background: #171717; }
  .surface-stack, .scenario-stack { display: flex; flex-direction: column; gap: 0.8rem; }
  .target-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.8rem;
    margin-top: 0.7rem;
  }
  .capture-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.65rem;
    margin-top: 0.7rem;
  }
  .capture { display: flex; flex-direction: column; gap: 0.35rem; }
  .capture-label { font-size: 0.72rem; color: #b5b5b5; }
  .shot {
    width: 100%;
    min-height: 180px;
    object-fit: contain;
    border-radius: 10px;
    border: 1px solid #232323;
    background: #1b1b1b;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
  }
  .capture.missing .placeholder { color: #d6b86d; }
  .capture.failed .placeholder { color: #e88d8d; }
  .meta { font-size: 0.78rem; }
</style>
</head>
<body>
<h1>${escapeHtml(model.title)}</h1>
<p class="summary">${escapeHtml(model.summary)}</p>
${model.paths.map(renderPathGroup).join('\n')}
</body>
</html>`

  return html
}

function buildLegacyModel(config: CatalogConfig, projectRoot: string): DashboardModel {
  const outputDir = path.resolve(projectRoot, config.output)
  const shots = buildExpectedShots(config)
  const shotsByScreen = new Map<string, typeof shots>()
  for (const shot of shots) {
    const existing = shotsByScreen.get(shot.screen) ?? []
    existing.push(shot)
    shotsByScreen.set(shot.screen, existing)
  }

  const paths = legacyCatalogToSurfaces(config).map((surface): DashboardPathGroup => {
    const legacyShots = shotsByScreen.get(surface.id) ?? []
    const targetMap = new Map<string, DashboardTargetGroup>()

    for (const shot of legacyShots) {
      const key = `${shot.os}::${shot.device}`
      const target = targetMap.get(key) ?? {
        id: `${surface.id}-${key}`,
        title: `${OS_LABELS[shot.os]} ${DEVICE_LABELS[shot.device]}`,
        subtitle: `${shot.os} · ${shot.device}`,
        captures: [],
      }

      const filePath = path.join(outputDir, shot.filename)
      target.captures.push({
        key: shot.filename,
        label: `${VARIANT_LABELS[shot.variant]}${shot.scroll > 1 ? ` · Scroll ${shot.scroll}` : ''}`,
        src: fs.existsSync(filePath) ? shot.filename : undefined,
        status: fs.existsSync(filePath) ? 'captured' : 'missing',
      })
      targetMap.set(key, target)
    }

    const scenario = surface.scenarios[0]
    return {
      id: `path-${surface.id}`,
      title: surface.name ?? titleFromId(surface.id),
      subtitle: formatPath(surface.path),
      surfaces: [
        {
          id: surface.id,
          title: surface.name ?? titleFromId(surface.id),
          subtitle: `${surface.kind} · legacy catalog surface`,
          scenarios: [
            {
              id: `${surface.id}-${scenario?.id ?? 'default'}`,
              title: scenario?.name ?? 'Default',
              subtitle: scenario?.id ?? 'default',
              targets: Array.from(targetMap.values()),
            },
          ],
        },
      ],
    }
  })

  return {
    title: `Screen Catalog — ${paths.length} legacy surfaces`,
    summary: 'Legacy flat catalogs still render as hierarchical path → surface → scenario → target groups during Atlas migration.',
    paths,
  }
}

function buildAtlasModel(
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
  projectRoot: string,
  outputDir: string,
): DashboardModel {
  const pathById = new Map(manifest.paths.map((entry) => [entry.id, entry]))
  const scenarioById = new Map(manifest.scenarios.map((entry) => [entry.id, entry]))
  const targetById = new Map(manifest.targets.map((entry) => [entry.id, entry]))

  const capturesByKey = new Map<string, typeof sessionIndex.captures>()
  for (const capture of sessionIndex.captures) {
    const key = `${capture.surfaceId}::${capture.scenarioId}::${capture.targetId}`
    const existing = capturesByKey.get(key) ?? []
    existing.push(capture)
    capturesByKey.set(key, existing)
  }

  const paths = manifest.paths.map((pathEntry): DashboardPathGroup => {
    const surfaces = manifest.surfaces
      .filter((surface) => surface.pathId === pathEntry.id)
      .map((surface): DashboardSurfaceGroup => {
        const scenarios = surface.scenarioIds.map((scenarioId): DashboardScenarioGroup => {
          const scenario = scenarioById.get(scenarioId)
          const targets = surface.targetIds.map((targetId): DashboardTargetGroup => {
            const target = targetById.get(targetId)
            const captureKey = `${surface.id}::${scenarioId}::${targetId}`
            const captures = capturesByKey.get(captureKey) ?? []
            const dashboardCaptures: DashboardCapture[] = captures.length > 0
              ? captures.map((capture) => {
                  const absolute = path.resolve(projectRoot, capture.artifactPath)
                  return {
                    key: capture.artifactPath,
                    label: `${capture.artifactKind} · ${capture.fileName}`,
                    src: capture.status === 'captured' && fs.existsSync(absolute)
                      ? path.relative(outputDir, absolute).replaceAll(path.sep, '/')
                      : undefined,
                    status: capture.status,
                  }
                })
              : [{
                  key: `${surface.id}-${scenarioId}-${targetId}-missing`,
                  label: 'No capture record',
                  status: 'missing',
                }]

            return {
              id: `${surface.id}-${targetId}`,
              title: target?.deviceName ?? targetId,
              subtitle: target
                ? `${target.platform} · ${target.deviceClass} · ${target.appearance} · ${target.locale}${target.variant ? ` · ${target.variant}` : ''}`
                : targetId,
              captures: dashboardCaptures,
            }
          })

          return {
            id: `${surface.id}-${scenarioId}`,
            title: scenario?.title ?? scenarioId,
            subtitle: scenario ? `${scenario.presetId} · ${scenario.scope}` : scenarioId,
            targets,
          }
        })

        return {
          id: surface.id,
          title: surface.title,
          subtitle: `${surface.kind} · ${surface.id}`,
          scenarios,
        }
      })

    const labels = pathEntry.segments.map((segment) => segment.label ?? segment.value).join(' / ')
    return {
      id: pathEntry.id,
      title: pathEntry.title,
      subtitle: `${pathEntry.kind} · ${labels}`,
      surfaces,
    }
  })

  return {
    title: `Atlas Review Dashboard — ${manifest.surfaces.length} surfaces`,
    summary: `Atlas-backed artifacts grouped by path, surface, scenario, and target for ${manifest.metadata.productName}.`,
    paths,
  }
}

export function generateIndex(config: CatalogConfig, projectRoot: string): void {
  const outputDir = path.resolve(projectRoot, config.output)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'index.html'), renderDashboard(buildLegacyModel(config, projectRoot)), 'utf-8')
}

export function generateAtlasIndex(
  outputDir: string,
  projectRoot: string,
  manifest: AtlasManifestFixture,
  sessionIndex: AtlasSessionCaptureIndex,
): void {
  validateAtlasManifestFixture(manifest, 'atlas manifest')
  validateAtlasSessionCaptureIndex(sessionIndex, 'atlas session index')
  validateAtlasFixtureSet(manifest, sessionIndex, 'atlas fixture set')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'index.html'), renderDashboard(buildAtlasModel(manifest, sessionIndex, projectRoot, outputDir)), 'utf-8')
}
