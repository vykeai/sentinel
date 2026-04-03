# 🛡️ Sentinel

**Cross-platform product integrity for apps shipping on iOS, Android, and web.**

Sentinel is a CLI tool that keeps your design tokens, strings, feature flags, models, API contracts, network mocks, and screen catalog consistent across every platform — automatically.

> *"Is this product correct, consistent, and complete?"* — Sentinel answers that question.

---

## ✨ What it does

| Command | Description |
|---------|-------------|
| `sentinel schema:validate` | Validates all schemas, checks for generated-file drift, warns on missing fixtures |
| `sentinel schema:generate` | Generates tokens, strings, feature flags, models, and endpoints for all platforms |
| `sentinel contracts` | Validates API endpoint model references are consistent across platforms |
| `sentinel mock:generate` | Generates `MockURLProtocol.swift` (iOS) + `MockDispatcher.kt` (Android) |
| `sentinel mock:validate` | Validates all fixture JSON against endpoint response schemas |
| `sentinel doctor` | Checks install health, local script wiring, config presence, mock integration drift, and Atlas migration mistakes |
| `sentinel catalog:capture` | Captures screenshots for every registered screen via Maestro flows |
| `sentinel catalog:upload` | Uploads a single screenshot manually for screens without a flow |
| `sentinel catalog:validate` | CI gate — confirms expected legacy screenshots or Atlas artifacts exist |
| `sentinel catalog:index` | Generates the interactive HTML catalog viewer for legacy catalogs or Atlas fixtures |
| `sentinel atlas:import` | Reads an Atlas manifest and optional session index as a Sentinel compatibility input |
| `sentinel atlas:export` | Exports legacy `catalog.screens` data into a surface-based migration fixture |
| `sentinel atlas:migrate` | Writes an explicit migration plan showing what Sentinel transforms versus what Atlas owns |
| `sentinel registry:scan` | Finds screen files in the codebase not registered in `sentinel.yaml` |
| `sentinel chaos` | Runs chaos scenarios (network, auth, data, payment, platform) |
| `sentinel flows` | Runs Maestro and Playwright end-to-end flows |
| `sentinel visual` | Runs visual parity checks across platforms |
| `sentinel perf` | Runs performance benchmarks |
| `sentinel brain` | AI-powered issue analysis across all sentinel results |
| `sentinel all` | Runs validate → generate → mock:generate |

---

## 🔧 Installation

```bash
npm install --save-dev @sentinel/cli
```

Copy the example config to your repo root:

```bash
cp node_modules/@sentinel/cli/sentinel.yaml.example sentinel.yaml
```

Edit output paths to match your project structure, then run:

```bash
npx --no-install sentinel doctor
npx --no-install sentinel schema:validate
```

In `package.json` scripts, prefer the local bin directly:

```json
{
  "scripts": {
    "schema:validate": "sentinel schema:validate",
    "mock:validate": "sentinel mock:validate"
  }
}
```

---

## 📁 Project structure

```
sentinel/
├── schemas/
│   ├── design/
│   │   ├── tokens.json          # design tokens
│   │   └── strings.json         # localised strings
│   ├── features/
│   │   └── auth-endpoints.json  # endpoint definitions
│   ├── models/
│   │   └── user.json            # shared data models
│   └── platform/
│       ├── feature-flags.json
│       ├── mock-config.json     # endpoint → fixture mappings
│       └── navigation.json
└── fixtures/
    ├── auth/
    │   └── verify-response.json
    └── radar/
        └── nearby.json
```

---

## 🌐 Network-level mocking

Sentinel's flagship feature. Generated mock code intercepts at the **transport layer** — `URLSession` on iOS, `OkHttpClient` on Android. Your app's ViewModels, Services, and APIClient are completely unaware they're receiving local JSON.

```
sentinel/schemas/platform/mock-config.json
    declares: endpoint path → fixture file

sentinel/fixtures/
    radar/nearby.json
    browse/profiles.json
    chat/messages.json

sentinel mock:generate
    → apple/…/MockURLProtocol.swift    (URLProtocol subclass)
    → google/…/MockDispatcher.kt       (MockWebServer Dispatcher)
```

Fixture JSON lives in one place. Both platforms read from it. When the backend changes a response shape, you update the fixture once and both platforms stay in sync.

### mock-config.json format

```json
{
  "$sentinel": "1.0",
  "type": "mock-config",
  "id": "mock-config",

  "fixtures": [
    { "platform": "apple",  "path": "sentinel/fixtures" },
    { "platform": "google", "path": "sentinel/fixtures" }
  ],

  "endpoints": [
    { "method": "GET",  "path": "/api/v1/radar/nearby",             "fixture": "radar/nearby.json" },
    { "method": "POST", "path": "/api/v1/auth/magic-link/verify",   "fixture": "auth/verify-response.json" },
    { "method": "GET",  "path": "/api/v1/chat/:matchId/messages",   "fixture": "chat/messages.json", "statusCode": 200 }
  ]
}
```

Path parameters like `:matchId` are automatically treated as wildcards in the generated routing.

### iOS setup

**1. Add `sentinel/fixtures/` as a folder reference in Xcode** (drag into Project Navigator → "Create folder references" → Debug target only, never Release).

**2. Register `MockURLProtocol` in your app entry point:**

```swift
@main
struct MyApp: App {
    init() {
        #if DEBUG
        URLProtocol.registerClass(MockURLProtocol.self)
        #endif
    }
}
```

**3. Run `sentinel mock:generate`** whenever you add or change an endpoint.

Every `URLSession.shared.data(for:)` call now returns local JSON with a simulated 300ms delay.

### Android setup

**1. Copy or symlink `sentinel/fixtures/` into `android/app/src/debug/assets/fixtures/`** — Gradle includes `debug/assets/` in debug builds only.

**2. Add MockWebServer to your debug dependencies:**

```kotlin
debugImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
```

**3. Wire `MockDispatcher` in a Hilt debug module:**

```kotlin
@Module @InstallIn(SingletonComponent::class)
object DebugNetworkModule {
    @Provides @Singleton
    fun provideMockServer(@ApplicationContext ctx: Context): MockWebServer =
        MockWebServer().apply {
            dispatcher = MockDispatcher(ctx.assets)
            start()
        }

    @Provides @Singleton @Named("apiBaseUrl")
    fun provideBaseUrl(server: MockWebServer): String = server.url("/").toString()
}
```

**4. Run `sentinel mock:generate`** whenever you add or change an endpoint.

### Fixture validation

```bash
npx --no-install sentinel mock:validate
```

```
✓ GET  /api/v1/radar/nearby     → radar/nearby.json
✓ GET  /api/v1/matches          → chat/matches.json
✗ GET  /api/v1/profile/me       → profile/me.json: missing required field 'displayName'
```

Run this in CI to catch drift before it ships. If a backend engineer removes a field, CI fails.

---

## 📸 Screen catalog

The catalog is a collection of screenshots for every registered screen, OS version, device type, and visual variant.

Sentinel still accepts the legacy flat `catalog.screens` list, but it now treats that as a compatibility layer for the richer Atlas-era review model:
- `surface` is the review unit
- `scenario` is one state of that surface
- `target` is one OS / device / variant capture combination

Legacy screens map to a single `default` scenario through Sentinel's adapter boundary so products can migrate without losing clarity about the eventual model.

### Atlas Compatibility

Sentinel's Atlas-era compatibility layer is contract-first:

```bash
npx --no-install sentinel atlas:import --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json

npx --no-install sentinel atlas:export --output tmp/atlas-export.json
npx --no-install sentinel atlas:migrate --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --write tmp/atlas-migration.json
```

Those commands define the migration boundary without pretending Sentinel owns Atlas authoring or Atlas capture orchestration. See [docs/atlas-compatibility.md](/Users/luke/dev/onlytools/sentinel/docs/atlas-compatibility.md).

For the transition plan and recommended script wiring, see [docs/atlas-migration.md](/Users/luke/dev/onlytools/sentinel/docs/atlas-migration.md).

Use the existing viewer command to open Atlas-backed review hierarchies:

```bash
npx --no-install sentinel catalog:index \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json \
  --output-dir catalog
```

Atlas-backed validation uses the same `catalog:validate` command and reports coverage drift separately from artifact mismatches:

```bash
npx --no-install sentinel catalog:validate \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json
```

### Configuration

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
      glossy: true        # captures glossy-light + glossy-dark variants

  android:
    phone:
      slug: myapp-android
      app_ids:
        dev: com.example.app.dev
        prod: com.example.app

  screens:
    - slug: sign-in
      name: Sign In
      flow: sentinel/flows/catalog/sign-in.yaml
    - slug: home
      name: Home
      flow: sentinel/flows/catalog/home.yaml
      scrolls: 2
```

### Filename convention

```
{screen}-{os}-{device}-{variant}[-scroll{N}].png
```

Examples:
- `sign-in-ios18-iphone-light.png`
- `home-ios26-iphone-glossy-dark.png`
- `home-android-phone-dark-scroll2.png`

### Commands

```bash
npx --no-install sentinel catalog:capture                               # all screens
npx --no-install sentinel catalog:capture --screen sign-in             # one screen
npx --no-install sentinel catalog:capture --os android --device phone  # filter by OS + device
npx --no-install sentinel catalog:capture --os android --app-variant dev
npx --no-install sentinel catalog:upload --screen profile --os ios18 \
  --device iphone --variant light /tmp/shot.png
npx --no-install sentinel catalog:validate
npx --no-install sentinel catalog:index && open catalog/index.html

# Validate Atlas fixture coverage and artifact presence
npx --no-install sentinel catalog:validate \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json

# Generate the same viewer from Atlas fixtures
npx --no-install sentinel catalog:index \
  --atlas-manifest examples/atlas/manifest.fitkind-mobile.v1.json \
  --session-index examples/atlas/session-index.fitkind-mobile.v1.json
```

If a device declares multiple `app_ids`, `catalog:capture` requires `--app-variant <name>` unless a default `app_id` or `app_ids.default` is present.

---

## 📋 Screen registry

Every screen, modal, and navigable view must be registered in `sentinel.yaml` before a task is marked done.

```yaml
screens:
  - slug: profile-detail
    name: Profile Detail
    flow: sentinel/flows/catalog/profile-detail.yaml
```

Scan for unregistered screens:

```bash
npx --no-install sentinel registry:scan
npx --no-install sentinel registry:scan --file apple/MyApp/Screens/ProfileDetailView.swift
```

---

## ⚙️ sentinel.yaml

Preferred `sentinel.yaml` platform keys: `ios`, `android`, `web`, `web-admin`, `api`, `desktop`.

Compatibility aliases:
- `apple` is accepted as a legacy alias for `ios`
- `google` is accepted as a legacy alias for `android`

Sentinel still normalizes those config keys onto its current internal `apple` / `google` platform model, so shared Sentinel schemas and reports may continue to use the canonical internal names during migration.

```yaml
sentinel: "1.0"
project: my-app
version: "1.0.0"

platforms:
  ios:
    language: swift
    output:
      tokens:    apple/MyApp/DesignSystem/AppTokens.swift
      strings:   apple/MyApp/Resources/Strings.swift
      flags:     apple/MyApp/Core/FeatureFlags.swift
      models:    apple/MyApp/Core/Network/GeneratedModels.swift
      endpoints: apple/MyApp/Core/Network/GeneratedEndpoints.swift
      mock:      apple/MyApp/Core/Network/MockURLProtocol.swift

  android:
    language: kotlin
    output:
      tokens:    google/app/src/main/kotlin/…/AppTokens.kt
      strings:   google/app/src/main/res/values/strings.xml
      flags:     google/app/src/main/kotlin/…/FeatureFlags.kt
      models:    google/app/src/main/kotlin/…/GeneratedModels.kt
      mock:      google/app/src/debug/kotlin/…/MockDispatcher.kt
```

---

## 🔁 CI integration

```yaml
- name: Sentinel — validate
  run: npx --no-install sentinel schema:validate

- name: Sentinel — mock validate
  run: npx --no-install sentinel mock:validate

- name: Sentinel — catalog validate
  run: npx --no-install sentinel catalog:validate

- name: Sentinel — registry scan
  run: npx --no-install sentinel registry:scan
```

---

## 🧠 Brain analysis

`sentinel brain` runs all sentinel checks and feeds the results to Claude for AI-powered root-cause analysis and fix suggestions.

---

## 📦 Version

`0.1.0` — initial public release.

---

## 🤝 Contributing

Issues and PRs welcome at [github.com/vykeai/sentinel](https://github.com/vykeai/sentinel).

---

*Built by [Vyke](https://vyke.ai)*
