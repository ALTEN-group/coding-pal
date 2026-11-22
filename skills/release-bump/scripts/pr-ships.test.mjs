import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isShippedPath, prShipsCode } from './pr-ships.mjs';

test('tests, docs, CI, agent context, specs and tooling never ship', () => {
  for (const f of [
    'tests/auth.test.ts', 'tests/db/user.spec.ts', 'src/foo.test.ts', 'src/__tests__/a.ts', 'admin/src/app/a.spec.ts',
    'web/e2e/recover.spec.ts', 'admin/e2e/login.ts', 'README.md', 'CHANGELOG.md', 'doc/setup.md', 'docs/x.md',
    'website/docs/a.md', '.github/workflows/publish.yml', '.agents/skills/x/SKILL.md', '.claude/settings.json',
    '.cursor/rules/a.mdc', '.vscode/launch.json', 'specs/issue-1/plan.md', 'scripts/e2e-web.sh',
    'docker/docker-compose.yml', 'docker/compose.dev.yml', 'docker/restler/config.json', 'docker/conf/nginx.conf',
    'docker/conf/.env.dev', 'pr.md', 'LICENSE', '.gitignore', 'admin/playwright.config.ts', 'web/.eslintrc.json',
  ]) assert.equal(isShippedPath(f), false, f);
});

test('code, migrations, API spec, env templates, Docker build and dependencies ship', () => {
  for (const f of [
    'src/index.ts', 'src/routes/user.ts', 'db/liquibase/foxnox/changelog.xml', 'db/liquibase/foxnox/0001.sql',
    'swagger/src/foxnox.openapi.example.json', 'docker/conf/.env.dev.example', 'docker/conf/.env.prod.example',
    'docker/dockerfile.prod', 'dockerfile', 'Dockerfile', 'docker/Dockerfile.dev', 'admin/src/app/app.ts',
    'web/src/pages/recover.html', 'web/package.json', 'admin/package-lock.json', 'package.json', 'package-lock.json',
    './src/with-dot-prefix.ts', 'tsconfig.json',
  ]) assert.equal(isShippedPath(f), true, f);
});

test('a PR ships when any file ships', () => {
  assert.equal(prShipsCode(['tests/a.test.ts', 'pr.md', '.github/workflows/x.yml']), false);
  assert.equal(prShipsCode(['tests/a.test.ts', 'src/a.ts']), true);
  assert.equal(prShipsCode(['', '  ']), false);
  assert.equal(prShipsCode([]), false);
});

test('CLI reads paths on stdin and prints true or false', () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pr-ships.mjs');
  const run = (input) => spawnSync('node', [script], { input, encoding: 'utf8' }).stdout.trim();
  assert.equal(run('doc/a.md\ntests/a.test.ts\n'), 'false');
  assert.equal(run('doc/a.md\nsrc/a.ts\n'), 'true');
});
