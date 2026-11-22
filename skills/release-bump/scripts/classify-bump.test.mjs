import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  bumpVersion, classify, diffEnv, diffLiquibase, diffOpenApi, globToRegExp, intentFloor, milestoneFloor, nextPrerelease, parseArgs, parseEnv,
} from './classify-bump.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'classify-bump.mjs');
const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    if (content === null) {
      rmSync(full, { force: true });
      continue;
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

/** Git repo: `prev` committed and tagged v1, then `next` applied (null deletes) and committed. */
function scenario(prev, next = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'classify-'));
  git(dir, 'init', '-q');
  write(dir, { 'README.md': '# app\n', ...prev });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'v1');
  git(dir, 'tag', 'v1');
  write(dir, next);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'next');
  return dir;
}

const run = (repoRoot, extra = {}) => classify({ repoRoot, prevRef: 'v1', currentVersion: '1.2.0', titles: [], labels: [], ...extra });

const SPEC = 'swagger/src/app.openapi.example.json';
const spec = (over = {}) => ({
  openapi: '3.0.3',
  info: { title: 'App', version: '1.2.0' },
  paths: {
    '/users': {
      get: {
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
      post: {
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, nick: { type: 'string' } } } } } },
        responses: { 201: { description: 'created' } },
      },
    },
    '/users/{id}': {
      delete: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'gone' } } },
    },
  },
  components: { schemas: { User: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] } } } } },
  ...over,
});
const edited = (fn) => {
  const s = spec();
  fn(s);
  return s;
};

// ------------------------------------------------------------------ intent, milestone, helpers

test('intent floors from title and labels', () => {
  assert.deepEqual(intentFloor('feat(api): x', []), { level: 'minor', confirmedMajor: false });
  assert.deepEqual(intentFloor('fix: x', []), { level: 'patch', confirmedMajor: false });
  assert.deepEqual(intentFloor('feat!: x', []), { level: 'major', confirmedMajor: true });
  assert.deepEqual(intentFloor('chore: x\n\nBREAKING CHANGE: y', []), { level: 'major', confirmedMajor: true });
  assert.equal(intentFloor('chore: x', ['breaking']).level, 'major');
  assert.equal(intentFloor('chore: x', ['release:major']).level, 'major');
  assert.equal(intentFloor('chore: x', ['release:minor']).level, 'minor');
  assert.equal(intentFloor('chore: x', ['release:patch']).level, 'patch');
  assert.equal(intentFloor('docs: x', []).level, 'none');
});

test('milestone named like a version declares the level', () => {
  assert.deepEqual(milestoneFloor('5.0.0', '4.6.0'), { level: 'major', confirmedMajor: true });
  assert.deepEqual(milestoneFloor('v4.7.0', '4.6.0'), { level: 'minor', confirmedMajor: false });
  assert.deepEqual(milestoneFloor('4.6.1', '4.6.0'), { level: 'patch', confirmedMajor: false });
  assert.equal(milestoneFloor('Sprint 4', '4.6.0').level, 'none');
  assert.equal(milestoneFloor('4.6.0', '4.6.0').level, 'none');
});

test('version helpers and glob matcher', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(nextPrerelease('0.1.0-alpha.1'), '0.1.0-alpha.2');
  assert.equal(nextPrerelease('0.1.0-alpha.9'), '0.1.0-alpha.10');
  assert.equal(nextPrerelease('1.0.0-rc'), '1.0.0-rc.1');
  const g = (glob, file) => globToRegExp(glob).test(file);
  assert.ok(g('db/liquibase/**', 'db/liquibase/app/changelog.xml'));
  assert.ok(g('db/liquibase/**', 'db/liquibase/a.sql'));
  assert.ok(!g('db/liquibase/**', 'db/other/a.sql'));
  assert.ok(g('swagger/src/*.openapi*.json', 'swagger/src/foxnox.openapi.example.json'));
  assert.ok(!g('swagger/src/*.openapi*.json', 'swagger/src/sub/foxnox.openapi.json'));
  assert.ok(g('docker/conf/.env.*.example', 'docker/conf/.env.prod.example'));
  assert.ok(g('**/x.json', 'x.json'));
  assert.ok(g('**/x.json', 'a/b/x.json'));
  assert.ok(!g('a.b', 'aXb'), 'dots are literal');
});

test('parseArgs reads the documented flags, repeated --title and empty --prev-ref', () => {
  const o = parseArgs(['node', 's', '--repo-root', '/tmp', '--prev-ref', '', '--current-version', 'v1.2.3', '--title', 'a', '--title', 'b', '--milestone', '5.0.0', '--labels', 'Breaking, X', '--env-glob', 'e/**']);
  assert.equal(o.prevRef, '');
  assert.equal(o.currentVersion, '1.2.3');
  assert.deepEqual(o.titles, ['a', 'b']);
  assert.deepEqual(o.labels, ['breaking', 'x']);
  assert.equal(o.milestone, '5.0.0');
  assert.equal(o.envGlob, 'e/**');
});

// ------------------------------------------------------------------ shipped changes / none

test('only tests, docs and CI changed => no release even with a feat title', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'tests/a.test.js': 't\n', 'doc/x.md': 'd\n', '.github/workflows/ci.yml': 'on: push\n' });
  const r = run(dir, { titles: ['feat: big'] });
  assert.equal(r.bump, 'none');
  assert.equal(r.targetVersion, undefined);
  assert.deepEqual(r.shippedChanges, []);
});

test('shipped source change => patch with targetVersion', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'src/a.js': '2\n' });
  const r = run(dir);
  assert.equal(r.bump, 'patch');
  assert.equal(r.targetVersion, '1.2.1');
  assert.deepEqual(r.shippedChanges, ['modified src/a.js']);
  assert.equal(r.needsConfirmation, false);
  assert.deepEqual(r.evidence, { openapi: [], liquibase: [], env: [] });
});

test('a version-only package.json / lock change is not a shipped change', () => {
  const pkg = (v) => ({ name: 'app', version: v, dependencies: { a: '1' } });
  const lock = (v) => ({ name: 'app', version: v, packages: { '': { name: 'app', version: v } } });
  const dir = scenario({ 'package.json': pkg('1.2.0'), 'package-lock.json': lock('1.2.0') }, { 'package.json': pkg('1.2.1'), 'package-lock.json': lock('1.2.1') });
  assert.equal(run(dir).bump, 'none');
  const dep = scenario({ 'package.json': pkg('1.2.0') }, { 'package.json': { ...pkg('1.2.0'), dependencies: { a: '2' } } });
  assert.equal(run(dep).bump, 'patch');
});

test('intent floors raise the level; title feat => minor, release:minor label => minor', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'src/a.js': '2\n' });
  assert.equal(run(dir, { titles: ['feat: x'] }).bump, 'minor');
  assert.equal(run(dir, { titles: ['feat: x'] }).targetVersion, '1.3.0');
  assert.equal(run(dir, { labels: ['release:minor'] }).bump, 'minor');
  assert.equal(run(dir, { titles: ['fix: x'] }).bump, 'patch');
});

test('explicit breaking marker => major without confirmation', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'src/a.js': '2\n' });
  for (const extra of [{ titles: ['feat!: x'] }, { labels: ['breaking'] }, { labels: ['release:major'] }]) {
    const r = run(dir, extra);
    assert.equal(r.bump, 'major');
    assert.equal(r.needsConfirmation, false);
    assert.equal(r.targetVersion, '2.0.0');
  }
});

test('milestone 5.0.0 over 1.x declares a confirmed major; 1.3.0 floors minor; 1.2.1 floors patch', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'src/a.js': '2\n' });
  const major = run(dir, { milestone: '2.0.0' });
  assert.equal(major.bump, 'major');
  assert.equal(major.needsConfirmation, false);
  assert.equal(run(dir, { milestone: '1.3.0' }).bump, 'minor');
  assert.equal(run(dir, { milestone: '1.2.1' }).bump, 'patch');
});

// ------------------------------------------------------------------ OpenAPI evidence

test('openapi: added optional parameter / property / response / endpoint => minor', () => {
  const cases = [
    (s) => s.paths['/users'].get.parameters.push({ name: 'offset', in: 'query', schema: { type: 'integer' } }),
    (s) => { s.components.schemas.User.properties.email = { type: 'string' }; },
    (s) => { s.paths['/users'].get.responses[404] = { description: 'nf' }; },
    (s) => { s.paths['/health'] = { get: { responses: { 200: { description: 'ok' } } } }; },
    (s) => { s.paths['/users/{id}'].get = { responses: { 200: { description: 'ok' } } }; },
    (s) => { s.paths['/users'].post.requestBody.content['application/json'].schema.properties.bio = { type: 'string' }; },
  ];
  for (const fn of cases) {
    const dir = scenario({ [SPEC]: spec() }, { [SPEC]: edited(fn) });
    const r = run(dir);
    assert.equal(r.bump, 'minor', JSON.stringify(r.evidence));
    assert.ok(r.evidence.openapi.length > 0);
    assert.ok(r.evidence.openapi.every((e) => e.startsWith('[minor]')), r.evidence.openapi.join('\n'));
  }
});

test('openapi: removed or newly required things => major, evidence-only needs confirmation', () => {
  const cases = [
    [(s) => { delete s.paths['/users/{id}']; }, /removed path/],
    [(s) => { delete s.paths['/users'].post; }, /removed operation POST \/users/],
    [(s) => { s.paths['/users/{id}'].delete.parameters[0].name = 'userId'; }, /required parameter/],
    [(s) => s.paths['/users'].get.parameters.push({ name: 'tenant', in: 'query', required: true, schema: { type: 'string' } }), /new required parameter/],
    [(s) => { s.paths['/users'].get.parameters[0].required = true; }, /became required/],
    [(s) => { s.paths['/users'].post.requestBody.content['application/json'].schema.required.push('nick'); }, /became required/],
    [(s) => {
      const sc = s.paths['/users'].post.requestBody.content['application/json'].schema;
      sc.properties.age = { type: 'integer' };
      sc.required.push('age');
    }, /new required request property/],
    [(s) => { delete s.components.schemas.User.properties.role; }, /removed response property/],
    [(s) => { s.components.schemas.User.properties.role.enum = ['admin']; }, /narrowed enum/],
    [(s) => { s.components.schemas.User.properties.id.type = 'integer'; }, /changed type/],
    [(s) => { delete s.paths['/users'].get.responses[200]; s.paths['/users'].get.responses[202] = { description: 'x' }; }, /removed response 200/],
  ];
  for (const [fn, re] of cases) {
    const dir = scenario({ [SPEC]: spec() }, { [SPEC]: edited(fn) });
    const r = run(dir);
    assert.equal(r.bump, 'major', String(re));
    assert.equal(r.needsConfirmation, true, String(re));
    assert.match(r.evidence.openapi.join('\n'), re);
  }
});

test('openapi: description-only change => patch (shipped file, no API evidence)', () => {
  const dir = scenario({ [SPEC]: spec() }, { [SPEC]: edited((s) => { s.info.description = 'new text'; s.paths['/users'].get.summary = 'List'; }) });
  const r = run(dir);
  assert.equal(r.bump, 'patch');
  assert.deepEqual(r.evidence.openapi, []);
});

test('openapi: Swagger 2.0 documents are tolerated', () => {
  const v2 = (extra = {}) => ({
    swagger: '2.0',
    paths: { '/a': { post: { parameters: [{ in: 'body', name: 'b', schema: { $ref: '#/definitions/B' } }], responses: { 200: { description: 'ok', schema: { $ref: '#/definitions/B' } } } } } },
    definitions: { B: { type: 'object', properties: { x: { type: 'string' } }, ...extra } },
  });
  const added = diffOpenApi(v2(), v2({ required: [] }));
  assert.deepEqual(added, []);
  const out = diffOpenApi(v2(), { ...v2(), definitions: { B: { type: 'object', properties: {} } } });
  assert.ok(out.some((d) => d.level === 'major' && /removed response property/.test(d.message)));
});

test('openapi: a milestone of a major keeps description-only work a confirmed major, evidence cannot lower it', () => {
  const dir = scenario({ [SPEC]: spec() }, { [SPEC]: edited((s) => { s.paths['/health'] = { get: { responses: { 200: { description: 'ok' } } } }; }) });
  const r = run(dir, { labels: ['breaking'] });
  assert.equal(r.bump, 'major');
});

// ------------------------------------------------------------------ Liquibase evidence

const XML = (sets) => `<?xml version="1.0" encoding="UTF-8"?>\n<databaseChangeLog>\n${sets}\n</databaseChangeLog>\n`;
const CS1 = '<changeSet id="1" author="a">\n  <createTable tableName="users"><column name="id" type="int"/></createTable>\n</changeSet>';
const CS2_SAFE = '<changeSet id="2" author="a">\n  <addColumn tableName="users"><column name="email" type="text"/></addColumn>\n</changeSet>';
const CS2_DROP = '<changeSet id="2" author="a">\n  <dropColumn tableName="users" columnName="name"/>\n</changeSet>';
const CHANGELOG = 'db/liquibase/app/changelog.xml';

test('liquibase: new changeSet => minor', () => {
  const dir = scenario({ [CHANGELOG]: XML(CS1) }, { [CHANGELOG]: XML(`${CS1}\n${CS2_SAFE}`) });
  const r = run(dir);
  assert.equal(r.bump, 'minor');
  assert.deepEqual(r.evidence.liquibase, [`[minor] ${CHANGELOG}: new changeSet 2`]);
  assert.equal(r.needsConfirmation, false);
});

test('liquibase: new destructive changeSet => major (destructive), needs confirmation', () => {
  const dir = scenario({ [CHANGELOG]: XML(CS1) }, { [CHANGELOG]: XML(`${CS1}\n${CS2_DROP}`) });
  const r = run(dir);
  assert.equal(r.bump, 'major');
  assert.equal(r.needsConfirmation, true);
  assert.match(r.evidence.liquibase[0], /\(destructive\)/);
});

test('liquibase: DROP / RENAME in SQL changeSets is destructive, a DROP only in the rollback is not', () => {
  const sql = (body) => `--liquibase formatted sql\n\n--changeset a:1\ncreate table t (id int);\n\n--changeset a:2\n${body}\n`;
  const prev = { 'db/liquibase/app/001.sql': '--liquibase formatted sql\n\n--changeset a:1\ncreate table t (id int);\n' };
  const safe = scenario(prev, { 'db/liquibase/app/001.sql': sql('alter table t add column c int;\n--rollback drop table t;') });
  assert.equal(run(safe).bump, 'minor');
  for (const body of ['drop table t;', 'ALTER TABLE t RENAME COLUMN a TO b;', 'alter table t alter column a type bigint;']) {
    const r = run(scenario(prev, { 'db/liquibase/app/001.sql': sql(body) }));
    assert.equal(r.bump, 'major', body);
    assert.match(r.evidence.liquibase[0], /\(destructive\)/);
  }
});

test('liquibase: YAML changeSets are parsed, rollback ignored', () => {
  const yaml = (extra) => `databaseChangeLog:\n  - changeSet:\n      id: 1\n      author: a\n      changes:\n        - createTable:\n            tableName: t\n${extra}`;
  const prev = { 'db/liquibase/app/changelog.yaml': yaml('') };
  const add = `  - changeSet:\n      id: 2\n      author: a\n      changes:\n        - addColumn:\n            tableName: t\n      rollback:\n        - dropColumn:\n            tableName: t\n`;
  const r = run(scenario(prev, { 'db/liquibase/app/changelog.yaml': yaml(add) }));
  assert.equal(r.bump, 'minor');
  const drop = `  - changeSet:\n      id: 2\n      author: a\n      changes:\n        - dropTable:\n            tableName: t\n`;
  assert.equal(run(scenario(prev, { 'db/liquibase/app/changelog.yaml': yaml(drop) })).bump, 'major');
});

test('liquibase: editing an already released changeSet => major (modified released changeSet)', () => {
  const changed = CS1.replace('type="int"', 'type="bigint"');
  const dir = scenario({ [CHANGELOG]: XML(CS1) }, { [CHANGELOG]: XML(changed) });
  const r = run(dir);
  assert.equal(r.bump, 'major');
  assert.equal(r.needsConfirmation, true);
  assert.match(r.evidence.liquibase[0], /\(modified released changeSet\)/);
});

test('liquibase: include-only edits of a root file and whitespace/comment edits are not evidence', () => {
  const root = (inc) => `<databaseChangeLog>\n${inc}</databaseChangeLog>\n`;
  const dir = scenario({ [CHANGELOG]: XML(CS1) }, { [CHANGELOG]: XML(`<!-- note -->\n${CS1.replace('  <create', '      <create')}`), 'db/liquibase/root/changelog.xml': root('<include file="a.xml"/>\n') });
  const r = run(dir);
  assert.equal(r.bump, 'patch');
  assert.deepEqual(r.evidence.liquibase, []);
});

test('liquibase: diffLiquibase on a brand new file reports each changeSet', () => {
  const out = diffLiquibase(CHANGELOG, null, XML(`${CS1}\n${CS2_DROP}`));
  assert.deepEqual(out.map((o) => o.level), ['minor', 'major']);
});

// ------------------------------------------------------------------ env evidence

const ENV = 'docker/conf/.env.prod.example';

test('env: parse', () => {
  const vars = parseEnv('# C=1\nA=1\nB=\nC=""\nexport D=x # why\nE\n\nbad line\n');
  assert.deepEqual([...vars], [['A', true], ['B', false], ['C', false], ['D', true], ['E', false]]);
});

test('env: removed or renamed variable => major', () => {
  const dir = scenario({ [ENV]: 'A=1\nB=2\n' }, { [ENV]: 'A=1\nB_NEW=2\n' });
  const r = run(dir);
  assert.equal(r.bump, 'major');
  assert.equal(r.needsConfirmation, true);
  assert.match(r.evidence.env.join('\n'), /removed or renamed variable B\b/);
});

test('env: added variable without default => minor, with default => patch', () => {
  const noDefault = run(scenario({ [ENV]: 'A=1\n' }, { [ENV]: 'A=1\nSECRET=\n' }));
  assert.equal(noDefault.bump, 'minor');
  assert.match(noDefault.evidence.env[0], /^\[minor\].*SECRET/);
  const bare = run(scenario({ [ENV]: 'A=1\n' }, { [ENV]: 'A=1\nTOKEN\n' }));
  assert.equal(bare.bump, 'minor');
  const withDefault = run(scenario({ [ENV]: 'A=1\n' }, { [ENV]: 'A=1\nPORT=3000\n' }));
  assert.equal(withDefault.bump, 'patch');
  assert.match(withDefault.evidence.env[0], /^\[patch\]/);
  assert.deepEqual(diffEnv(ENV, 'A=1\n', null).map((d) => d.level), ['major']);
});

test('custom globs are honoured', () => {
  const dir = scenario({ 'conf/api.json': spec(), 'src/a.js': '1\n' }, { 'conf/api.json': edited((s) => { delete s.paths['/users']; }), 'src/a.js': '2\n' });
  assert.equal(run(dir).evidence.openapi.length, 0);
  assert.equal(run(dir).bump, 'patch');
  assert.equal(run(dir, { openapiGlob: 'conf/*.json' }).bump, 'major');
});

// ------------------------------------------------------------------ semver rules

test('0.x stable: evidence-only major is released as minor without confirmation', () => {
  const dir = scenario({ [ENV]: 'A=1\nB=2\n' }, { [ENV]: 'A=1\n' });
  const r = run(dir, { currentVersion: '0.4.2' });
  assert.equal(r.bump, 'minor');
  assert.equal(r.needsConfirmation, false);
  assert.equal(r.targetVersion, '0.5.0');
  assert.match(r.reason, /0\.x version/);
  const explicit = run(dir, { currentVersion: '0.4.2', labels: ['breaking'] });
  assert.equal(explicit.bump, 'minor');
  assert.equal(explicit.targetVersion, '0.5.0');
});

test('prerelease versions release any shipped change as prerelease', () => {
  const dir = scenario({ 'src/a.js': '1\n', [ENV]: 'A=1\nB=2\n' }, { 'src/a.js': '2\n', [ENV]: 'A=1\n' });
  const r = run(dir, { currentVersion: '0.1.0-alpha.1' });
  assert.equal(r.bump, 'prerelease');
  assert.equal(r.targetVersion, '0.1.0-alpha.2');
  assert.equal(r.needsConfirmation, false);
  const rc = run(dir, { currentVersion: '2.0.0-rc.3', titles: ['feat: x'] });
  assert.equal(rc.targetVersion, '2.0.0-rc.4');
  const none = scenario({ 'src/a.js': '1\n' }, { 'doc/x.md': 'd\n' });
  assert.equal(run(none, { currentVersion: '0.1.0-alpha.1' }).bump, 'none');
});

test('promote: milestone equal to the core of the alpha promotes it to stable', () => {
  const dir = scenario({ 'src/a.js': '1\n' }, { 'src/a.js': '2\n' });
  const r = run(dir, { currentVersion: '0.1.0-alpha.6', milestone: '0.1.0' });
  assert.equal(r.bump, 'promote');
  assert.equal(r.targetVersion, '0.1.0');
  const v = run(dir, { currentVersion: '0.1.0-alpha.6', milestone: 'v0.1.0' });
  assert.equal(v.targetVersion, '0.1.0');
  // another milestone: still a prerelease
  assert.equal(run(dir, { currentVersion: '0.1.0-alpha.6', milestone: '0.2.0' }).bump, 'prerelease');
  // nothing shipped: never promote
  const docs = scenario({ 'src/a.js': '1\n' }, { 'doc/x.md': 'd\n' });
  assert.equal(run(docs, { currentVersion: '0.1.0-alpha.6', milestone: '0.1.0' }).bump, 'none');
});

test('empty prev-ref: first release is at least minor', () => {
  const dir = scenario({ 'src/a.js': '1\n', 'tests/a.test.js': 't\n', 'README.md': 'x\n' });
  const r = classify({ repoRoot: dir, prevRef: '', currentVersion: '0.0.1', titles: [], labels: [] });
  assert.equal(r.bump, 'minor');
  assert.equal(r.targetVersion, '0.1.0');
  assert.ok(r.shippedChanges.includes('added src/a.js'));
  assert.ok(!r.shippedChanges.some((c) => c.includes('tests/')));
  assert.match(r.reason, /no previous release/);
  const floor = classify({ repoRoot: dir, prevRef: '', currentVersion: '1.0.0', titles: ['feat!: x'], labels: [] });
  assert.equal(floor.bump, 'major');
  assert.equal(floor.needsConfirmation, false);
  assert.equal(classify({ repoRoot: dir, prevRef: '', currentVersion: '0.1.0-alpha.1', titles: [], labels: [] }).bump, 'prerelease');
});

test('evidence-only major on a stable >=1 version needs confirmation, the breaking label confirms it', () => {
  const dir = scenario({ [SPEC]: spec() }, { [SPEC]: edited((s) => { delete s.paths['/users']; }) });
  const bare = run(dir);
  assert.equal(bare.bump, 'major');
  assert.equal(bare.needsConfirmation, true);
  assert.equal(bare.targetVersion, '2.0.0');
  const confirmed = run(dir, { labels: ['breaking'] });
  assert.equal(confirmed.needsConfirmation, false);
});

test('unknown prev-ref is an error', () => {
  const dir = scenario({ 'src/a.js': '1\n' });
  assert.throws(() => run(dir, { prevRef: 'v9' }), /does not resolve/);
});

test('CLI prints the JSON document', () => {
  const dir = scenario({ [ENV]: 'A=1\n' }, { [ENV]: 'A=1\nNEW=\n' });
  const out = spawnSync('node', [script, '--repo-root', dir, '--prev-ref', 'v1', '--current-version', '0.3.0', '--title', 'chore: x', '--labels', ''], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const json = JSON.parse(out.stdout);
  assert.equal(json.bump, 'minor');
  assert.equal(json.targetVersion, '0.4.0');
  assert.ok(Array.isArray(json.shippedChanges) && typeof json.needsConfirmation === 'boolean' && typeof json.reason === 'string');
  assert.deepEqual(Object.keys(json.evidence), ['openapi', 'liquibase', 'env']);
  assert.equal(spawnSync('node', [script], { encoding: 'utf8' }).status, 2);
});
