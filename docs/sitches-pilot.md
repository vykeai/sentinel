# Sitches Pilot

This pilot is the first Atlas-authored Sitches subset that stays small enough
to review while still proving the core pipeline:

- manifest authoring in Atlas
- capture planning through the simemu session runner
- derived artifact indexing
- a static review dashboard over the same manifest model

## v1 Surface Set

The pilot keeps five surfaces in scope:

- `discover:feed`
- `discover:profile`
- `trust:verification`
- `messages:inbox`
- `messages:thread`

That subset covers discovery, trust gating, and direct messaging without
pretending Atlas owns the rest of the product surface.

## What Sitches Still Needs

The pilot is intentionally not the full product catalog. Sitches still needs:

- a stable deep-link contract for `discover:profile` and `messages:thread`
- a deterministic launch-argument contract for the discovery feed and inbox
- a product-owned deterministic route for trust verification instead of only
  the Maestro scaffold fallback
- explicit handling for empty states, blocked users, safety escalations, and
  message compose error paths outside the v1 subset

## Review Outputs

Atlas writes the pilot outputs under `artifacts/sitches-pilot/`:

- `session-runner.plan.json`
- `capture-artifact-index.json`
- `review-export-payload.json`
- `dashboard/index.html`
- `dashboard/dashboard-data.json`

Those files are the concrete review pack for the pilot.
# Sitches Pilot

This pilot is the first Atlas-authored Sitches subset that stays small enough
to review while still proving the core pipeline:

- manifest authoring in Atlas
- capture planning through the simemu session runner
- derived artifact indexing
- a static review dashboard over the same manifest model

## v1 Surface Set

The pilot keeps five surfaces in scope:

- `discover:feed`
- `discover:profile`
- `trust:verification`
- `messages:inbox`
- `messages:thread`

That subset covers discovery, trust gating, and direct messaging without
pretending Atlas owns the rest of the product surface.

## What Sitches Still Needs

The pilot is intentionally not the full product catalog. Sitches still needs:

- a stable deep-link contract for `discover:profile` and `messages:thread`
- a deterministic launch-argument contract for the discovery feed and inbox
- a product-owned deterministic route for trust verification instead of only
  the Maestro scaffold fallback
- explicit handling for empty states, blocked users, safety escalations, and
  message compose error paths outside the v1 subset

## Review Outputs

Atlas writes the pilot outputs under `artifacts/sitches-pilot/`:

- `session-runner.plan.json`
- `capture-artifact-index.json`
- `review-export-payload.json`
- `dashboard/index.html`
- `dashboard/dashboard-data.json`

Those files are the concrete review pack for the pilot.
