import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareSemver, verify } from './verify-release-readiness.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-release-readiness.mjs');
const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'pipe' });

const CHANGELOG = `# Changelog

# 0.1.0 (Nov 21st 2026)

  - **Fix:** a fix
  - **Admin:** a feature

# 0.1.0-alpha.6 (Nov 14th 2026)

  - **Restore:** older
`;

/** A healthy service repository at version 0.1.0; `over` replaces or (null) removes files. */
function repo(over = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'readiness-'));
  const files = {
    'package.json': `${JSON.stringify({ name: 'foxnox', version: '0.1.0' }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({ name: 'foxnox', version: '0.1.0', packages: { '': { name: 'foxnox', version: '0.1.0' } } }, null, 2)}\n`,
    'CHANGELOG.md': CHANGELOG,
    'docker/dockerfile.prod': 'FROM node:22\n',
    '.github/workflows/publish.yml': 'on: release\n',
    'swagger/src/foxnox.openapi.example.json': JSON.stringify({ openapi: '3.0.3', info: { title: 'x', version: '0.1.0' }, paths: {} }),
    'docker/conf/.env.dev.example': '# comment\nPORT=3000\nSECRET=\nexport MODE=dev # note\n',
    'docker/conf/.env.prod.example': 'PORT=3000\n',
    ...over,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}
const check = (dir, extra = {}) => verify({ dir, mode: 'release', expectedVersion: '0.1.0', previousVersion: '', ...extra });
const errorsOf = (dir, extra) => check(dir, extra).errors.join('\n');

test('a healthy repository passes in both modes', () => {
  const dir = repo();
  assert.deepEqual(check(dir).errors, []);
  assert.deepEqual(check(dir).warnings, []);
  assert.deepEqual(check(dir, { mode: 'pr', expectedVersion: '' }).errors, []);
});

test('package.json: expected version and previous version', () => {
  assert.match(errorsOf(repo(), { expectedVersion: '0.2.0' }), /Expected version "0\.2\.0", found "0\.1\.0"/);
  assert.match(errorsOf(repo(), { previousVersion: '0.1.0' }), /not incremented/);
  assert.equal(check(repo(), { previousVersion: '0.1.0-alpha.6' }).errors.length, 0, 'stable is above its alpha');
  assert.match(errorsOf(repo({ 'package.json': '{"name":"x"}' }), { expectedVersion: '' }), /Invalid SemVer/);
  assert.match(errorsOf(repo({ 'package.json': null })), /Missing root package\.json/);
});

test('package-lock root version must be in sync', () => {
  const lock = (top, root) => JSON.stringify({ version: top, packages: { '': { version: root } } });
  assert.match(errorsOf(repo({ 'package-lock.json': lock('0.0.9', '0.1.0') })), /Top-level version "0\.0\.9"/);
  assert.match(errorsOf(repo({ 'package-lock.json': lock('0.1.0', '0.0.9') })), /packages\[""\]\.version "0\.0\.9"/);
});

test('CHANGELOG: top entry is the released, dated version (release mode)', () => {
  assert.match(errorsOf(repo({ 'CHANGELOG.md': CHANGELOG.replace('# 0.1.0 (', '# 0.1.1 (') })), /Top entry is for "0\.1\.1", expected "0\.1\.0"/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': CHANGELOG.replace('(Nov 21st 2026)', '(unreleased)') })), /still unreleased/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': CHANGELOG.replace('Nov 21st 2026', '21/11/2026') })), /must look like/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': '# Changelog\n' })), /No version heading/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': null })), /Missing CHANGELOG\.md/);
  assert.deepEqual(check(repo({ 'CHANGELOG.md': CHANGELOG.replace('Nov 21st', 'November 21st') })).errors, [], 'long month style');
  assert.deepEqual(check(repo({ 'CHANGELOG.md': CHANGELOG.replace(/^# /gm, '## ').replace('## Changelog', '# Changelog') })).errors, [], '## headings');
});

test('CHANGELOG: pr mode allows an unreleased top entry, but never an older leftover', () => {
  const unreleased = `# 0.2.0 (unreleased)\n\n  - new work\n\n${CHANGELOG.replace('# Changelog\n\n', '')}`;
  assert.deepEqual(check(repo({ 'CHANGELOG.md': unreleased }), { mode: 'pr', expectedVersion: '' }).errors, []);
  const leftover = CHANGELOG.replace('(Nov 14th 2026)', '(unreleased)');
  assert.match(errorsOf(repo({ 'CHANGELOG.md': leftover })), /Leftover "\(unreleased\)" heading for older version 0\.1\.0-alpha\.6/);
});

test('CHANGELOG: bullets, placeholders and duplicates', () => {
  assert.match(errorsOf(repo({ 'CHANGELOG.md': '# 0.1.0 (Nov 21st 2026)\n\n# 0.0.9 (Nov 1st 2026)\n\n  - old\n' })), /no bullet/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': CHANGELOG.replace('a fix', 'TODO fill in') })), /placeholder/);
  assert.match(errorsOf(repo({ 'CHANGELOG.md': `${CHANGELOG}\n# 0.1.0 (Nov 1st 2026)\n\n  - dup\n` })), /Duplicate entry for version 0\.1\.0/);
});

test('CHANGELOG: pr mode rejects editing a released entry (tag vX.Y.Z)', () => {
  const dir = repo();
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'release');
  git(dir, 'tag', 'v0.1.0');
  assert.deepEqual(check(dir, { mode: 'pr', expectedVersion: '' }).errors, []);
  writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG.replace('a fix', 'a rewritten fix'));
  assert.match(errorsOf(dir, { mode: 'pr', expectedVersion: '' }), /released entry for 0\.1\.0 .* was modified/);
  assert.doesNotMatch(errorsOf(dir, { mode: 'release' }), /was modified/, 'only checked in pr mode');
});

test('Docker: production dockerfile and publish workflow are required', () => {
  assert.match(errorsOf(repo({ 'docker/dockerfile.prod': null })), /No production dockerfile/);
  assert.deepEqual(check(repo({ 'docker/dockerfile.prod': null, Dockerfile: 'FROM node\n' })).errors, []);
  assert.deepEqual(check(repo({ 'docker/dockerfile.prod': null, 'docker/Dockerfile.prod': 'FROM node\n' })).errors, []);
  assert.match(errorsOf(repo({ '.github/workflows/publish.yml': null })), /Missing \.github\/workflows\/publish\.yml/);
});

test('OpenAPI spec: invalid JSON is an error, a version mismatch is only a warning', () => {
  assert.match(errorsOf(repo({ 'swagger/src/foxnox.openapi.example.json': '{ nope' })), /swagger\/src\/foxnox\.openapi\.example\.json\] Invalid JSON/);
  const stale = check(repo({ 'swagger/src/foxnox.openapi.example.json': JSON.stringify({ info: { version: '0.0.9' } }) }));
  assert.deepEqual(stale.errors, []);
  assert.match(stale.warnings.join('\n'), /info\.version "0\.0\.9" differs from the release version "0\.1\.0"/);
  const custom = check(repo({ 'swagger/src/foxnox.openapi.example.json': JSON.stringify({ info: { version: 'v1-draft' } }) }));
  assert.deepEqual(custom.warnings, [], 'non-semver spec versions are ignored');
  assert.deepEqual(check(repo({ 'swagger/src/foxnox.openapi.example.json': null })).errors, [], 'spec is optional');
});

test('env templates must parse; duplicates only warn', () => {
  assert.match(errorsOf(repo({ 'docker/conf/.env.dev.example': 'PORT=3000\nthis is: not valid\n' })), /\.env\.dev\.example\] Line 2 is not a valid/);
  const dup = check(repo({ '.env.example': 'A=1\nA=2\n' }));
  assert.deepEqual(dup.errors, []);
  assert.match(dup.warnings.join('\n'), /Variable A is defined more than once/);
});

test('CLI: exit codes, readable list, --require-dist is a no-op', () => {
  const ok = spawnSync('node', [script, '--dir', repo(), '--mode', 'release', '--expected-version', '0.1.0', '--require-dist'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Release readiness verified for foxnox@0\.1\.0 \(mode=release\)/);
  const bad = spawnSync('node', [script, '--dir', repo({ 'docker/dockerfile.prod': null, 'CHANGELOG.md': null }), '--mode', 'release', '--expected-version', 'v0.1.0'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /FAILED/);
  assert.match(bad.stderr, /\n {2}- \[CHANGELOG\.md\]/);
  assert.match(bad.stderr, /\n {2}- \[docker\]/);
  const warn = spawnSync('node', [script, '--dir', repo({ 'swagger/src/a.openapi.json': '{"info":{"version":"9.9.9"}}' }), '--expected-version', '0.1.0'], { encoding: 'utf8' });
  assert.equal(warn.status, 0);
  assert.match(warn.stderr, /warning: .*9\.9\.9/);
});

test('semver comparison', () => {
  assert.ok(compareSemver('0.1.0', '0.1.0-alpha.6') > 0);
  assert.ok(compareSemver('0.1.0-alpha.10', '0.1.0-alpha.9') > 0);
  assert.ok(compareSemver('1.0.0', '0.9.9') > 0);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
});
