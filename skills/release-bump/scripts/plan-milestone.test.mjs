import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { issueLevel, nextVersion, parseRelease, planMilestone, trainLevel } from './plan-milestone.mjs';

const plan = (title, { labels = [], milestones = [], latestReleaseTag = 'v4.6.1' } = {}) =>
  planMilestone({ latestReleaseTag, title, labels, milestones });

test('issue level from title and labels', () => {
  assert.equal(issueLevel('test(utils): cover x', []), 'none');
  assert.equal(issueLevel('docs(overview): x', []), 'none');
  assert.equal(issueLevel('ci: x', []), 'none');
  assert.equal(issueLevel('perf(db): x', []), 'patch');
  assert.equal(issueLevel('chore(deps): x', []), 'patch');
  assert.equal(issueLevel('fix(a): x', []), 'patch');
  assert.equal(issueLevel('feat(api): x', []), 'minor');
  assert.equal(issueLevel('refactor(a)!: x', []), 'major');
  assert.equal(issueLevel('refactor(a): x', [{ name: 'breaking' }]), 'major');
  assert.equal(issueLevel('refactor(a): x', ['release:major']), 'major');
  assert.equal(issueLevel('test(a): x', ['release:minor']), 'minor');
  assert.equal(issueLevel('refactor(a): x', ['audit:perf-audit']), 'patch', 'audit labels do not raise the level');
});

test('test and docs issues get no milestone', () => {
  assert.deepEqual(plan('test(auth): cover login'), { action: 'none', level: 'none' });
});

test('no train in progress: create the next version for the issue level', () => {
  assert.deepEqual(plan('perf(db): x'), { action: 'create', level: 'patch', title: '4.6.2' });
  assert.deepEqual(plan('feat(api): x'), { action: 'create', level: 'minor', title: '4.7.0' });
  assert.deepEqual(plan('refactor(a)!: x'), { action: 'create', level: 'major', title: '5.0.0' });
});

test('the latest release can be given as tag, latestVersion or legacy published', () => {
  const base = { title: 'feat(a): x', labels: [], milestones: [] };
  for (const input of [{ latestReleaseTag: 'v4.6.1' }, { latestVersion: '4.6.1' }, { published: '4.6.1' }]) {
    assert.deepEqual(planMilestone({ ...base, ...input }), { action: 'create', level: 'minor', title: '4.7.0' });
  }
});

test('train in progress is reused when it covers the level', () => {
  const milestones = [{ number: 3, title: '5.0.0' }];
  for (const title of ['perf(a): x', 'feat(a): x', 'refactor(a)!: x']) {
    assert.deepEqual(plan(title, { milestones }), { action: 'use', level: plan(title).level, title: '5.0.0', number: 3 });
  }
});

test('a higher-level issue raises the train instead of opening a second one', () => {
  const milestones = [{ number: 3, title: '4.7.0' }];
  assert.deepEqual(plan('refactor(a)!: x', { milestones }), { action: 'rename', level: 'major', title: '5.0.0', number: 3 });
  assert.deepEqual(plan('perf(a): x', { milestones }), { action: 'use', level: 'patch', title: '4.7.0', number: 3 });
});

test('milestones at or below the released version, or not versions, are not in progress', () => {
  const milestones = [{ number: 1, title: '4.6.1' }, { number: 2, title: '4.5.0' }, { number: 3, title: 'perf-batch' }];
  assert.deepEqual(plan('perf(a): x', { milestones }), { action: 'create', level: 'patch', title: '4.6.2' });
});

test('with several trains the lowest one in progress is used', () => {
  const milestones = [{ number: 9, title: '5.0.0' }, { number: 4, title: '4.7.0' }];
  assert.equal(plan('feat(a): x', { milestones }).number, 4);
});

test('raising a train to a level that already has its own milestone joins that one', () => {
  const milestones = [{ number: 4, title: '4.6.2' }, { number: 9, title: '5.0.0' }];
  assert.deepEqual(plan('refactor(a)!: x', { milestones }), { action: 'use', level: 'major', title: '5.0.0', number: 9 });
});

test('no release yet or unparseable version: no automatic milestone', () => {
  assert.equal(plan('perf(a): x', { latestReleaseTag: '' }).action, 'none');
  assert.equal(plan('perf(a): x', { latestReleaseTag: 'latest' }).action, 'none');
});

test('0.x stable: a breaking issue is a minor train', () => {
  assert.deepEqual(plan('refactor(a)!: x', { latestReleaseTag: 'v0.5.2' }), { action: 'create', level: 'minor', title: '0.6.0' });
  assert.deepEqual(plan('feat(a): x', { latestReleaseTag: 'v0.5.2', milestones: [{ number: 2, title: '0.6.0' }] }), { action: 'use', level: 'minor', title: '0.6.0', number: 2 });
});

test('prerelease latest release: the stable core is the next train (promotion)', () => {
  const alpha = { latestReleaseTag: 'v0.1.0-alpha.1' };
  assert.deepEqual(plan('fix(a): x', alpha), { action: 'create', level: 'patch', title: '0.1.0' });
  assert.deepEqual(plan('feat(a): x', alpha), { action: 'create', level: 'minor', title: '0.1.0' });
  assert.deepEqual(plan('refactor(a)!: x', alpha), { action: 'create', level: 'minor', title: '0.1.0' }, '0.x breaking is minor');
  const train = [{ number: 5, title: '0.1.0' }];
  assert.deepEqual(plan('feat(a): x', { ...alpha, milestones: train }), { action: 'use', level: 'minor', title: '0.1.0', number: 5 });
  assert.deepEqual(plan('fix(a): x', { ...alpha, milestones: train }), { action: 'use', level: 'patch', title: '0.1.0', number: 5 });
  // a milestone below the core is stale
  assert.equal(plan('fix(a): x', { ...alpha, milestones: [{ number: 1, title: '0.0.9' }] }).action, 'create');
  // a stable-major prerelease: breaking goes to the next major
  assert.deepEqual(plan('refactor(a)!: x', { latestReleaseTag: 'v2.0.0-rc.1' }), { action: 'create', level: 'major', title: '3.0.0' });
  assert.deepEqual(plan('fix(a): x', { latestReleaseTag: 'v2.0.0-rc.1' }), { action: 'create', level: 'patch', title: '2.0.0' });
});

test('version helpers', () => {
  assert.equal(nextVersion([4, 6, 1], 'patch'), '4.6.2');
  assert.equal(nextVersion([4, 6, 1], 'minor'), '4.7.0');
  assert.equal(nextVersion([0, 1, 0], 'patch', { prerelease: true }), '0.1.0');
  assert.equal(nextVersion([0, 1, 0], 'major', { prerelease: true }), '1.0.0');
  assert.equal(trainLevel([4, 6, 1], 'v5.0.0'), 'major');
  assert.equal(trainLevel([4, 6, 1], '4.6.1'), 'none');
  assert.equal(trainLevel([0, 1, 0], '0.1.0', { prerelease: true }), 'patch');
  assert.deepEqual(parseRelease('v0.1.0-alpha.2'), { core: [0, 1, 0], pre: 'alpha.2' });
  assert.equal(parseRelease('nope'), null);
});

test('CLI reads JSON on stdin', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan-milestone.mjs');
  const run = spawnSync('node', [script], { input: JSON.stringify({ latestReleaseTag: 'v1.2.3', title: 'feat: x', milestones: [] }), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(run.stdout), { action: 'create', level: 'minor', title: '1.3.0' });
});
