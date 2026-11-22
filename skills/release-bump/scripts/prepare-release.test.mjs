import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectBullets, formatDate, prepareRelease, updateChangelog } from './prepare-release.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prepare-release.mjs');

// Fixtures copied (shortened) from the real CHANGELOG.md files of the apps.
const FOXNOX = `# Changelog

# 0.1.0 (Nov 21st 2026)

  - **Branding:** the configured brand name is now applied to browser tab titles on the workflow pages
  - **Fix:** the password reset and expired-password pages no longer trigger the browser password manager prompt

# 0.1.0-alpha.6 (Nov 14th 2026)

  - **Restore:** password policies and security questions can now be restored after being archived (\`POST /restore\`)
  - **Admin:** new \`ADMIN_API_USERS\` setting for the base path of the user service API the admin calls
`;
const GATELIN = `# 0.1.0 (Nov 21st 2026)

  - Fixed client disconnects during HTTP forwarding crashing Gatelin when an upstream response arrives late

# 0.1.0-alpha.12 (Nov 14th 2026)

  - Added the \`ADMIN_API_USERS\` setting to configure the base path of the user service API
`;
const MEGADEX = `# Changelog

## 0.1.0-alpha.1 (Nov 10th 2026)

  - initial release`;

const json = (obj, indent = 2, nl = true) => JSON.stringify(obj, null, indent) + (nl ? '\n' : '');
const lock = (v) => ({ name: 'app', version: v, lockfileVersion: 3, requires: true, packages: { '': { name: 'app', version: v, license: 'MIT' }, 'node_modules/x': { version: '1.0.0' } } });

function project({ version = '0.1.0-alpha.1', changelog = FOXNOX, sub = ['admin'], subVersion = version, indent = 2, nl = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'prepare-release-'));
  writeFileSync(path.join(root, 'package.json'), json({ name: 'app', version, scripts: {} }, indent, nl));
  writeFileSync(path.join(root, 'package-lock.json'), json(lock(version), indent, nl));
  for (const dir of sub) {
    mkdirSync(path.join(root, dir));
    writeFileSync(path.join(root, dir, 'package.json'), json({ name: dir, version: subVersion }));
    writeFileSync(path.join(root, dir, 'package-lock.json'), json(lock(subVersion)));
  }
  if (changelog !== null) writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  return root;
}
const read = (root, f) => readFileSync(path.join(root, f), 'utf8');
const prep = (root, extra = {}) => prepareRelease({ root, version: '0.1.0', date: '2026-11-22', titles: [], subjects: '', ...extra });

test('date formatting', () => {
  assert.equal(formatDate('2026-11-21'), 'Nov 21st 2026');
  assert.equal(formatDate('2026-11-22T10:00:00Z'), 'Nov 22nd 2026');
  assert.equal(formatDate('2026-03-03'), 'Mar 3rd 2026');
  assert.equal(formatDate('2026-03-11'), 'Mar 11th 2026');
  assert.equal(formatDate('2026-03-12', { longMonth: true }), 'March 12th 2026');
  assert.equal(formatDate('November 30th 2026'), 'November 30th 2026');
});

test('versions are set in package.json and lock, admin only when it shared the old version', () => {
  const root = project({ sub: ['admin', 'web'], changelog: MEGADEX });
  writeFileSync(path.join(root, 'web/package.json'), json({ name: 'web', version: '9.9.9' }));
  const { changed } = prep(root, { titles: ['feat: x'] });
  assert.deepEqual(changed, ['package.json', 'package-lock.json', 'admin/package.json', 'admin/package-lock.json', 'CHANGELOG.md']);
  assert.equal(JSON.parse(read(root, 'package.json')).version, '0.1.0');
  const rootLock = JSON.parse(read(root, 'package-lock.json'));
  assert.equal(rootLock.version, '0.1.0');
  assert.equal(rootLock.packages[''].version, '0.1.0');
  assert.equal(rootLock.packages['node_modules/x'].version, '1.0.0', 'dependencies untouched');
  assert.equal(JSON.parse(read(root, 'admin/package.json')).version, '0.1.0');
  assert.equal(JSON.parse(read(root, 'admin/package-lock.json')).packages[''].version, '0.1.0');
  assert.equal(JSON.parse(read(root, 'web/package.json')).version, '9.9.9');
});

test('indentation and trailing newline of manifests are preserved', () => {
  const four = project({ indent: 4, nl: false, sub: [] });
  prep(four);
  assert.equal(read(four, 'package.json'), json({ name: 'app', version: '0.1.0', scripts: {} }, 4, false));
  assert.equal(read(four, 'package-lock.json'), json(lock('0.1.0'), 4, false));
  const tabs = project({ indent: '\t', sub: [] });
  prep(tabs);
  assert.equal(read(tabs, 'package.json'), json({ name: 'app', version: '0.1.0', scripts: {} }, '\t'));
});

test('only the version lines change in a lock file', () => {
  const root = project({ sub: [] });
  const before = read(root, 'package-lock.json');
  prep(root);
  const diff = read(root, 'package-lock.json').split('\n').filter((l, i) => l !== before.split('\n')[i]);
  assert.equal(diff.length, 2);
});

test('Foxnox format: heading level, bullet prefix and title line are kept; new section goes above the last release', () => {
  const root = project({ changelog: FOXNOX.replace('# 0.1.0 (Nov 21st 2026)', '# 0.1.0-alpha.7 (Nov 21st 2026)') });
  prep(root, { titles: ['feat: first', 'fix(api): second (#12)'] });
  const out = read(root, 'CHANGELOG.md');
  assert.ok(out.startsWith('# Changelog\n\n# 0.1.0 (Nov 22nd 2026)\n\n  - first\n  - second\n\n# 0.1.0-alpha.7 (Nov 21st 2026)\n'), out.slice(0, 200));
  assert.ok(out.endsWith(FOXNOX.replace('# 0.1.0 (Nov 21st 2026)', '# 0.1.0-alpha.7 (Nov 21st 2026)').split('# 0.1.0-alpha.7')[1]));
});

test('Gatelin format (no title line) and Megadex format (## headings, no trailing newline)', () => {
  const g = project({ changelog: GATELIN, version: '0.1.1' });
  prep(g, { version: '0.1.2', titles: ['fix: a bug'] });
  assert.ok(read(g, 'CHANGELOG.md').startsWith('# 0.1.2 (Nov 22nd 2026)\n\n  - a bug\n\n# 0.1.0 (Nov 21st 2026)\n'));
  const m = project({ changelog: MEGADEX });
  prep(m, { version: '0.1.0-alpha.2', titles: ['a thing'] });
  assert.equal(read(m, 'CHANGELOG.md'), `# Changelog\n\n## 0.1.0-alpha.2 (Nov 22nd 2026)\n\n  - a thing\n\n${MEGADEX.slice('# Changelog\n\n'.length)}`);
});

test('an empty or missing changelog gets a first section', () => {
  const missing = project({ changelog: null });
  prep(missing, { titles: ['feat: first release'] });
  assert.equal(read(missing, 'CHANGELOG.md'), '# 0.1.0 (Nov 22nd 2026)\n\n  - first release\n');
  const titleOnly = project({ changelog: '# Changelog\n' });
  prep(titleOnly);
  assert.equal(read(titleOnly, 'CHANGELOG.md'), '# Changelog\n\n# 0.1.0 (Nov 22nd 2026)\n\n  - Release v0.1.0\n');
});

test('an (unreleased) top section is dated and keeps its bullets, even for another version', () => {
  const unreleased = '# 0.2.0 (unreleased)\n\n  - **Feat:** hand written\n\n# 0.1.0 (Nov 21st 2026)\n\n  - old\n';
  const root = project({ changelog: unreleased, version: '0.1.0' });
  const { warnings } = prep(root, { version: '0.2.0', subjects: 'feat: generated one\nfix: generated two' });
  assert.equal(read(root, 'CHANGELOG.md'), unreleased.replace('(unreleased)', '(Nov 22nd 2026)'));
  assert.equal(warnings.length, 0);
  const other = project({ changelog: unreleased, version: '0.1.0' });
  assert.match(prep(other, { version: '0.3.0' }).warnings[0], /Unreleased changelog section was 0\.2\.0, releasing as 0\.3\.0/);
  assert.ok(read(other, 'CHANGELOG.md').startsWith('# 0.3.0 (Nov 22nd 2026)\n\n  - **Feat:** hand written'));
});

test('long month style of an existing changelog is followed', () => {
  const root = project({ changelog: '# 0.1.0 (November 21st 2026)\n\n  - old\n' });
  prep(root, { version: '0.1.1', titles: ['fix: x'] });
  assert.ok(read(root, 'CHANGELOG.md').startsWith('# 0.1.1 (November 22nd 2026)'));
});

test('bullet sources: titles, git subjects, plan steps, single title, fallback', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bullets-'));
  mkdirSync(path.join(root, 'specs/issue-3'), { recursive: true });
  writeFileSync(path.join(root, 'specs/issue-3/plan.md'), '## Plan\n### Step 1: Add the route\n### Step 2: Cover it\n');
  const base = { version: '1.0.0', root, specsDir: 'specs/issue-3' };
  assert.deepEqual(collectBullets({ ...base, titles: ['feat: A', 'fix: B'], subjects: 'x\ny' }), ['A', 'B']);
  assert.deepEqual(collectBullets({ ...base, titles: ['feat: A'], subjects: 'feat: one (#1)\nfix(x): two\nfeat: one (#1)' }), ['one', 'two']);
  assert.deepEqual(collectBullets({ ...base, titles: ['feat: A'], subjects: 'only one' }), ['Add the route', 'Cover it']);
  assert.deepEqual(collectBullets({ version: '1.0.0', root, specsDir: 'specs/none', titles: ['feat(db): A'], subjects: 'only one' }), ['A']);
  assert.deepEqual(collectBullets({ version: '1.0.0', root, titles: [], subjects: 'fix: only one' }), ['only one']);
  assert.deepEqual(collectBullets({ version: '1.0.0', root, titles: [], subjects: '' }), ['Release v1.0.0']);
  const many = Array.from({ length: 14 }, (_, i) => `feat: n${i}`).join('\n');
  assert.equal(collectBullets({ version: '1.0.0', root, titles: [], subjects: many }).length, 10);
});

test('idempotent: a second run changes nothing and reports no files', () => {
  const root = project({ sub: ['admin'], changelog: MEGADEX });
  const first = prep(root, { titles: ['feat: x'] });
  assert.ok(first.changed.length > 0);
  const snapshot = ['package.json', 'package-lock.json', 'admin/package.json', 'admin/package-lock.json', 'CHANGELOG.md'].map((f) => read(root, f));
  const second = prep(root, { titles: ['feat: x'], subjects: 'feat: other\nfix: another' });
  assert.deepEqual(second.changed, []);
  assert.deepEqual(['package.json', 'package-lock.json', 'admin/package.json', 'admin/package-lock.json', 'CHANGELOG.md'].map((f) => read(root, f)), snapshot);
  // also when the unreleased section was the source
  const u = project({ changelog: '# 0.1.0 (unreleased)\n\n  - a\n' });
  prep(u);
  assert.deepEqual(prep(u).changed, []);
});

test('updateChangelog leaves an existing dated section for the version alone', () => {
  assert.equal(updateChangelog(FOXNOX, { version: '0.1.0', date: '2026-12-01', bullets: ['x'] }).status, 'unchanged');
});

test('CRLF changelogs keep their line endings', () => {
  const crlf = FOXNOX.replace(/\n/g, '\r\n');
  const out = updateChangelog(crlf, { version: '0.2.0', date: '2026-12-01', bullets: ['x'] }).text;
  assert.ok(!/[^\r]\n/.test(out));
  assert.ok(out.includes('# 0.2.0 (Dec 1st 2026)\r\n\r\n  - x\r\n'));
});

test('CLI: flags, JSON list on stdout, env CHANGE_SUBJECTS, errors', () => {
  const root = project({ sub: [], changelog: MEGADEX });
  const run = (args, env = {}) => spawnSync('node', [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  const ok = run(['--root', root, '--version', '0.1.0', '--date', 'Nov 22nd 2026', '--title', 'chore: t'], { CHANGE_SUBJECTS: 'feat: one\nfix: two' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), ['package.json', 'package-lock.json', 'CHANGELOG.md']);
  assert.match(read(root, 'CHANGELOG.md'), /# 0\.1\.0 \(Nov 22nd 2026\)\n\n  - one\n  - two\n/);
  assert.deepEqual(JSON.parse(run(['--root', root, '--version', '0.1.0', '--date', '2026-11-22']).stdout), []);
  assert.equal(run(['--root', root]).status, 2);
  assert.equal(run(['--root', root, '--version', 'abc', '--date', '2026-11-22']).status, 1);
});
