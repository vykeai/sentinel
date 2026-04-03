# Atlas Compatibility

Sentinel acts as a compatibility layer during the Atlas transition. It does not author Atlas manifests and it does not own Atlas capture orchestration.

## CLI Contract

Sentinel exposes three Atlas-facing commands:

```bash
sentinel atlas:import --atlas-manifest <file> [--session-index <file>] [--json]
sentinel atlas:export [--output <file>] [--json]
sentinel atlas:migrate [--atlas-manifest <file>] [--session-index <file>] [--write <file>] [--json]
```

- `atlas:import` reads an Atlas manifest and optional session capture index and summarizes what Sentinel will consume.
- `atlas:export` converts a legacy `catalog.screens` config into a surface-based compatibility fixture for Atlas migration work.
- `atlas:migrate` combines the legacy export and Atlas import views into one explicit migration plan.

Atlas-backed review HTML still goes through Sentinel's existing viewer contract:

```bash
sentinel catalog:index --atlas-manifest <file> [--session-index <file>] [--output-dir <dir>]
```

Atlas-backed validation also stays on the existing catalog command surface:

```bash
sentinel catalog:validate --atlas-manifest <file> [--session-index <file>]
```

Migration diagnostics use the doctor command:

```bash
sentinel doctor --atlas-manifest <file> [--session-index <file>]
```

Atlas validation classifies failures as:
- `coverage-drift`: an expected surface/scenario/target combination has no screenshot capture record
- `artifact-mismatch`: a capture record exists but the screenshot artifact is missing or non-renderable
- `adapter-misuse`: the manifest/session inputs disagree structurally

## Ownership Split

Sentinel transforms:
- legacy flat screen definitions into surface-based compatibility fixtures
- Atlas manifest references into compatibility summaries and dashboard indexes
- Atlas session capture records into dashboard inputs

Sentinel preserves:
- existing legacy catalog commands during migration
- existing screenshot files until a product switches validation inputs
- Atlas local ids, derived fully-qualified ids, and artifact paths exactly as Atlas produced them

Atlas owns:
- manifest authoring
- path taxonomy
- scenario preset vocabulary
- target and artifact naming
- capture session lifecycle and orchestration

## Fixture Examples

- Atlas manifest fixture: [`../examples/atlas/manifest.fitkind-mobile.v1.json`](../examples/atlas/manifest.fitkind-mobile.v1.json)
- Legacy catalog fixture: [`../examples/atlas/legacy-catalog.fitkind.json`](../examples/atlas/legacy-catalog.fitkind.json)
- Session capture index fixture: [`../examples/atlas/session-index.fitkind-mobile.v1.json`](../examples/atlas/session-index.fitkind-mobile.v1.json)

## Identity Contract

Atlas should author local ids and review paths in colon form:

- `productId`: `fitkind`
- `path.id`: `main:journey:list`
- `surface.id`: `journey:list`
- `scenario.id`: `journey:list:default`
- `target.id`: `ios:iphone15pro:light:en-gb`

Sentinel treats global uniqueness as derived data rather than requiring Atlas authors to prefix every local id with the product name.

When Atlas artifacts hit the filesystem, the path segments should use derived safe keys rather than the raw colon ids. Sentinel expects Atlas storage keys like:

- `main__journey__list`
- `journey__list`
- `journey__list__default`
- `ios__iphone15pro__light__en-gb`

## Ecosystem Sample Coverage

Sentinel keeps representative sample configs for the first Atlas adopters in [`../examples/ecosystem`](../examples/ecosystem):

- `onlystack.sentinel.yaml`: `ios/android` alias platforms with an intentionally empty starter catalog
- `fitkind.sentinel.yaml`: `apple/google` platforms, inline launch-arg flows, `app_ids` variants, and web surfaces
- `sitches.sentinel.yaml`: sparse legacy screen lists with no flows plus the current Android package/path drift shape

These fixtures back compatibility tests so loader/export failures point at concrete ecosystem drift instead of generic parsing errors.

## Session Handoff

Sentinel's Atlas-era capture boundary consumes a session capture index rather than assuming Sentinel itself navigated the app.

Each session capture record must provide:
- `pathId`
- `surfaceId`
- `scenarioId`
- `targetId`
- `entryStrategyId`
- `artifactKind`
- `fileName`
- `artifactPath`
- `capturedAt`
- `status`

`artifactPath` should use the reviewable Atlas layout:

`artifacts/<productId>/<pathKey>/<surfaceKey>/<scenarioKey>/<targetKey>/<entryStrategyKey>/<artifactKind>/<fileName>`

Each `*Key` segment is the filesystem-safe form derived from the authored Atlas id, not the raw id itself. Sentinel validates that these records line up with the manifest and uses them to build the review dashboard without taking ownership of Atlas orchestration.
