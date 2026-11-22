#!/usr/bin/env node
/**
 * Prepare a release: bump the version in package manifests and write the CHANGELOG.md section.
 * Replaces the inline `node -e` blocks of the release workflow. Idempotent: running it twice changes nothing.
 *
 * Usage:
 *   prepare-release.mjs --version <X.Y.Z[-pre.N]> --date <YYYY-MM-DD | "Nov 21st 2026">
 *                       [--title <t>]... [--specs-dir specs/issue-N] [--changelog CHANGELOG.md] [--root .]
 *
 * 1. package.json + package-lock.json (`version`, `packages[""].version`) at the root, and the same for
 *    admin/ and web/ ONLY when they exist and their version currently equals the root's old version.
 *    Indentation and trailing newline are preserved.
 * 2. CHANGELOG.md, in the format the app already uses (see below).
 * 3. Prints a JSON array of the changed files (relative to --root) on stdout.
 *
 * CHANGELOG format (as in Foxnox / Gatelin / Megadex): one heading per release, a blank line, bullets, a blank line:
 *
 *     # 0.1.0 (Nov 21st 2026)
 *
 *       - Fixed something
 *
 * The heading level (`#` or `##`), the bullet prefix (`  - `) and the month style (`Nov` or `November`) are copied
 * from the existing file. A top `(unreleased)` section is dated and renamed (its bullets kept); a section for the
 * version that already exists is left alone; otherwise a section is generated, in this order of preference, from:
 * several --title values, git subjects in env CHANGE_SUBJECTS (one per line), `### Step N:` titles of
 * <specs-dir>/plan.md, the single --title, `Release vX.Y.Z`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SEMVER = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?';
const VERSION_RE = new RegExp(`^${SEMVER}$`);
const HEADING_RE = new RegExp(`^(#{1,6})[ \\t]+v?(${SEMVER})[ \\t]+\\((.+?)\\)[ \\t]*$`);
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseArgs(argv) {
  const opts = { version: '', date: '', titles: [], specsDir: '', changelog: 'CHANGELOG.md', root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--version' && value) opts.version = argv[++i].replace(/^v/, '');
    else if (arg === '--date' && value) opts.date = argv[++i];
    else if (arg === '--title' && value !== undefined) {
      const t = argv[++i].trim();
      if (t) opts.titles.push(t);
    } else if (arg === '--specs-dir' && value) opts.specsDir = argv[++i];
    else if (arg === '--changelog' && value) opts.changelog = argv[++i];
    else if (arg === '--root' && value) opts.root = path.resolve(argv[++i]);
  }
  return opts;
}

const ordinal = (day) => (day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th');

/** `2026-11-21` -> `Nov 21st 2026` (or `November 21st 2026` with `longMonth`); text dates are used as given. */
export function formatDate(input, { longMonth = false } = {}) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!iso) return input.trim();
  const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  return `${(longMonth ? LONG_MONTHS : SHORT_MONTHS)[month - 1]} ${day}${ordinal(day)} ${year}`;
}

// ---------------------------------------------------------------------------------------------
// package.json / package-lock.json
// ---------------------------------------------------------------------------------------------

/** Rewrite a JSON file's version fields, keeping indent and trailing newline. Returns true when the file changed. */
function setJsonVersion(file, version, { lock = false } = {}) {
  const text = readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  const before = JSON.stringify([json.version, json.packages?.['']?.version]);
  json.version = version;
  if (lock && json.packages?.['']) json.packages[''].version = version;
  if (JSON.stringify([json.version, json.packages?.['']?.version]) === before) return false;
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? '  ';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = JSON.stringify(json, null, indent);
  if (eol === '\r\n') out = out.replace(/\n/g, eol);
  writeFileSync(file, out + (/\r?\n$/.test(text) ? eol : ''));
  return true;
}

const readVersion = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).version;
  } catch {
    return undefined;
  }
};

function bumpManifests(root, version, changed) {
  const rootPkg = path.join(root, 'package.json');
  if (!existsSync(rootPkg)) throw new Error(`${rootPkg} not found`);
  const oldVersion = readVersion(rootPkg);
  const track = (file, opts) => {
    if (setJsonVersion(path.join(root, file), version, opts)) changed.push(file);
  };
  track('package.json');
  if (existsSync(path.join(root, 'package-lock.json'))) track('package-lock.json', { lock: true });
  for (const dir of ['admin', 'web']) {
    const pkg = path.join(root, dir, 'package.json');
    if (!existsSync(pkg) || readVersion(pkg) !== oldVersion) continue;
    track(`${dir}/package.json`);
    if (existsSync(path.join(root, dir, 'package-lock.json'))) track(`${dir}/package-lock.json`, { lock: true });
  }
}

// ---------------------------------------------------------------------------------------------
// CHANGELOG.md
// ---------------------------------------------------------------------------------------------

const stripType = (t) => t.replace(/^(?:feat|fix|chore|refactor|perf|docs|test)(?:\([^)]+\))?!?:\s*/i, '');

export function collectBullets({ version, titles = [], subjects = '', specsDir = '', root = '.' }) {
  const clean = (t) => stripType(t.replace(/(\s+\(#\d+\))+$/, '').trim());
  const fromSubjects = [...new Set(subjects.split('\n').map((t) => clean(t.trim())).filter(Boolean))];
  let bullets = [];
  if (titles.length > 1) bullets = [...new Set(titles.map(clean))];
  else if (fromSubjects.length > 1) bullets = fromSubjects.slice(0, 10);
  else {
    const planPath = specsDir ? path.join(root, specsDir, 'plan.md') : '';
    if (planPath && existsSync(planPath)) {
      const steps = [...readFileSync(planPath, 'utf8').matchAll(/^### Step \d+:\s*(.+)$/gm)].map((m) => m[1].trim());
      bullets = steps.slice(0, 5);
    }
  }
  if (!bullets.length && titles.length === 1) bullets = [clean(titles[0])];
  if (!bullets.length && fromSubjects.length === 1) bullets = fromSubjects;
  if (!bullets.length) bullets = [`Release v${version}`];
  return bullets;
}

/** Returns { text, status: 'unchanged' | 'dated' | 'inserted', previousUnreleased? }. */
export function updateChangelog(text, { version, date, bullets }) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const headings = [];
  lines.forEach((line, index) => {
    const m = HEADING_RE.exec(line);
    if (m) headings.push({ index, hashes: m[1], version: m[2], date: m[3], unreleased: /^unreleased$/i.test(m[3].trim()) });
  });
  const first = headings[0];
  const hashes = first?.hashes ?? '#';
  const longMonth = headings.some((h) => LONG_MONTHS.some((m) => h.date.startsWith(`${m} `)));
  const stamp = formatDate(date, { longMonth });
  const heading = `${hashes} ${version} (${stamp})`;

  if (headings.some((h) => h.version === version && !h.unreleased)) return { text, status: 'unchanged' };

  if (first?.unreleased) {
    lines[first.index] = heading;
    return { text: lines.join(eol), status: 'dated', previousUnreleased: first.version };
  }

  const bulletPrefix = /^([ \t]*[-*][ \t]+)\S/m.exec(text)?.[1] ?? '  - ';
  const section = [heading, '', ...bullets.map((b) => `${bulletPrefix}${b}`), ''];
  if (first) {
    lines.splice(first.index, 0, ...section);
    return { text: lines.join(eol), status: 'inserted' };
  }
  const body = lines.join('\n').trimEnd();
  const out = `${body ? `${body}\n\n` : ''}${section.join('\n')}`.replace(/\n/g, eol);
  return { text: out, status: 'inserted' };
}

// ---------------------------------------------------------------------------------------------

export function prepareRelease(opts) {
  const { root, version, date, titles = [], specsDir = '', changelog = 'CHANGELOG.md', subjects = process.env.CHANGE_SUBJECTS || '' } = opts;
  if (!VERSION_RE.test(version || '')) throw new Error(`--version must be X.Y.Z[-pre], got "${version}"`);
  if (!date) throw new Error('--date is required');
  const changed = [];
  const warnings = [];
  bumpManifests(root, version, changed);

  const file = path.join(root, changelog);
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const bullets = collectBullets({ version, titles, subjects, specsDir, root });
  const result = updateChangelog(existing, { version, date, bullets });
  if (result.previousUnreleased && result.previousUnreleased !== version) {
    warnings.push(`Unreleased changelog section was ${result.previousUnreleased}, releasing as ${version}`);
  }
  if (result.text !== existing) {
    writeFileSync(file, result.text);
    changed.push(changelog);
  }
  return { changed, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const opts = parseArgs(process.argv);
  if (!opts.version || !opts.date) {
    console.error('Usage: prepare-release.mjs --version <X.Y.Z[-pre]> --date <ISO|"Nov 21st 2026"> [--title t]... [--specs-dir dir] [--changelog file] [--root dir]');
    process.exit(2);
  }
  try {
    const { changed, warnings } = prepareRelease(opts);
    for (const w of warnings) console.error(`warning: ${w}`);
    console.log(JSON.stringify(changed));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
