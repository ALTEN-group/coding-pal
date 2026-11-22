import assert from 'node:assert/strict';
import test from 'node:test';
import { mergedIssueNumbers, planBatch } from './plan-batch.mjs';

const issues = [
  { number: 43, title: 'perf(cache): a', labels: [{ name: 'audit:perf-audit' }] },
  { number: 70, title: 'chore(grid): b', labels: ['audit:dead-code'] },
  { number: 55, title: 'refactor(x): c', labels: [] },
];
const prs = (...nums) => nums.map((n, i) => ({ number: 100 + i, headRefName: `feature/issue-${n}-slug` }));

test('merged issue numbers come from the feature branch name', () => {
  assert.deepEqual([...mergedIssueNumbers([{ headRefName: 'feature/issue-7-x' }, { headRefName: 'fix/other' }])], [7]);
});

test('train holds while other milestone issues are unmerged', () => {
  const plan = planBatch({ issueNumber: 43, issues, mergedPrs: prs(43, 70) });
  assert.equal(plan.hold, true);
  assert.deepEqual(plan.pending, [55]);
  assert.deepEqual(plan.members, [43, 70]);
});

test('last issue to merge releases the whole milestone', () => {
  const plan = planBatch({ issueNumber: 55, issues, mergedPrs: prs(43, 70, 55) });
  assert.equal(plan.hold, false);
  assert.deepEqual(plan.members, [43, 55, 70]);
  assert.equal(plan.titles.length, 3);
  assert.ok(plan.labels.includes('audit:perf-audit'));
});

test('release:now ships the merged members without waiting', () => {
  const plan = planBatch({ issueNumber: 43, issues, mergedPrs: prs(43), labels: ['release:now'] });
  assert.equal(plan.hold, false);
  assert.equal(plan.forced, true);
  assert.deepEqual(plan.members, [43]);
  assert.deepEqual(plan.pending, [55, 70]);
});

test('the issue being released always counts as merged', () => {
  const plan = planBatch({ issueNumber: 43, issues: [issues[0]], mergedPrs: [] });
  assert.equal(plan.hold, false);
  assert.deepEqual(plan.members, [43]);
});

test('a closed issue without a merged PR (already resolved) never holds the train', () => {
  const withClosed = [
    { number: 43, title: 'a', state: 'OPEN', labels: [] },
    { number: 56, title: 'b', state: 'CLOSED', labels: [] },
    { number: 55, title: 'c', state: 'OPEN', labels: [] },
  ];
  const plan = planBatch({ issueNumber: 55, issues: withClosed, mergedPrs: prs(43, 55) });
  assert.equal(plan.hold, false);
  assert.deepEqual(plan.pending, []);
  assert.deepEqual(plan.members, [43, 55]);
});

test('an open unmerged issue still holds the train; a missing state counts as open', () => {
  const mixed = [{ number: 1, title: 'a', labels: [] }, { number: 2, title: 'b', state: 'OPEN', labels: [] }, { number: 3, title: 'c', state: 'CLOSED', labels: [] }];
  const plan = planBatch({ issueNumber: 1, issues: mixed, mergedPrs: prs(1) });
  assert.equal(plan.hold, true);
  assert.deepEqual(plan.pending, [2]);
});
