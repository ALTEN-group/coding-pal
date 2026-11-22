import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTestPlan, inScopeFiles } from './check-test-plan.mjs';

const plan = (scope, rows) => `# Plan: x

## File Scope & Boundaries
- **In Scope:** ${scope}
- **Out of Scope:** _None._

## Test Plan
| Criterion | Test | Step |
|---|---|---|
${rows.join('\n')}

## Open Questions & Assumptions
_None._
`;

const CODE_SCOPE = '`src/matrices/mat4.ts`, `tests/matrices/mat4.test.js`, `website/docs/api/mat4.md`';

test('reads the In Scope files', () => {
  assert.deepEqual(inScopeFiles(plan(CODE_SCOPE, [])), ['src/matrices/mat4.ts', 'tests/matrices/mat4.test.js', 'website/docs/api/mat4.md']);
});

test('rows that name a test file pass', () => {
  assert.deepEqual(checkTestPlan(plan(CODE_SCOPE, [
    '| AC-1 | tests/matrices/mat4.test.js: AC-1 builds the matrix | Step 2 |',
    '| AC-2 | `tests/a/b.spec.ts`: AC-2 other | Step 2 |',
    '| AC-3 | src/x.test.js: AC-3 colocated | Step 2 |',
  ])), []);
});

test('the #65 mistake: a documentation file named as the test is rejected', () => {
  const problems = checkTestPlan(plan(CODE_SCOPE, [
    '| AC-1 | tests/matrices/mat4.test.js: AC-1 builds the matrix | Step 2 |',
    '| AC-7 | website/docs/api/mat4.md: AC-7 docs mention orthographicBox (verified by grep) | Step 5 |',
  ]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^AC-7: .*`website\/docs\/api\/mat4\.md`.*not a test file/);
});

test('a row that names no file, or a source file, is rejected', () => {
  assert.equal(checkTestPlan(plan(CODE_SCOPE, ['| AC-1 | covered by review | Step 1 |'])).length, 1);
  assert.equal(checkTestPlan(plan(CODE_SCOPE, ['| AC-1 | src/matrices/mat4.ts: AC-1 something | Step 1 |'])).length, 1);
  assert.equal(checkTestPlan(plan(CODE_SCOPE, ['| AC-1 | npm test: AC-1 something | Step 1 |'])).length, 1);
});

test('documentation-only plans are exempt (criteria-verify is N/A for them)', () => {
  assert.deepEqual(checkTestPlan(plan('`website/docs/api/mat4.md`, `docs/x.md`', ['| AC-1 | Documentation review: mentions it | Step 1 |'])), []);
});

test('header and separator rows are ignored', () => {
  assert.deepEqual(checkTestPlan(plan(CODE_SCOPE, [])), []);
});
