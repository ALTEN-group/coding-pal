#!/usr/bin/env node
/**
 * Does a merged PR touch anything that can ship in the service (code, migrations, API spec,
 * env templates, Docker build, dependencies)?
 *
 * Test-suite, docs, CI and housekeeping PRs must never trigger a release on their own: the
 * main branch may carry earlier unreleased changes that would otherwise be blamed on (and
 * named in) the release of whichever PR merges next.
 *
 * Reads changed file paths (one per line) on stdin, prints `true` or `false`.
 */

/** Never ships, whatever else the path looks like. Checked first. */
const NON_SHIPPING = [
  // tests, at any depth
  /(^|\/)(tests?|__tests__|__mocks__|e2e)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  // top-level folders that are docs, CI, agent/IDE context, specs, tooling
  /^(doc|docs|website|specs?|reports|scripts|\.github|\.agents|\.claude|\.cursor|\.vscode)\//i,
  /(^|\/)scripts\//i,
  // docs and repository housekeeping files
  /\.(md|mdx|txt)$/i,
  /^(license|licence|contributor|pr)(\.[a-z]+)?$/i,
  /(^|\/)\.(gitignore|dockerignore|editorconfig|eslintrc[^/]*|prettierrc[^/]*|nvmrc)$/i,
  // dev tooling configuration
  /(^|\/)(jest|vitest|playwright|karma|cypress|eslint|prettier)\.config\.[cm]?[jt]s$/i,
  /(^|\/)(karma|jest)\.conf(ig)?\.[cm]?[jt]s$/i,
  /(^|\/)gate-output\.log$/i,
  // local stack and API fuzzing, not the image
  /^docker\/[^/]*compose[^/]*$/i,
  /(^|\/)docker-compose[^/]*\.ya?ml$/i,
  /^docker\/restler\//i,
];

/** Ships (checked after the exclusions above). */
const SHIPPING = [
  /^src\//i,
  /^db\//i,
  /^swagger\/src\//i,
  /^docker\/conf\/[^/]+\.example$/i,
  /(^|\/)dockerfile[^/]*$/i,
  /(^|\/)[^/]+\.dockerfile$/i,
  /^(admin|web)\//i,
  /^package(-lock)?\.json$/i,
  /^tsconfig[^/]*\.json$/i,
];

const normalize = (file) => file.trim().replace(/^\.\//, '');

export const isShippedPath = (file) => {
  const f = normalize(file);
  if (!f) return false;
  if (NON_SHIPPING.some((re) => re.test(f))) return false;
  return SHIPPING.some((re) => re.test(f));
};

export const prShipsCode = (files) => files.map(normalize).filter(Boolean).some(isShippedPath);

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => console.log(String(prShipsCode(input.split('\n')))));
}
