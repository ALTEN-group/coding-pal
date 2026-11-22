#!/usr/bin/env node
/**
 * Does a merged PR touch anything that can ship in the npm package?
 *
 * Test-suite, docs, CI and housekeeping PRs must never trigger a release on their own. The
 * tarball comparison alone cannot tell: master may carry earlier unreleased changes, and the
 * PR that happens to merge next would get blamed for (and named in) the release.
 *
 * Reads changed file paths (one per line) on stdin, prints `true` or `false`.
 */

const NON_SHIPPING = [
  /(^|\/)(tests?|__tests__|__mocks__|e2e|specs?|docs?|website|\.github|\.agents|\.claude|\.vscode|reports|scripts)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /\.(md|mdx|txt)$/i,
  /(^|\/)(license|licence|changelog|contributor|pr)(\.[a-z]+)?$/i,
  /(^|\/)(jest|vitest|playwright|eslint|prettier)\.config\.[cm]?[jt]s$/i,
  /(^|\/)\.(gitignore|dockerignore|eslintrc[^/]*|prettierrc[^/]*|editorconfig|npmrc)$/i,
  /(^|\/)(dockerfile|docker-compose\.ya?ml|apm\.lock\.ya?ml)$/i,
  /(^|\/)gate-output\.log$/i,
];

export const isShippedPath = (file) => !NON_SHIPPING.some((re) => re.test(file.trim()));

export const prShipsCode = (files) => files.map((f) => f.trim()).filter(Boolean).some(isShippedPath);

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => console.log(String(prShipsCode(input.split('\n')))));
}
