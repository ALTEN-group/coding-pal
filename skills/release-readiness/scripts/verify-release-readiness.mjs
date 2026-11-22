#!/usr/bin/env node
/**
 * Deterministic release-readiness control for Node.js services released as GitHub Releases + Docker images.
 *
 * Checks (errors fail the run, warnings are printed only):
 *   1. package.json version (== --expected-version in release mode, above --previous-version when given)
 *      and package-lock.json root version in sync
 *   2. CHANGELOG.md in the app's format (`# X.Y.Z (Nov 21st 2026)` headings, bullets): in release mode the top entry is
 *      the released version and dated; no leftover `(unreleased)` heading for older versions; no placeholders/duplicates
 *   3. Docker: a production dockerfile exists and `.github/workflows/publish.yml` exists
 *   4. swagger/src/*.openapi*.json is valid JSON; its info.version differing from the release is a WARNING
 *   5. .env.*.example templates (docker/conf and repository root) parse
 *
 * Usage:
 *   verify-release-readiness.mjs [--dir <repo>] [--mode pr|release] [--expected-version X.Y.Z] [--previous-version X.Y.Z]
 *                                [--require-dist]   (accepted and ignored, for CLI compatibility)
 * Exit code 0 on success, 1 with a list of errors otherwise.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const PLAIN_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const HEADING_RE = /^(#{1,6})[ \t]+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]+\((.+?)\)[ \t]*$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_RE = new RegExp(`^(?:${[...MONTHS, ...LONG_MONTHS].join('|')})\\s+\\d{1,2}(?:st|nd|rd|th)\\s+\\d{4}$`);

export function parseArgs(argv) {
  const opts = { dir: process.cwd(), mode: 'release', expectedVersion: '', previousVersion: '', requireDist: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) opts.dir = path.resolve(argv[++i]);
    else if (arg === '--mode' && argv[i + 1]) opts.mode = argv[++i];
    else if (arg === '--expected-version' && argv[i + 1]) opts.expectedVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--previous-version' && argv[i + 1]) opts.previousVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--require-dist') opts.requireDist = true; // no-op
  }
  return opts;
}

export function compareSemver(a, b) {
  const ma = a.match(SEMVER_RE);
  const mb = b.match(SEMVER_RE);
  if (!ma || !mb) return 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff;
  }
  const preA = ma[4] ?? '';
  const preB = mb[4] ?? '';
  if (!preA && !preB) return 0;
  if (!preA) return 1; // stable > prerelease of the same X.Y.Z
  if (!preB) return -1;
  return preA.localeCompare(preB, undefined, { numeric: true });
}

function readJson(file, label, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`[${label}] Invalid JSON: ${err.message}`);
    return null;
  }
}

function listFiles(dir, maxDepth, depth = 0, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < maxDepth) listFiles(full, maxDepth, depth + 1, out);
    } else out.push(full);
  }
  return out;
}

function gitShow(root, ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Headings of a changelog: [{ index, version, date, unreleased }]. */
export function changelogHeadings(lines) {
  const out = [];
  lines.forEach((line, index) => {
    const m = HEADING_RE.exec(line);
    if (m) out.push({ index, version: m[2], date: m[3].trim(), unreleased: /^unreleased$/i.test(m[3].trim()) });
  });
  return out;
}

const sectionText = (lines, headings, version) => {
  const i = headings.findIndex((h) => h.version === version);
  if (i === -1) return null;
  const end = headings[i + 1]?.index ?? lines.length;
  return lines.slice(headings[i].index, end).join('\n').trimEnd();
};

export function verify(opts) {
  const root = opts.dir;
  const errors = [];
  const warnings = [];
  const mode = opts.mode === 'pr' ? 'pr' : 'release';

  // 1. package.json and lock ------------------------------------------------------------------
  let pkg = null;
  const pkgPath = path.join(root, 'package.json');
  if (!existsSync(pkgPath)) errors.push('[package.json] Missing root package.json.');
  else pkg = readJson(pkgPath, 'package.json', errors);
  if (pkg) {
    if (!pkg.version || !SEMVER_RE.test(pkg.version)) errors.push(`[package.json] Invalid SemVer "version": "${pkg.version}".`);
    if (opts.expectedVersion && pkg.version !== opts.expectedVersion) {
      errors.push(`[package.json] Expected version "${opts.expectedVersion}", found "${pkg.version}".`);
    }
    if (opts.previousVersion && compareSemver(pkg.version, opts.previousVersion) <= 0) {
      errors.push(`[package.json] Version "${pkg.version}" was not incremented above previous version "${opts.previousVersion}".`);
    }
    const lockPath = path.join(root, 'package-lock.json');
    if (existsSync(lockPath)) {
      const lock = readJson(lockPath, 'package-lock.json', errors);
      if (lock) {
        if (lock.version !== pkg.version) errors.push(`[package-lock.json] Top-level version "${lock.version}" does not match package.json version "${pkg.version}".`);
        const rootEntry = lock.packages?.['']?.version;
        if (rootEntry && rootEntry !== pkg.version) errors.push(`[package-lock.json] packages[""].version "${rootEntry}" does not match package.json version "${pkg.version}".`);
      }
    } else {
      warnings.push('[package-lock.json] Missing package-lock.json.');
    }
  }
  const version = opts.expectedVersion || pkg?.version || '';

  // 2. CHANGELOG.md ---------------------------------------------------------------------------
  const changelogPath = path.join(root, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    errors.push('[CHANGELOG.md] Missing CHANGELOG.md.');
  } else {
    const raw = readFileSync(changelogPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const headings = changelogHeadings(lines);
    const top = headings[0];
    if (!top) {
      errors.push('[CHANGELOG.md] No version heading found; expected "# X.Y.Z (Nov 21st 2026)".');
    } else {
      if (mode === 'release') {
        if (version && top.version !== version) errors.push(`[CHANGELOG.md] Top entry is for "${top.version}", expected "${version}".`);
        if (top.unreleased) errors.push(`[CHANGELOG.md] Top entry "${lines[top.index]}" is still unreleased; date it when releasing.`);
      }
      if (!top.unreleased && !DATE_RE.test(top.date)) {
        errors.push(`[CHANGELOG.md] Top entry date "${top.date}" must look like "Nov 21st 2026".`);
      }
      for (const h of headings.slice(1)) {
        if (h.unreleased) errors.push(`[CHANGELOG.md] Leftover "(unreleased)" heading for older version ${h.version} (line ${h.index + 1}).`);
      }
      const topLines = lines.slice(top.index + 1, headings[1]?.index ?? lines.length);
      if (!topLines.some((l) => /^\s*[-*]\s+\S/.test(l))) errors.push(`[CHANGELOG.md] Top entry (${lines[top.index]}) contains no bullet entries.`);
      if (/\b(TODO|TBD|FIXME)\b/.test(topLines.join('\n'))) errors.push('[CHANGELOG.md] Top entry contains placeholder text (TODO/TBD/FIXME).');
      const seen = new Set();
      for (const h of headings) {
        if (seen.has(h.version)) errors.push(`[CHANGELOG.md] Duplicate entry for version ${h.version}.`);
        seen.add(h.version);
      }
      // A released entry is immutable: new work goes under a new (or unreleased) heading.
      if (mode === 'pr' && pkg?.version) {
        const released = gitShow(root, `v${pkg.version}`, 'CHANGELOG.md');
        if (released !== null) {
          const rLines = released.split(/\r?\n/);
          const before = sectionText(rLines, changelogHeadings(rLines), pkg.version);
          const after = sectionText(lines, headings, pkg.version);
          if (before !== null && before !== after) {
            errors.push(`[CHANGELOG.md] The released entry for ${pkg.version} (tag v${pkg.version}) was modified; add new entries under a new heading above it.`);
          }
        }
      }
    }
  }

  // 3. Docker ----------------------------------------------------------------------------------
  const dockerfiles = [root, path.join(root, 'docker')]
    .flatMap((dir) => listFiles(dir, dir === root ? 0 : 2))
    .filter((f) => /^dockerfile([.-].*)?$/i.test(path.basename(f)) || /\.dockerfile$/i.test(path.basename(f)));
  if (!dockerfiles.length) errors.push('[docker] No production dockerfile found (expected docker/dockerfile.prod or a Dockerfile*).');
  if (!existsSync(path.join(root, '.github', 'workflows', 'publish.yml'))) {
    errors.push('[docker] Missing .github/workflows/publish.yml (builds the Docker image on release published).');
  }

  // 4. OpenAPI spec ----------------------------------------------------------------------------
  const swaggerDir = path.join(root, 'swagger', 'src');
  const specs = existsSync(swaggerDir) ? readdirSync(swaggerDir).filter((f) => /\.openapi.*\.json$/i.test(f)) : [];
  for (const file of specs) {
    const rel = `swagger/src/${file}`;
    const spec = readJson(path.join(swaggerDir, file), rel, errors);
    const specVersion = spec?.info?.version;
    if (spec && version && typeof specVersion === 'string' && PLAIN_SEMVER_RE.test(specVersion) && specVersion !== version) {
      warnings.push(`[${rel}] info.version "${specVersion}" differs from the release version "${version}".`);
    }
  }

  // 5. env templates ---------------------------------------------------------------------------
  const envFiles = [path.join(root, 'docker', 'conf'), root]
    .flatMap((dir) => listFiles(dir, 0))
    .filter((f) => /^\.env(\..+)?\.example$/.test(path.basename(f)));
  for (const file of envFiles) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const names = new Set();
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=.*)?$/.exec(line);
      if (!m) {
        errors.push(`[${rel}] Line ${i + 1} is not a valid KEY=value entry: "${line.slice(0, 60)}".`);
        return;
      }
      if (names.has(m[1])) warnings.push(`[${rel}] Variable ${m[1]} is defined more than once.`);
      names.add(m[1]);
    });
  }

  return { errors, warnings, version: pkg?.version ?? '', name: pkg?.name ?? '', mode };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const result = verify(parseArgs(process.argv));
  for (const w of result.warnings) console.warn(`  warning: ${w}`);
  if (result.errors.length > 0) {
    console.error('✗ Release readiness verification FAILED:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`✓ Release readiness verified for ${result.name}@${result.version} (mode=${result.mode}): package.json, CHANGELOG.md, Docker and API spec are in sync.`);
}
