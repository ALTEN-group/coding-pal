#!/usr/bin/env node
/**
 * Plan-time guard for the Prove control `criteria-verify`.
 *
 * `criteria-verify` maps an acceptance criterion to a test only when the test file named in the criterion's
 * `## Test Plan` row shows up in the test runner's report. A row that names a documentation or source file
 * (for example `website/docs/api/mat4.md: AC-7 ...`) can never be satisfied, and the failure only surfaces
 * much later in Prove, after Code has already been paid for. This check fails the plan early instead.
 *
 * Documentation-only plans (every In Scope file is documentation) are exempt: Prove reports criteria-verify
 * as N/A for those (see pipeline-prove.yml), so their rows legitimately say `Documentation review: ...`.
 *
 * Usage: check-test-plan.mjs --plan <plan.md>     exit 1 and a message on stderr when a row is invalid
 */
import { readFileSync } from 'node:fs';

const TEST_FILE = /^(?:tests?|__tests__|scripts)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+$|^[A-Za-z0-9_./-]+\.(?:test|spec)\.[A-Za-z0-9]+$/;
const DOC_FILE = /^(?:website\/docs\/|docs\/)|\.(?:md|mdx)$/i;

const section = (plan, heading) =>
  (new RegExp(`^## ${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, 'm').exec(plan) || [])[1] || '';

export function inScopeFiles(plan) {
  const scope = section(plan, 'File Scope & Boundaries');
  const block = (scope.match(/^[ \t]*-\s*\*\*In Scope:\*\*[ \t]*(.*(?:\n(?:[ \t]+-[ \t]+.*|[ \t]+`.*))*)/m) || [])[1] || '';
  return [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

export function checkTestPlan(plan) {
  const files = inScopeFiles(plan);
  if (files.length && files.every((f) => DOC_FILE.test(f))) return [];
  const problems = [];
  for (const line of section(plan, 'Test Plan').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || !/^AC-\d+$/.test(cells[0])) continue;
    const file = (cells[1].match(/^`?([^:`]+?)`?\s*:/) || [])[1] || '';
    if (!TEST_FILE.test(file.trim())) {
      problems.push(`${cells[0]}: Test Plan row names ${file ? `\`${file.trim()}\`` : 'no file'}, which is not a test file`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const i = process.argv.indexOf('--plan');
  const problems = checkTestPlan(readFileSync(process.argv[i + 1], 'utf8'));
  if (problems.length) {
    console.error('::error::Test Plan rows must name a test file (under tests/ or a *.test.* file) that the test runner reports; the Prove control criteria-verify maps criteria only to such files. Cover documentation criteria with a test that asserts the docs content.');
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
}
