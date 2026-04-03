# Atlas Migration

Sentinel's Atlas transition is intentionally a compatibility phase, not a flag-day rewrite.

## Ownership

Sentinel owns:
- legacy `catalog.screens` compatibility
- Atlas fixture validation and migration diagnostics
- dashboard and validation adapters that consume Atlas outputs

Atlas owns:
- manifest authoring
- session orchestration
- artifact identity and indexing
- entry-strategy semantics
- local colon-based ids and the safe-key storage mapping used on disk

## Migration Phases

1. Legacy-only
- Products keep using `catalog.screens`.
- Sentinel owns capture, HTML, and validation on the legacy model.

2. Compatibility phase
- Products add Atlas manifests and session indexes while keeping legacy catalog inputs alive.
- Sentinel consumes Atlas fixtures through:
  - `sentinel catalog:index --atlas-manifest ... --session-index ...`
  - `sentinel catalog:validate --atlas-manifest ... --session-index ...`
  - `sentinel doctor --atlas-manifest ... --session-index ...`
- Atlas owns the surface/scenario/target model; Sentinel adapts it for review and validation.

3. Atlas-backed review and validation
- Teams wire scripts and CI to the Atlas-backed `catalog:index` and `catalog:validate` paths.
- Sentinel Doctor should report no Atlas fixture or script-wiring issues.

4. Legacy retirement
- Once a product no longer relies on `catalog.screens` for review or validation, remove the legacy wiring deliberately.
- Do not remove legacy inputs until Atlas-backed review and validation are stable in CI.

## Common Migration Mistakes

- Passing a session index without a manifest.
- Letting manifest and session IDs drift apart.
- Reusing raw colon ids directly as filesystem path segments instead of Atlas safe keys.
- Keeping package scripts on bare `catalog:index` / `catalog:validate` while claiming Atlas migration is active.
- Treating Maestro as the default entry path instead of a fallback behind deterministic harness entry.

## Recommended Scripts

```json
{
  "scripts": {
    "catalog:index": "sentinel catalog:index --atlas-manifest atlas/manifest.json --session-index atlas/session-index.json",
    "catalog:validate": "sentinel catalog:validate --atlas-manifest atlas/manifest.json --session-index atlas/session-index.json",
    "doctor:atlas": "sentinel doctor --atlas-manifest atlas/manifest.json --session-index atlas/session-index.json"
  }
}
```
