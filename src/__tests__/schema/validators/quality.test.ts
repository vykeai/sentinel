import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import type { QualityConfig } from '../../../config/types.js'
import { checkQuality } from '../../../schema/validators/quality.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-quality-'))
}

describe('checkQuality', () => {
  let dir: string

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  // ─── Tests ──────────────────────────────────────────────────────────────────

  it('tests-pass: succeeds when test command exits 0', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { tests: 'echo "all good"' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.checkedCount).toBe(1)
    expect(result.issues).toHaveLength(0)
  })

  it('tests-fail: reports error when test command exits non-zero', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { tests: 'exit 1' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].rule).toBe('tests-fail')
  })

  // ─── Typecheck ──────────────────────────────────────────────────────────────

  it('typecheck-pass: succeeds when typecheck command exits 0', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { typecheck: 'echo "types ok"' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('typecheck-fail: reports error when typecheck command exits non-zero', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { typecheck: 'exit 1' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].rule).toBe('typecheck-fail')
  })

  // ─── Banned patterns ───────────────────────────────────────────────────────

  it('banned-pattern-found: reports when file contains banned pattern', async () => {
    dir = makeTempDir()
    const srcDir = path.join(dir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'bad.ts'), '// @ts-ignore\nconst x = 1\n')

    const config: QualityConfig = {
      'banned-patterns': [
        { pattern: '@ts-ignore', severity: 'error', message: 'No @ts-ignore' },
      ],
      include: ['src/**/*.ts'],
    }

    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.severity === 'error' && i.rule === 'banned-pattern')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('1 occurrence')
  })

  it('banned-pattern-clean: passes when no banned patterns found', async () => {
    dir = makeTempDir()
    const srcDir = path.join(dir, 'src')
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'clean.ts'), 'const x = 1\n')

    const config: QualityConfig = {
      'banned-patterns': [
        { pattern: '@ts-ignore', severity: 'error' },
      ],
      include: ['src/**/*.ts'],
    }

    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.issues.filter(i => i.rule === 'banned-pattern')).toHaveLength(0)
  })

  // ─── Commit format ─────────────────────────────────────────────────────────

  it('commit-format-match: passes when last commit matches format', async () => {
    dir = makeTempDir()
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    fs.writeFileSync(path.join(dir, 'f.txt'), 'hi')
    execSync('git add . && git commit -m "feat: initial"', { cwd: dir, stdio: 'pipe' })

    const config: QualityConfig = {
      'commit-format': '^(feat|fix|chore|docs|refactor|test):',
    }

    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.issues.filter(i => i.rule === 'commit-format' && i.severity === 'error')).toHaveLength(0)
  })

  it('commit-format-mismatch: reports error when last commit does not match format', async () => {
    dir = makeTempDir()
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    fs.writeFileSync(path.join(dir, 'f.txt'), 'hi')
    execSync('git add . && git commit -m "bad message"', { cwd: dir, stdio: 'pipe' })

    const config: QualityConfig = {
      'commit-format': '^(feat|fix|chore|docs|refactor|test):',
    }

    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.rule === 'commit-format' && i.severity === 'error')
    expect(errors).toHaveLength(1)
  })

  // ─── Require pushed ─────────────────────────────────────────────────────────

  it('require-pushed-ahead: reports error when branch has unpushed commits', async () => {
    dir = makeTempDir()
    // Create a "remote" bare repo and clone it
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-bare-'))
    execSync('git init --bare', { cwd: bareDir, stdio: 'pipe' })
    execSync(`git clone ${bareDir} ${dir}`, { stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    fs.writeFileSync(path.join(dir, 'f.txt'), 'hi')
    execSync('git add . && git commit -m "feat: first"', { cwd: dir, stdio: 'pipe' })
    execSync('git push -u origin HEAD', { cwd: dir, stdio: 'pipe' })
    // Make an unpushed commit
    fs.writeFileSync(path.join(dir, 'f2.txt'), 'hi2')
    execSync('git add . && git commit -m "feat: unpushed"', { cwd: dir, stdio: 'pipe' })

    const config: QualityConfig = { 'require-pushed': true }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.rule === 'not-pushed')
    expect(errors).toHaveLength(1)

    // Cleanup bare repo
    fs.rmSync(bareDir, { recursive: true, force: true })
  })

  // ─── Lint ────────────────────────────────────────────────────────────────────

  it('lint-pass: succeeds when lint command exits 0', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { lint: 'echo "lint ok"' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('lint-fail: reports error when lint command exits non-zero', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { lint: 'exit 1' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].rule).toBe('lint-fail')
  })

  // ─── Build ──────────────────────────────────────────────────────────────────

  it('build-pass: succeeds when build command exits 0', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { build: 'echo "build ok"' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('build-fail: reports error when build command exits non-zero', async () => {
    dir = makeTempDir()
    const config: QualityConfig = { build: 'exit 1' }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.severity === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].rule).toBe('build-fail')
  })

  // ─── Gitignore check ───────────────────────────────────────────────────────

  it('gitignore-tracked: reports error when dist/ is tracked', async () => {
    dir = makeTempDir()
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    const distDir = path.join(dir, 'dist')
    fs.mkdirSync(distDir, { recursive: true })
    fs.writeFileSync(path.join(distDir, 'bundle.js'), 'var x=1')
    execSync('git add . && git commit -m "feat: init"', { cwd: dir, stdio: 'pipe' })

    const config: QualityConfig = { 'gitignore-check': true }
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(false)
    const errors = result.issues.filter(i => i.rule === 'gitignore-tracked')
    expect(errors).toHaveLength(1)
  })

  it('gitignore-missing: warns when .gitignore lacks required patterns', async () => {
    dir = makeTempDir()
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
    // Create .gitignore without required patterns
    fs.writeFileSync(path.join(dir, '.gitignore'), '*.log\n')
    fs.writeFileSync(path.join(dir, 'f.txt'), 'hi')
    execSync('git add . && git commit -m "feat: init"', { cwd: dir, stdio: 'pipe' })

    const config: QualityConfig = { 'gitignore-check': true }
    const result = await checkQuality(dir, config)
    // Should still pass (warnings don't fail)
    expect(result.passed).toBe(true)
    const warnings = result.issues.filter(i => i.rule === 'gitignore-missing')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('node_modules')
  })

  // ─── Empty config ───────────────────────────────────────────────────────────

  it('empty config returns passed: true with checkedCount: 0', async () => {
    dir = makeTempDir()
    const config: QualityConfig = {}
    const result = await checkQuality(dir, config)
    expect(result.passed).toBe(true)
    expect(result.checkedCount).toBe(0)
    expect(result.issues).toHaveLength(0)
  })
})
