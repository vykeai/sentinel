# sentinel

## Screenshot Storage

Save every screenshot to `~/Desktop/screenshots/{project-name}/`.
Use the git repo name for `{project-name}`:

```bash
export PROJECT_SCREENSHOT_DIR=~/Desktop/screenshots/$(basename "$(git rev-parse --show-toplevel)")
mkdir -p "$PROJECT_SCREENSHOT_DIR"
```

Do not keep proof or review screenshots in `/tmp`.

## What This Is
`sentinel` is the cross-platform product integrity CLI for schemas, contracts, mocks, screen registries, visual parity, and catalog capture across Apple, Google, and web surfaces.

## Tech Stack
TypeScript, Commander, AJV, js-yaml, Vitest, Anthropic SDK

## Key Commands
- `npm run build`
- `npm test`
- `npm run schema:validate`
- `npm run schema:generate`
- `npm run doctor`

## Conventions
- Treat schema files as the source of truth and generated outputs as disposable artifacts.
- Keep command behavior stable because product repos wire these commands directly into docs, hooks, and CI.
- Preserve platform-neutral contracts first, then generate platform-specific output from them.
- Read `SENTINEL.md` before changing workflow or catalog assumptions.

## Architecture Notes
- Sentinel is infrastructure for many downstream repos, so compatibility matters more than local convenience.
- Schema validation, mock transport generation, and catalog capture are one workflow, not separate silos.
- The screen registry and catalog naming conventions are externally depended on by project docs and hooks.

## Do Not
- Hand-edit generated output and then treat it as source of truth.
- Rename commands, flags, or sentinel.yaml semantics casually.
- Break mock generation, catalog capture, or registry scanning contracts without coordinated downstream changes.

## Workflow
- When changing schema behavior, verify `schema:validate`, `schema:generate`, and the relevant catalog/mock commands together.
- If you alter `SENTINEL.md`, keep the repo docs and generated project instructions aligned.
