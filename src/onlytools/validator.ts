import { spawnSync } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

export type OnlytoolsValidationSection = 'manifest' | 'graph' | 'ports' | 'broadcasts'
export type OnlytoolsValidationStatus = 'pass' | 'fail'

export interface OnlytoolsValidationCheck {
  section: OnlytoolsValidationSection
  status: OnlytoolsValidationStatus
  command: string[]
  summary: string
  errors: string[]
  details?: unknown
}

export interface OnlytoolsValidationResult {
  ok: boolean
  repoRoot: string | null
  checks: OnlytoolsValidationCheck[]
  summary: Record<OnlytoolsValidationSection, OnlytoolsValidationStatus>
}

export interface OnlytoolsValidationOptions {
  repoRoot?: string
  allowedRepoRoot?: string
  restrictToDiscoveredRoot?: boolean
  mdnsTimeoutMs?: number
  runner?: CommandRunner
}

export interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

export type CommandRunner = (command: string[], cwd: string) => CommandResult

const UNSAFE_BROADCAST_PATTERN = /token|secret|configRoot|dataRoot|cacheRoot|\/Users\//i
const REDACTED = '[redacted]'

function defaultRunner(command: string[], cwd: string): CommandResult {
  const [bin, ...args] = command
  const result = spawnSync(bin, args, {
    cwd,
    env: minimalEnv(),
    encoding: 'utf8',
    timeout: 10_000,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function commandText(command: string[]): string {
  return command.join(' ')
}

function minimalEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return env
}

function displayCommand(command: string[], repoRoot: string): string[] {
  return command.map(part => part.startsWith(repoRoot) ? relative(repoRoot, part) || '.' : part)
}

function sanitizeText(value: string, repoRoot?: string): string {
  let output = value
  if (repoRoot) output = output.split(repoRoot).join('<repo>')
  output = output.replace(/\/Users\/[^\s"']+/g, '<path>')
  output = output.replace(/(token|secret|configRoot|dataRoot|cacheRoot)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, `$1=${REDACTED}`)
  return output.slice(0, 2_000)
}

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function jsonCheck(
  section: OnlytoolsValidationSection,
  command: string[],
  cwd: string,
  display: string[],
  runner: CommandRunner,
  summarize: (body: Record<string, unknown>) => { ok: boolean; summary: string; errors: string[] },
): OnlytoolsValidationCheck {
  const result = runner(command, cwd)
  if (result.status !== 0) {
    return {
      section,
      status: 'fail',
      command: display,
      summary: `${section} command failed`,
      errors: [sanitizeText(result.stderr.trim() || result.stdout.trim() || `${commandText(display)} exited ${result.status ?? 'without status'}`, cwd)],
    }
  }

  try {
    const body = record(parseJson(result.stdout))
    const summarized = summarize(body)
    return {
      section,
      status: summarized.ok ? 'pass' : 'fail',
      command: display,
      summary: summarized.summary,
      errors: (summarized.ok || summarized.errors.length > 0
        ? summarized.errors
        : [`${section} validation failed without detailed errors`]).map(error => sanitizeText(error, cwd)),
      details: summarized.ok ? summarizeDetails(section, body) : undefined,
    }
  } catch (error) {
    return {
      section,
      status: 'fail',
      command: display,
      summary: `${section} command returned invalid JSON`,
      errors: ['invalid-json'],
    }
  }
}

function graphCheck(command: string[], cwd: string, display: string[], runner: CommandRunner): OnlytoolsValidationCheck {
  const result = runner(command, cwd)
  const output = `${result.stdout}\n${result.stderr}`
  const expected = [
    'Real manifest graph has no install cycles',
    'Fixture install graph resolves transitive dependencies',
    'Cycle fixture reports exact dependency path',
  ]
  const missing = expected.filter(line => !output.includes(line))
  const ok = result.status === 0 && missing.length === 0
  return {
    section: 'graph',
    status: ok ? 'pass' : 'fail',
    command: display,
    summary: ok ? 'dependency graph valid' : 'dependency graph validation failed',
    errors: [
      ...missing.map(line => `missing proof line: ${line}`),
      ...(result.status === 0 ? [] : [sanitizeText(result.stderr.trim() || result.stdout.trim() || `${commandText(display)} exited ${result.status ?? 'without status'}`, cwd)]),
    ],
  }
}

function manifestSummary(body: Record<string, unknown>) {
  const errors = Array.isArray(body.errors) ? body.errors : []
  return {
    ok: body.ok === true && errors.length === 0,
    summary: `${Number(body.entries ?? 0)} manifest(s) valid`,
    errors: errors.map(error => JSON.stringify(error)),
  }
}

function portsSummary(body: Record<string, unknown>) {
  const errors = Array.isArray(body.errors) ? body.errors : []
  return {
    ok: body.ok === true && errors.length === 0,
    summary: `${Number(body.reservations ?? 0)} port reservation(s) valid`,
    errors: errors.map(error => JSON.stringify(error)),
  }
}

function broadcastsSummary(body: Record<string, unknown>) {
  const errors = Array.isArray(body.errors) ? body.errors.map(error => JSON.stringify(error)) : []
  const broadcasts = Array.isArray(body.broadcasts) ? body.broadcasts.map(record) : []
  const stale = broadcasts.filter(item => typeof item.status === 'string' && item.status !== 'active')
  const unsafe = broadcasts.filter(item => UNSAFE_BROADCAST_PATTERN.test(JSON.stringify(item)))
  return {
    ok: body.ok === true && errors.length === 0 && stale.length === 0 && unsafe.length === 0,
    summary: `${broadcasts.length} mDNS broadcast(s) valid`,
    errors: [
      ...errors,
      ...stale.map(item => `stale-mdns-record: ${String(item.slug ?? 'unknown')}:${String(item.environment ?? 'unknown')}:${String(item.mdnsName ?? 'unknown')}`),
      ...unsafe.map(item => `unsafe-mdns-payload: ${String(item.slug ?? 'unknown')}:${String(item.environment ?? 'unknown')}`),
    ],
  }
}

function summarizeDetails(section: OnlytoolsValidationSection, body: Record<string, unknown>): unknown {
  if (section === 'manifest') return { entries: Number(body.entries ?? 0) }
  if (section === 'ports') return { reservations: Number(body.reservations ?? 0) }
  if (section === 'broadcasts') return { broadcasts: Array.isArray(body.broadcasts) ? body.broadcasts.length : 0 }
  return undefined
}

function emptySummary(): Record<OnlytoolsValidationSection, OnlytoolsValidationStatus> {
  return {
    manifest: 'fail',
    graph: 'fail',
    ports: 'fail',
    broadcasts: 'fail',
  }
}

function resolveRepoRoot(
  input: string | undefined,
  allowedRoot: string | undefined,
  restrictToDiscoveredRoot: boolean,
): { repoRoot?: string; error?: string } {
  const discoveredRoot = restrictToDiscoveredRoot ? discoverOnlytoolsRoot() : undefined
  const rawRoot = resolve(input ?? discoveredRoot ?? process.cwd())
  let repoRoot: string
  try {
    repoRoot = realpathSync(rawRoot)
  } catch {
    return { error: `repo-root-not-found: ${sanitizeText(rawRoot)}` }
  }
  const expected = allowedRoot ? realpathSync(resolve(allowedRoot)) : restrictToDiscoveredRoot ? discoveredRoot : undefined
  if (expected && repoRoot !== expected) {
    return { error: `repo-root-not-allowed: expected ${sanitizeText(expected)} but received ${sanitizeText(repoRoot)}` }
  }
  return { repoRoot }
}

export function discoverOnlytoolsRoot(startDir = process.cwd()): string | undefined {
  let current = realpathSync(startDir)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(current, 'bin', 'onlytools')) && existsSync(join(current, 'fed'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
  return undefined
}

export function validateOnlytoolsEstate(options: OnlytoolsValidationOptions = {}): OnlytoolsValidationResult {
  const resolved = resolveRepoRoot(options.repoRoot, options.allowedRepoRoot, options.restrictToDiscoveredRoot === true)
  if (!resolved.repoRoot) {
    const checks = (['manifest', 'graph', 'ports', 'broadcasts'] as const).map(section => ({
      section,
      status: 'fail' as const,
      command: ['sentinel', 'validate', 'onlytools'],
      summary: 'Onlytools repo root rejected',
      errors: [resolved.error ?? 'repo-root-invalid'],
    }))
    return {
      ok: false,
      repoRoot: null,
      checks,
      summary: emptySummary(),
    }
  }
  const repoRoot = resolved.repoRoot
  const mdnsTimeout = Number.isFinite(options.mdnsTimeoutMs) ? String(options.mdnsTimeoutMs) : '100'
  const runner = options.runner ?? defaultRunner
  const onlytoolsBin = join(repoRoot, 'bin', 'onlytools')
  const fedCli = join(repoRoot, 'fed', 'dist', 'cli.js')
  const checks: OnlytoolsValidationCheck[] = []

  if (!existsSync(onlytoolsBin)) {
    checks.push({
      section: 'graph',
      status: 'fail',
      command: ['bin/onlytools', 'graph', 'validate', '--fixtures'],
      summary: 'onlytools CLI missing',
      errors: ['missing bin/onlytools'],
    })
  }
  if (!existsSync(fedCli)) {
    for (const section of ['manifest', 'ports', 'broadcasts'] as const) {
      checks.push({
        section,
        status: 'fail',
        command: ['node', 'fed/dist/cli.js'],
        summary: 'fed CLI build missing',
        errors: ['missing fed/dist/cli.js; run cd fed && npm run build'],
      })
    }
  }

  if (checks.length === 0) {
    const manifestCommand = ['node', fedCli, 'catalog', 'validate', '--json']
    const graphCommand = [onlytoolsBin, 'graph', 'validate', '--fixtures']
    const portsCommand = ['node', fedCli, 'ports', 'validate', '--json']
    const broadcastsCommand = ['node', fedCli, 'mdns', 'list', '--json', '--timeout', mdnsTimeout]
    checks.push(jsonCheck('manifest', manifestCommand, repoRoot, displayCommand(manifestCommand, repoRoot), runner, manifestSummary))
    checks.push(graphCheck(graphCommand, repoRoot, displayCommand(graphCommand, repoRoot), runner))
    checks.push(jsonCheck('ports', portsCommand, repoRoot, displayCommand(portsCommand, repoRoot), runner, portsSummary))
    checks.push(jsonCheck('broadcasts', broadcastsCommand, repoRoot, displayCommand(broadcastsCommand, repoRoot), runner, broadcastsSummary))
  }

  const summary = { ...emptySummary(), ...Object.fromEntries(checks.map(check => [check.section, check.status])) } as Record<OnlytoolsValidationSection, OnlytoolsValidationStatus>
  return {
    ok: checks.every(check => check.status === 'pass'),
    repoRoot: '<repo>',
    checks,
    summary,
  }
}
