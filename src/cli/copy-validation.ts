import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export type CopyValidationSeverity = 'pass' | 'warn' | 'fail'

export interface CopyValidationFinding {
  file: string
  line: number | null
  ruleId: string
  severity: CopyValidationSeverity
  message: string
  text: string
}

export interface CopyValidationResult {
  schemaVersion: 'sentinel.copy-validation.v1'
  producer: 'sentinel'
  requestor: string | null
  source: 'diff' | 'manifest'
  verdict: 'passed' | 'failed'
  checkedCount: number
  findings: CopyValidationFinding[]
}

export interface CopyValidationOptions {
  cwd?: string
  requestor?: string
  base?: string
  head?: string
  diff?: string
  manifest?: string
}

interface CopyCandidate {
  file: string
  line: number | null
  text: string
}

const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.swift',
  '.kt',
  '.kts',
  '.java',
  '.xml',
  '.json',
  '.json5',
  '.yaml',
  '.yml',
  '.html',
  '.md',
])

export function validateCopy(options: CopyValidationOptions = {}): CopyValidationResult {
  const cwd = options.cwd ?? process.cwd()
  const requestor = options.requestor?.trim() || null
  const source = options.manifest ? 'manifest' : 'diff'
  const candidates = options.manifest
    ? candidatesFromManifest(resolve(cwd, options.manifest))
    : candidatesFromDiff(options.diff ?? readGitDiff(cwd, options.base, options.head))
  const findings = candidates.flatMap(validateCandidate)
  const hasFailure = findings.some((finding) => finding.severity === 'fail')

  return {
    schemaVersion: 'sentinel.copy-validation.v1',
    producer: 'sentinel',
    requestor,
    source,
    verdict: hasFailure ? 'failed' : 'passed',
    checkedCount: candidates.length,
    findings,
  }
}

export function candidatesFromDiff(diff: string): CopyCandidate[] {
  const candidates: CopyCandidate[] = []
  let file = ''
  let nextNewLine: number | null = null

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length)
      continue
    }
    if (line.startsWith('@@ ')) {
      const match = line.match(/\+(\d+)(?:,\d+)?/)
      nextNewLine = match ? Number.parseInt(match[1], 10) : null
      continue
    }
    if (!file || line.startsWith('+++') || line.startsWith('---')) continue

    if (line.startsWith('+')) {
      const raw = line.slice(1)
      for (const text of extractUserFacingStrings(file, raw)) {
        candidates.push({ file, line: nextNewLine, text })
      }
    }

    if ((line.startsWith('+') || line.startsWith(' ')) && nextNewLine !== null) {
      nextNewLine += 1
    }
  }

  return candidates
}

function candidatesFromManifest(manifestPath: string): CopyCandidate[] {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
  if (Array.isArray(raw)) return raw.flatMap(candidateFromManifestEntry)
  if (isRecord(raw) && Array.isArray(raw.strings)) {
    return raw.strings.flatMap(candidateFromManifestEntry)
  }
  if (isRecord(raw) && Array.isArray(raw.files)) {
    return raw.files.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.path !== 'string') return []
      const filePath = resolve(manifestPath, '..', entry.path)
      if (!existsSync(filePath)) return []
      return readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          extractUserFacingStrings(entry.path as string, line).map((text) => ({
            file: entry.path as string,
            line: index + 1,
            text,
          })),
        )
    })
  }
  throw new Error('copy manifest must be an array or contain strings/files arrays')
}

function candidateFromManifestEntry(entry: unknown): CopyCandidate[] {
  if (typeof entry === 'string') return [{ file: 'manifest', line: null, text: entry }]
  if (!isRecord(entry) || typeof entry.text !== 'string') return []
  return [{
    file: typeof entry.file === 'string' ? entry.file : 'manifest',
    line: typeof entry.line === 'number' ? entry.line : null,
    text: entry.text,
  }]
}

function extractUserFacingStrings(file: string, line: string): string[] {
  if (!isTextFile(file)) return []
  if (shouldSkipLine(line)) return []

  if (file.endsWith('.xml')) {
    const xmlValue = line.match(/>([^<]{2,})</)?.[1]
    return xmlValue ? [xmlValue] : []
  }

  const strings: string[] = []
  const regex = /(["'`])((?:\\.|(?!\1).){2,})\1/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    const value = match[2].replace(/\\n/g, ' ').trim()
    if (looksUserFacing(value)) strings.push(value)
  }
  return strings
}

function validateCandidate(candidate: CopyCandidate): CopyValidationFinding[] {
  const findings: CopyValidationFinding[] = []
  const text = candidate.text

  if (text.trim() !== text) {
    findings.push(finding(candidate, 'copy.no-surrounding-whitespace', 'fail', 'Copy has leading or trailing whitespace'))
  }
  if (/\s{2,}/.test(text.trim())) {
    findings.push(finding(candidate, 'copy.no-repeated-whitespace', 'fail', 'Copy contains repeated whitespace'))
  }
  if (/\b(todo|fixme|lorem ipsum)\b/i.test(text)) {
    findings.push(finding(candidate, 'copy.no-placeholder-text', 'fail', 'Copy contains placeholder text'))
  }
  if (/[.!?][.!?]+/.test(text)) {
    findings.push(finding(candidate, 'copy.no-repeated-punctuation', 'warn', 'Copy contains repeated punctuation'))
  }
  if (text.length > 140) {
    findings.push(finding(candidate, 'copy.max-length-140', 'warn', 'Copy is longer than 140 characters'))
  }
  if (/click here/i.test(text)) {
    findings.push(finding(candidate, 'copy.no-click-here', 'warn', 'Copy uses non-specific link text'))
  }
  if (findings.length === 0) {
    findings.push(finding(candidate, 'copy.ok', 'pass', 'Copy passed deterministic checks'))
  }

  return findings
}

function finding(
  candidate: CopyCandidate,
  ruleId: string,
  severity: CopyValidationSeverity,
  message: string,
): CopyValidationFinding {
  return {
    file: candidate.file,
    line: candidate.line,
    ruleId,
    severity,
    message,
    text: candidate.text,
  }
}

function readGitDiff(cwd: string, base?: string, head?: string): string {
  const args = ['diff', '--unified=0']
  if (base && head) args.push(`${base}...${head}`)
  else if (base) args.push(base)
  const result = execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.toString()
}

function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed === '' ||
    trimmed.startsWith('import ') ||
    trimmed.startsWith('export ') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.includes('http://') ||
    trimmed.includes('https://')
  )
}

function looksUserFacing(value: string): boolean {
  if (value.length < 2) return false
  if (/^[a-z0-9_.:/-]+$/i.test(value) && !value.includes(' ')) return false
  if (/^[A-Z0-9_]+$/.test(value)) return false
  return /[A-Za-z]/.test(value)
}

function isTextFile(file: string): boolean {
  const dot = file.lastIndexOf('.')
  return dot === -1 || TEXT_FILE_EXTENSIONS.has(file.slice(dot))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
