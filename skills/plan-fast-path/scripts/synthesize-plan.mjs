#!/usr/bin/env node
/**
 * Plan fast path: for an audit issue with Low effort, build plan.md from the issue's own sections
 * (Affected Files, Suggested Fix, Acceptance Criteria) instead of running the AI Planner, the same way
 * Plan already synthesizes think.md for audit issues.
 *
 * Eligibility is: the issue has an `audit:*` label AND its effort is Low, and think.md is the one the pipeline
 * synthesized for audit issues. After an earlier failure an audit issue gets an AI-written Think instead; that Think
 * can carry constraints (files that must stay untouched), so the AI Planner must derive the plan from it.
 * The result is not trusted blindly: pipeline-plan.yml validates it with the regular validate-plan.mjs and
 * falls back to the AI Planner when it does not pass.
 *
 * Usage: synthesize-plan.mjs --issue <issue.json> --issue-number N --effort low --think <think.md> --out <plan.md> [--root <repo>]
 *   issue.json = `gh issue view N --json title,body,labels`
 * Prints {"eligible": true|false, "reason": "..."} and writes --out when eligible.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
export const isTestPath = (p) => TEST_PATH.test(p);
const SYNTHESIZED_THINK = /^- \*\*Approved By:\*\*\s*Automated by coding-pal-audit\b/m;
const DOC_PATH = /^(website\/docs\/|docs\/)|\.(md|mdx)$/i;
export const isDocPath = (p) => DOC_PATH.test(p);

const labelNames = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
const stripPrefix = (t) => t.replace(/^(?:feat|fix|chore|refactor|perf|docs|test)(?:\([^)]+\))?!?:\s*/i, '').trim();
const plain = (s) => s.replace(/```[\s\S]*?```/g, ' ').replace(/[`*_~]+/g, '').replace(/\s+/g, ' ').trim();

function section(body, heading) {
  const re = new RegExp(`^##\\s+${heading}[ \\t]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---\\n|(?![\\s\\S]))`, 'im');
  return (re.exec(body) || [])[1] || '';
}

export function parseIssueBody(body) {
  const files = [...section(body, 'Affected Files').matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const fix = plain(section(body, 'Suggested Fix').split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*+])\s*/, '')).join(' '));
  const acs = [...section(body, 'Acceptance Criteria').matchAll(/^\s*[-*+]\s*\*\*AC-(\d+):\*\*\s*(.+)$/gim)]
    .map((m) => ({ id: Number(m[1]), text: plain(m[2]).replace(/[.\s]+$/, '') }));
  return { files: [...new Set(files)], fix, acs };
}

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage', '.agents', 'specs'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

const baseName = (p) => path.basename(p).replace(/\.(test|spec)(?=\.)/i, '').replace(/\.[^.]+$/, '');

/** The test file of a source file when exactly one test file carries the same base name. */
export function findTestFile(root, source) {
  const found = walk(root, root).filter((f) => isTestPath(f) && baseName(f) === baseName(source));
  return found.length === 1 ? found[0] : '';
}

export function synthesizePlan({ issue, issueNumber, effort, think, root, today }) {
  const audit = labelNames(issue.labels).find((l) => l.toLowerCase().startsWith('audit:'));
  if (!audit) return { eligible: false, reason: 'not an audit issue' };
  if (String(effort || '').toLowerCase() !== 'low') return { eligible: false, reason: `effort is ${effort || 'unset'}, not low` };

  if (!SYNTHESIZED_THINK.test(think || '')) return { eligible: false, reason: 'think.md was not synthesized by the pipeline; the AI Planner derives the plan from it' };

  const { files, fix, acs } = parseIssueBody(issue.body || '');
  const scope = files.filter((f) => !f.startsWith('/') && !/(^|\/)\.\.(\/|$)/.test(f));
  if (!scope.length) return { eligible: false, reason: 'no affected files in the issue body' };

  let pkg = {};
  try { pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* no package.json */ }

  // A docs-sync finding changes documentation only: criteria are verified by reviewing the docs, not by tests,
  // and the other affected files are references the docs describe (read, never edited).
  const docsSync = audit.toLowerCase() === 'audit:docs-sync';
  const docFiles = scope.filter(isDocPath);
  if (docsSync && !docFiles.length) return { eligible: false, reason: 'docs-sync issue lists no documentation file' };

  const sources = scope.filter((f) => !isTestPath(f));
  const testFile = docsSync ? '' : scope.find(isTestPath) || (sources[0] && existsSync(path.join(root, sources[0])) ? findTestFile(root, sources[0]) : '');
  if (!docsSync && !testFile) return { eligible: false, reason: 'no test file to map the acceptance criteria to' };
  const extraTestStep = Boolean(testFile) && !scope.includes(testFile);
  const inScope = docsSync ? docFiles : extraTestStep ? [...scope, testFile] : scope;
  const references = docsSync ? scope.filter((f) => !isDocPath(f)) : [];

  const tier = ((/^- \*\*Tier:\*\*\s*(\S+)/m.exec(think || '') || [])[1] || 'Low').replace(/[.,]$/, '');
  const verify = testFile ? `\`npm test -- ${testFile}\`` : '`npm test`';
  const boot = pkg.scripts?.build ? '`npm run build`' : '`npm test`';
  const all = acs.map((a) => `AC-${a.id}`).join(', ');
  const list = (arr) => arr.map((f) => `\`${f}\``).join(', ');
  const fixLine = (fix || `Resolve the ${audit} finding in ${scope.join(', ')}.`).slice(0, 400);

  const steps = [{ name: docsSync ? 'Update the documentation' : 'Apply the suggested fix', files: inScope.filter((f) => f !== testFile || !extraTestStep), action: fixLine }];
  if (extraTestStep) {
    steps.push({ name: 'Add acceptance criterion tests', files: [testFile], action: 'Add or extend tests, each tagged with its acceptance criterion id, covering every acceptance criterion of the issue.' });
  }
  const testStep = testFile && scope.includes(testFile) ? 1 : steps.length;

  const plan = [
    `# Plan: ${stripPrefix(issue.title || 'Audit finding remediation')}`,
    '',
    '## File Scope & Boundaries',
    `- **In Scope:** ${list(inScope)}`,
    `- **Out of Scope:** ${references.length ? list(references) : '_None._'}`,
    '- **Irreversible Changes:** _None._',
    '',
    '## Prerequisites & Context',
    `- Reference: \`specs/issue-${issueNumber}/think.md\`.`,
    '- None.',
    '',
    '## Acceptance Criteria',
    ...acs.map((a) => `- **AC-${a.id}:** Given the change for issue #${issueNumber} is applied, then ${a.text}.`),
    '',
    '## Implementation Checklist',
    '',
    ...steps.flatMap((s, i) => [
      `### Step ${i + 1}: ${s.name}`,
      `- **Files:** ${list(s.files)}`,
      `- **Action:** ${s.action}`,
      `- **Verification:** ${verify}`,
      `- **Bootable Check:** ${boot}`,
      `- **Serves:** ${all}`,
      '',
    ]),
    '## Test Plan',
    '| Criterion | Test | Step |',
    '|---|---|---|',
    ...acs.map((a) => `| AC-${a.id} | ${docsSync ? 'Documentation review' : testFile}: ${a.text.replace(/\|/g, '/').slice(0, 120)} | Step ${testStep} |`),
    '',
    '## Open Questions & Assumptions',
    '_None._',
    '',
    '## Blast Radius Check',
    `- **Tier from Think:** ${tier}`,
    '- **Still Holds:** Yes',
    '- **Reason:** _None._',
    '',
    '## Done When',
    '- Every step is marked complete and its verification passes with exit code 0.',
    '- The build and the full test suite pass.',
    '- No files outside the In Scope list were modified.',
    '',
    '## Approval',
    `- **Approved By:** Automated by coding-pal-audit on ${today}`,
    '',
  ].join('\n');

  return { eligible: true, reason: `${audit} / effort low`, plan };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : '';
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const out = arg('out');
  const result = synthesizePlan({
    issue: JSON.parse(readFileSync(arg('issue'), 'utf8')),
    issueNumber: arg('issue-number'),
    effort: arg('effort'),
    think: existsSync(arg('think')) ? readFileSync(arg('think'), 'utf8') : '',
    root: path.resolve(arg('root') || process.cwd()),
    today: new Date().toISOString().slice(0, 10),
  });
  if (result.eligible && out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, result.plan);
  }
  console.log(JSON.stringify({ eligible: result.eligible, reason: result.reason }));
}
