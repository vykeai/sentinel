# Sentinel

Sentinel is the source of truth for cross-platform consistency: design tokens, strings, feature flags, models, API endpoints, mock transports, and the screen registry + catalog.

**Adherence to this guide is required.**

---

## First-Time Setup

Sentinel should be installed as a local project dependency:

```bash
npm install --save-dev @sentinel/cli
```

Then verify the local bin instead of relying on implicit `npx` installs:

```bash
npx --no-install sentinel doctor
```

---

## Before Every Task

```bash
npx --no-install sentinel schema:validate
```

If validation fails, stop and fix schema errors before proceeding.

---

## Schema Workflow

Edit schemas in the `sentinel/` directory. After any schema change:

```bash
npx --no-install sentinel schema:generate
```

**Never hand-edit generated output files.** They are listed in `sentinel.yaml → platforms[*].output`. Edit the schema, then regenerate.

---

## Screen Registry

`sentinel.yaml` is the authoritative registry of every screen, modal, and navigable view in the app. Every screen that exists in the codebase **must** be registered before the task is marked done.

### Register-first rule

When you write a new `*View.swift`, `*Screen.swift`, `*Screen.kt`, or `*View.kt` file, immediately add it to `sentinel.yaml` before moving on:

```yaml
screens:
  - slug: profile-detail     # kebab-case, derived from filename: ProfileDetailView → profile-detail
    name: Profile Detail      # human-readable label
    # flow: sentinel/flows/catalog/profile-detail.yaml  (add when Maestro flow is ready)
```

The `sentinel-registry` hook will warn you if you write a screen file without registering it. When you see that warning, stop and add the entry before continuing.

### Scan for unregistered screens

```bash
npx --no-install sentinel registry:scan
```

Reports all screen files in the codebase that are not in `sentinel.yaml screens:`. Fix every item before marking a task done. Run with `--file <path>` to check a single file.

---

## Mock Transport

Sentinel generates the network-layer mock interceptors (`MockURLProtocol.swift` for iOS, `MockDispatcher.kt` for Android) from a schema in `sentinel/schemas/platform/mock-config.json`.

### When to update mock-config.json

Whenever you add or change an API endpoint used by the app, update `mock-config.json` with the new fixture mapping, then regenerate:

```bash
npx --no-install sentinel mock:generate
```

### Validate fixtures

```bash
npx --no-install sentinel mock:validate
```

Checks every fixture file declared in `mock-config.json` exists on disk and matches the endpoint response schema. Run this before committing.

### mock-config.json structure

```json
{
  "$sentinel": "1.0",
  "type": "mock-config",
  "fixtures": [
    { "platform": "ios",     "path": "MyAppTests/Fixtures" },
    { "platform": "android", "path": "app/src/debug/assets/fixtures" }
  ],
  "endpoints": [
    { "method": "POST", "path": "/api/v1/auth/magic-link/request", "fixture": "auth/magic-link.json", "statusCode": 200 }
  ]
}
```

---

## Screen Catalog

The catalog is a collection of screenshots for every registered screen, OS version, device type, and visual variant.

### Configuration (`sentinel.yaml`)

```yaml
catalog:
  output: catalog/
  resize: 1000

  ios18:
    iphone:
      slug: myapp-ios
      app_id: com.example.app

  ios26:
    iphone:
      slug: myapp-ios26
      app_id: com.example.app
      glossy: true        # also captures glossy-light + glossy-dark variants

  android:
    phone:
      slug: myapp-android
      app_id: com.example.app

  screens:
    - slug: sign-in
      name: Sign In
      flow: sentinel/flows/catalog/sign-in.yaml
    - slug: home
      name: Home
      flow: sentinel/flows/catalog/home.yaml
      scrolls: 2           # captures scroll1, scroll2 in addition to base
    - slug: profile
      name: Profile
      # no flow — use catalog:upload for manual screenshots
```

### Filename Convention

```
{screen}-{os}-{device}-{variant}[-scroll{N}].png
```

Examples:
- `sign-in-ios18-iphone-light.png`
- `sign-in-ios18-iphone-dark.png`
- `home-ios26-iphone-glossy-light.png`
- `home-android-phone-dark-scroll2.png`

Supported OS keys: `ios18`, `ios26`, `android`, `watchos`, `tvos`
Supported device types: `iphone`, `ipad`, `watch`, `phone`, `tablet`, `tv`
Supported variants: `light`, `dark`, `glossy-light`, `glossy-dark`

### Commands

```bash
# Capture all screenshots (requires Maestro flow: on each screen entry)
npx --no-install sentinel catalog:capture

# Filter
npx --no-install sentinel catalog:capture --screen sign-in
npx --no-install sentinel catalog:capture --os ios18
npx --no-install sentinel catalog:capture --os android --device phone
npx --no-install sentinel catalog:capture --os android --app-variant dev

# Upload a single screenshot manually (for screens without a flow)
npx --no-install sentinel catalog:upload --screen profile --os ios18 --device iphone --variant light /tmp/shot.png

# Validate all expected screenshots exist (CI gate)
npx --no-install sentinel catalog:validate

# Validate Atlas fixture coverage and artifact presence
npx --no-install sentinel catalog:validate \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json

# Diagnose Atlas migration mistakes and script wiring
npx --no-install sentinel doctor \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json

# Generate + open the interactive HTML viewer
npx --no-install sentinel catalog:index && open catalog/index.html

# Render Atlas fixtures through the same viewer contract
npx --no-install sentinel catalog:index \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json \
  --output-dir catalog && open catalog/index.html
```

### Rules

- **Never create your own HTML screen viewer.** `sentinel catalog:index` is the only permitted viewer.
- Atlas-backed validation also stays on the legacy command surface: use `sentinel catalog:validate --atlas-manifest ... --session-index ...`.
- Atlas-backed migration diagnostics live on `sentinel doctor --atlas-manifest ... --session-index ...`.
- Atlas-backed review runs must still go through `sentinel catalog:index`; Atlas summary commands are not a separate viewer.
- Never commit hand-crafted screenshot HTML, base64-embedded images, or custom catalog viewers.
- Screens without a Maestro `flow` cannot use `catalog:capture` — use `catalog:upload` instead.
- After adding a new screen to `sentinel.yaml`, capture or upload all required variants before marking done.
- After capture, run `catalog:validate` to confirm no variants are missing.
