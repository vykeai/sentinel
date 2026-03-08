// ─── Catalog HTML Index ─────────────────────────────────────────────────────
// Generates catalog/index.html — a browsable grid of all screenshots
// organized by screen, with OS·Device tabs and variant tabs.

import fs from 'fs'
import path from 'path'
import type { CatalogConfig, CatalogVariant } from './types.js'
import { buildExpectedShots, activeOSDevicePairs } from './expected.js'
import { OS_LABELS, DEVICE_LABELS, VARIANT_LABELS } from './types.js'

export function generateIndex(config: CatalogConfig, projectRoot: string): void {
  const outputDir = path.resolve(projectRoot, config.output)
  const shots = buildExpectedShots(config)

  // Group shots by screen slug
  const byScreen = new Map<string, typeof shots>()
  for (const shot of shots) {
    const arr = byScreen.get(shot.screen) ?? []
    arr.push(shot)
    byScreen.set(shot.screen, arr)
  }

  const pairs = activeOSDevicePairs(config)
  const allVariants = Array.from(new Set(shots.map((s) => s.variant)))

  function tabKey(os: string, device: string) { return `${os}::${device}` }
  function tabLabel(os: string, device: string) {
    return `${OS_LABELS[os as keyof typeof OS_LABELS] ?? os} ${DEVICE_LABELS[device as keyof typeof DEVICE_LABELS] ?? device}`
  }

  const screenCards = Array.from(byScreen.entries()).map(([slug, screenShots]) => {
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    // Build columns per OS+Device pair
    const cols = pairs.map(({ os, device }, i) => {
      const key = tabKey(os, device)
      const variantGroups = allVariants.map((variant) => {
        const matchingShots = screenShots
          .filter((s) => s.os === os && s.device === device && s.variant === variant)
          .sort((a, b) => a.scroll - b.scroll)

        if (matchingShots.length === 0) return ''
        const imgs = matchingShots.map((s) =>
          `<img src="${s.filename}" alt="${slug} ${tabLabel(os, device)} ${variant} scroll${s.scroll}" loading="lazy"
               class="shot" onerror="this.style.opacity='0.15'">`
        ).join('\n')
        return `<div class="variant-group" data-variant="${variant}">${imgs}</div>`
      }).join('\n')

      return `<div class="osd-col${i === 0 ? ' visible' : ''}" data-key="${key}">${variantGroups}</div>`
    }).join('\n')

    const osdTabs = pairs.map(({ os, device }, i) =>
      `<button class="tab${i === 0 ? ' active' : ''}" data-key="${tabKey(os, device)}">${tabLabel(os, device)}</button>`
    ).join('')

    const varTabs = allVariants.map((v, i) =>
      `<button class="vtab${i === 0 ? ' active' : ''}" data-variant="${v}">${VARIANT_LABELS[v]}</button>`
    ).join('')

    return `
<div class="screen-card" id="${slug}">
  <h2 class="screen-title"><a href="#${slug}">${title}</a></h2>
  <div class="tab-row">${osdTabs}</div>
  <div class="tab-row">${varTabs}</div>
  <div class="img-grid">${cols}</div>
</div>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screen Catalog — ${byScreen.size} screens</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
  h1 { font-size: 1.3rem; font-weight: 600; color: #fff; margin-bottom: 2rem; opacity: 0.5; letter-spacing: 0.02em; }
  .screen-card { margin-bottom: 3rem; border: 1px solid #1e1e1e; border-radius: 12px; padding: 1.5rem; background: #111; }
  .screen-title { font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 1rem; }
  .screen-title a { color: inherit; text-decoration: none; }
  .screen-title a:hover { text-decoration: underline; }
  .tab-row { display: flex; gap: 0.35rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
  .tab, .vtab {
    background: #181818; border: 1px solid #2a2a2a; color: #888; border-radius: 6px;
    padding: 0.25rem 0.65rem; font-size: 0.75rem; cursor: pointer; transition: all 0.12s;
  }
  .tab.active { background: #1e2030; border-color: #445; color: #aac; }
  .vtab.active { background: #201e18; border-color: #544; color: #cba; }
  .img-grid { display: flex; gap: 1rem; align-items: flex-start; overflow-x: auto; padding-bottom: 0.5rem; margin-top: 0.75rem; }
  .osd-col { display: none; flex-direction: column; gap: 0.5rem; }
  .osd-col.visible { display: flex; }
  .variant-group { display: none; flex-direction: row; gap: 0.5rem; }
  .variant-group.visible { display: flex; }
  .shot { width: 160px; border-radius: 10px; border: 1px solid #222; display: block; background: #1a1a1a; }
</style>
</head>
<body>
<h1>Screen Catalog &mdash; ${byScreen.size} screens &mdash; ${shots.length} shots</h1>
${screenCards}
<script>
(function() {
  document.querySelectorAll('.screen-card').forEach(function(card) {
    var activeKey     = card.querySelector('.tab.active')?.dataset.key
    var activeVariant = card.querySelector('.vtab.active')?.dataset.variant

    function refresh() {
      card.querySelectorAll('.osd-col').forEach(function(col) {
        var show = col.dataset.key === activeKey
        col.classList.toggle('visible', show)
      })
      card.querySelectorAll('.variant-group').forEach(function(grp) {
        var col = grp.closest('.osd-col')
        grp.classList.toggle('visible', col?.classList.contains('visible') && grp.dataset.variant === activeVariant)
      })
    }

    card.querySelectorAll('.tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        card.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        activeKey = btn.dataset.key
        refresh()
      })
    })

    card.querySelectorAll('.vtab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        card.querySelectorAll('.vtab').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        activeVariant = btn.dataset.variant
        refresh()
      })
    })

    refresh()
  })
})()
</script>
</body>
</html>`

  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf-8')
}
