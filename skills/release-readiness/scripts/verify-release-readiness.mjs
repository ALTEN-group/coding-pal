#!/usr/bin/env node
/**
 * Deterministic Release-Readiness Control for @1pizzateam/* libraries.
 *
 * Verifies 3 pillars before a library PR is proven or a new release is tagged/published:
 *   1. package.json, lockfiles & npm pack tarball contents (root + website version sync, semver bump, dist artifacts, exact tarball files)
 *   2. CHANGELOG.md (top Version X.Y.Z (Month Dayth Year) or Version X.Y.Z (unreleased) section, underline, bullet points, no placeholders/duplicates, released sections never edited)
 *   3. Documentation (README.md + website/docs/** coverage of all public runtime exports, VitePress sidebar links, and optional website build)
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const MONTHS = new Set([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

function parseArgs(argv) {
  const opts = {
    dir: process.cwd(),
    mode: 'release', // 'release' | 'pr'
    expectedVersion: '',
    previousVersion: '',
    requireDist: false,
    buildDocs: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) opts.dir = path.resolve(argv[++i]);
    else if (arg === '--mode' && argv[i + 1]) opts.mode = argv[++i];
    else if (arg === '--expected-version' && argv[i + 1]) opts.expectedVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--previous-version' && argv[i + 1]) opts.previousVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--require-dist') opts.requireDist = true;
    else if (arg === '--build-docs') opts.buildDocs = true;
  }
  return opts;
}

function compareSemver(a, b) {
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
  if (!preA) return 1; // normal release > prerelease of same X.Y.Z
  if (!preB) return -1;
  return preA.localeCompare(preB, undefined, { numeric: true });
}

/** Text of the `Version <version> (...)` section (header through the line before the next header), or null. */
function extractChangelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^Version\\s+${version.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')}\\s+\\(`).test(l));
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^Version\s+/.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start, end).join('\n').trimEnd();
}

function gitTagExists(rootDir, tag) {
  try {
    return execSync(`git tag --list ${tag}`, { cwd: rootDir, stdio: 'pipe' }).toString().trim() === tag;
  } catch {
    return false;
  }
}

function gitShowAtTag(rootDir, tag, file) {
  try {
    return execSync(`git show ${tag}:${file}`, { cwd: rootDir, stdio: 'pipe' }).toString();
  } catch {
    return null;
  }
}

function collectMarkdownText(dirPath) {
  let out = '';
  if (!existsSync(dirPath)) return out;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vitepress' || entry.name === '.git') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out += '\n' + collectMarkdownText(full);
    else if (entry.name.endsWith('.md')) out += '\n' + readFileSync(full, 'utf8');
  }
  return out;
}

function isRuntimeSymbol(filePath, origName) {
  if (!existsSync(filePath)) return true;
  const content = readFileSync(filePath, 'utf8');
  if (new RegExp(`export\\s+(?:interface|type)\\s+${origName}\\b`).test(content)) return false;
  if (new RegExp(`export\\s+(?:abstract\\s+)?(?:class|function|const|let|var|enum)\\s+${origName}\\b`).test(content)) return true;
  return true;
}

function findEntryFile(rootDir, pkg) {
  const baseName = (pkg.name || '').split('/').pop() || 'index';
  const candidates = [
    path.join(rootDir, 'src', `${baseName}.ts`),
    path.join(rootDir, 'src', 'index.ts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const srcDir = path.join(rootDir, 'src');
  if (existsSync(srcDir)) {
    const tsFiles = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    if (tsFiles.length === 1) return path.join(srcDir, tsFiles[0]);
  }
  return null;
}

function extractPublicRuntimeExports(entryFile) {
  const src = readFileSync(entryFile, 'utf8');
  const symbols = [];
  const entryDir = path.dirname(entryFile);

  for (const m of src.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
    let target = path.resolve(entryDir, m[1]);
    if (!target.endsWith('.ts')) target = target.replace(/\.js$/, '') + '.ts';
    if (existsSync(target)) {
      const subSrc = readFileSync(target, 'utf8');
      for (const sm of subSrc.matchAll(/export\s+(?:abstract\s+)?(?:class|function|const|let|var|enum)\s+([A-Za-z0-9_]+)/g)) {
        symbols.push({ sym: sm[1], from: m[1] });
      }
    }
  }

  for (const m of src.matchAll(/export\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const fromMod = m[2];
    let target = path.resolve(entryDir, fromMod);
    if (!target.endsWith('.ts')) target = target.replace(/\.js$/, '') + '.ts';
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p || p.startsWith('type ')) continue;
      const asMatch = p.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/);
      const orig = asMatch ? asMatch[1] : p;
      const sym = asMatch ? asMatch[2] : p;
      if (isRuntimeSymbol(target, orig)) {
        symbols.push({ sym, from: fromMod });
      }
    }
  }

  for (const sm of src.matchAll(/export\s+(?:abstract\s+)?(?:class|function|const|let|var|enum)\s+([A-Za-z0-9_]+)/g)) {
    symbols.push({ sym: sm[1], from: path.basename(entryFile) });
  }

  return symbols;
}

const opts = parseArgs(process.argv);
const rootDir = opts.dir;
const errors = [];

// ============================================================================
// 1. package.json, Lockfiles, Website Version & npm Tarball Controls
// ============================================================================
const pkgPath = path.join(rootDir, 'package.json');
let pkg = null;
if (!existsSync(pkgPath)) {
  errors.push('[package.json] Missing root package.json.');
} else {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.name || !pkg.name.startsWith('@1pizzateam/')) {
    errors.push(`[package.json] Expected "name" to start with "@1pizzateam/", got "${pkg.name}".`);
  }
  if (!pkg.version || !SEMVER_RE.test(pkg.version)) {
    errors.push(`[package.json] Invalid SemVer "version": "${pkg.version}".`);
  }
  if (opts.expectedVersion && pkg.version !== opts.expectedVersion) {
    errors.push(`[package.json] Expected version "${opts.expectedVersion}", found "${pkg.version}".`);
  }
  if (opts.previousVersion && compareSemver(pkg.version, opts.previousVersion) <= 0) {
    errors.push(`[package.json] Version "${pkg.version}" was not incremented above previous version "${opts.previousVersion}".`);
  }
  if (!pkg.main || !pkg.types) {
    errors.push('[package.json] Both "main" and "types" fields must be defined.');
  }
  const cleanMain = (pkg.main || '').replace(/^\.\//, '');
  const cleanTypes = (pkg.types || '').replace(/^\.\//, '');
  const dotExport = pkg.exports?.['.'];
  if (!dotExport || dotExport.import !== `./${cleanMain}` || dotExport.types !== `./${cleanTypes}`) {
    errors.push('[package.json] "exports[\'.\']" must define "import" and "types" matching "main" and "types".');
  }
  if (opts.requireDist && cleanMain && cleanTypes) {
    for (const rel of [cleanMain, cleanTypes]) {
      const full = path.join(rootDir, rel);
      if (!existsSync(full) || statSync(full).size === 0) {
        errors.push(`[package.json] Built artifact "${rel}" is missing or empty. Run "npm run build:lib" first.`);
      }
    }
    try {
      const packRaw = execSync('npm pack --dry-run --json', { cwd: rootDir, stdio: 'pipe' }).toString();
      const packJson = JSON.parse(packRaw);
      const packEntry = Array.isArray(packJson) ? packJson[0] : Object.values(packJson)[0];
      const actualFiles = (packEntry?.files || []).map((f) => f.path);
      const expectedFiles = ['LICENSE', 'README.md', cleanTypes, cleanMain, 'package.json'];
      const missingFiles = expectedFiles.filter((f) => !actualFiles.includes(f));
      const extraFiles = actualFiles.filter((f) => !expectedFiles.includes(f));
      if (missingFiles.length > 0 || extraFiles.length > 0) {
        errors.push(
          `[npm pack] Package tarball mismatch — missing: [${missingFiles.join(', ')}], unexpected: [${extraFiles.join(', ')}].`,
        );
      }
    } catch (err) {
      const stderr = err?.stderr ? err.stderr.toString() : err?.message || String(err);
      errors.push(`[npm pack] Failed to inspect package tarball:\n${stderr}`);
    }
  }

  const lockPath = path.join(rootDir, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.version !== pkg.version) {
      errors.push(`[package-lock.json] Top-level version "${lock.version}" does not match package.json version "${pkg.version}".`);
    }
    if (lock.packages?.['']?.version && lock.packages[''].version !== pkg.version) {
      errors.push(`[package-lock.json] packages[""].version "${lock.packages[''].version}" does not match package.json version "${pkg.version}".`);
    }
  }

  const webPkgPath = path.join(rootDir, 'website', 'package.json');
  if (existsSync(webPkgPath)) {
    const webPkg = JSON.parse(readFileSync(webPkgPath, 'utf8'));
    if (webPkg.version !== pkg.version) {
      errors.push(`[website/package.json] Version "${webPkg.version}" does not match root package.json version "${pkg.version}".`);
    }
    const webLockPath = path.join(rootDir, 'website', 'package-lock.json');
    if (existsSync(webLockPath)) {
      const webLock = JSON.parse(readFileSync(webLockPath, 'utf8'));
      if (webLock.version !== pkg.version) {
        errors.push(`[website/package-lock.json] Top-level version "${webLock.version}" does not match root package.json version "${pkg.version}".`);
      }
      if (webLock.packages?.['']?.version && webLock.packages[''].version !== pkg.version) {
        errors.push(`[website/package-lock.json] packages[""].version "${webLock.packages[''].version}" does not match root package.json version "${pkg.version}".`);
      }
    }
  }
}

// ============================================================================
// 2. CHANGELOG.md Controls
// ============================================================================
const changelogPath = path.join(rootDir, 'CHANGELOG.md');
if (!existsSync(changelogPath)) {
  errors.push('[CHANGELOG.md] Missing CHANGELOG.md.');
} else if (pkg) {
  const rawChangelog = readFileSync(changelogPath, 'utf8');
  const lines = rawChangelog.split(/\r?\n/);
  const firstLine = (lines[0] || '').trim();
  const secondLine = (lines[1] || '').trim();

  const datedMatch = firstLine.match(/^Version\s+([0-9A-Za-z.-]+)\s+\(([A-Z][a-z]+)\s+(\d{1,2})(st|nd|rd|th)\s+(\d{4})\)$/);
  const unreleasedMatch = firstLine.match(/^Version\s+([0-9A-Za-z.-]+)\s+\(unreleased\)$/i);
  if (unreleasedMatch) {
    const unreleasedVersion = unreleasedMatch[1];
    if (opts.mode === 'release') {
      errors.push(`[CHANGELOG.md] Top section "${firstLine}" is still unreleased; rename it to "Version ${unreleasedVersion} (Month Day<st|nd|rd|th> Year)" when releasing.`);
    } else if (!SEMVER_RE.test(unreleasedVersion) || compareSemver(unreleasedVersion, pkg.version) <= 0 || gitTagExists(rootDir, `v${unreleasedVersion}`)) {
      errors.push(`[CHANGELOG.md] Unreleased section "${firstLine}" must be a version above the released package.json version "${pkg.version}" and must not match an existing tag.`);
    }
  } else if (!datedMatch) {
    errors.push(`[CHANGELOG.md] Line 1 must match "Version X.Y.Z (Month Day<st|nd|rd|th> Year)" or "Version X.Y.Z (unreleased)", got: "${firstLine}".`);
  } else {
    const [, changelogVersion, monthName] = datedMatch;
    if (!MONTHS.has(monthName)) {
      errors.push(`[CHANGELOG.md] Unrecognized month "${monthName}" in header "${firstLine}".`);
    }
    if (opts.mode === 'release' && changelogVersion !== pkg.version) {
      errors.push(`[CHANGELOG.md] Top section is for Version "${changelogVersion}", but package.json version is "${pkg.version}".`);
    }
  }

  // A released section is immutable: new entries belong under "Version X.Y.Z (unreleased)".
  if (opts.mode === 'pr' && pkg?.version) {
    const tag = `v${pkg.version}`;
    const releasedChangelog = gitShowAtTag(rootDir, tag, 'CHANGELOG.md');
    if (releasedChangelog !== null) {
      const before = extractChangelogSection(releasedChangelog, pkg.version);
      const after = extractChangelogSection(rawChangelog, pkg.version);
      if (before !== null && before !== after) {
        errors.push(`[CHANGELOG.md] The released section for Version ${pkg.version} (tag ${tag}) was modified. Add new entries under a "Version X.Y.Z (unreleased)" section above it instead.`);
      }
    }
  }

  if (!/^-{5,}$/.test(secondLine)) {
    errors.push(`[CHANGELOG.md] Line 2 must be a dashed underline ("-----------------------------"), got: "${secondLine}".`);
  }

  let nextHeaderIdx = lines.findIndex((l, idx) => idx > 1 && /^Version\s+/.test(l));
  if (nextHeaderIdx === -1) nextHeaderIdx = lines.length;
  const topSectionLines = lines.slice(2, nextHeaderIdx);
  const bullets = topSectionLines.filter((l) => /^\s*\*\s+\S+/.test(l));
  if (bullets.length === 0) {
    errors.push(`[CHANGELOG.md] Top version section (${firstLine}) contains no " * " bullet entries.`);
  }
  const topSectionText = topSectionLines.join('\n');
  if (/\b(TODO|TBD|FIXME)\b/i.test(topSectionText)) {
    errors.push('[CHANGELOG.md] Top version section contains placeholder text (TODO/TBD/FIXME).');
  }

  const seenVersions = new Set();
  for (const line of lines) {
    const m = line.match(/^Version\s+([0-9A-Za-z.-]+)\s+\(/);
    if (m) {
      if (seenVersions.has(m[1])) {
        errors.push(`[CHANGELOG.md] Duplicate section found for Version ${m[1]}.`);
      }
      seenVersions.add(m[1]);
    }
  }
}

// ============================================================================
// 3. Documentation (website/docs/** & README.md) Controls
// ============================================================================
const readmePath = path.join(rootDir, 'README.md');
if (!existsSync(readmePath)) {
  errors.push('[README.md] Missing README.md.');
} else if (pkg) {
  const readme = readFileSync(readmePath, 'utf8');
  if (!readme.includes(pkg.name)) {
    errors.push(`[README.md] Must mention the package name "${pkg.name}".`);
  }
  if (readme.includes('Jest:coverage') && !/!\[Jest:coverage\]\(https:\/\/img\.shields\.io\/badge\/Jest:coverage-\d+(?:\.\d+)?%25-[a-z]+\.svg\)/.test(readme)) {
    errors.push('[README.md] Malformed Jest coverage badge URL.');
  }

  const websiteDocsDir = path.join(rootDir, 'website', 'docs');
  const hasWebsiteDocs = existsSync(websiteDocsDir);
  const docsCorpus = (hasWebsiteDocs ? collectMarkdownText(websiteDocsDir) : '') + '\n' + readme;

  const entryFile = findEntryFile(rootDir, pkg);
  if (!entryFile) {
    errors.push('[Docs] Could not locate root TypeScript entrypoint in src/.');
  } else {
    const runtimeExports = extractPublicRuntimeExports(entryFile);
    const undocumented = runtimeExports.filter((e) => !new RegExp(`\\b${e.sym}\\b`).test(docsCorpus));
    if (undocumented.length > 0) {
      const targetDocLabel = hasWebsiteDocs ? 'website/docs/**' : 'README.md';
      errors.push(
        `[Docs] Undocumented public runtime exports in ${targetDocLabel}: ${undocumented
          .map((u) => `${u.sym} (from ${u.from})`)
          .join(', ')}.`,
      );
    }
  }

  const vitepressConfigPath = path.join(websiteDocsDir, '.vitepress', 'config.mjs');
  if (existsSync(vitepressConfigPath)) {
    const cfg = readFileSync(vitepressConfigPath, 'utf8');
    const links = [...cfg.matchAll(/link\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const link of links) {
      if (/^https?:\/\//.test(link)) continue;
      const clean = link.split('#')[0].replace(/\/$/, '/index');
      const mdPath = path.join(websiteDocsDir, clean.endsWith('.md') ? clean : `${clean}.md`);
      if (!existsSync(mdPath)) {
        errors.push(`[website/docs] Broken VitePress link "${link}" in .vitepress/config.mjs (missing ${path.relative(rootDir, mdPath)}).`);
      }
    }
    for (const sub of ['api', 'guide']) {
      const subDir = path.join(websiteDocsDir, sub);
      if (!existsSync(subDir)) continue;
      for (const file of readdirSync(subDir)) {
        if (!file.endsWith('.md') || file === 'index.md') continue;
        const slug = `/${sub}/${file.replace(/\.md$/, '')}`;
        if (!cfg.includes(slug)) {
          errors.push(`[website/docs] Documentation page "website/docs${slug}.md" is not registered in .vitepress/config.mjs sidebar.`);
        }
      }
    }
  }

  if (opts.buildDocs && existsSync(path.join(rootDir, 'website', 'package.json'))) {
    const webPkg = JSON.parse(readFileSync(path.join(rootDir, 'website', 'package.json'), 'utf8'));
    if (webPkg.scripts?.build) {
      try {
        if (!existsSync(path.join(rootDir, 'website', 'node_modules'))) {
          execSync('npm --prefix website ci', { cwd: rootDir, stdio: 'pipe' });
        }
        execSync('npm --prefix website run build', { cwd: rootDir, stdio: 'pipe' });
      } catch (err) {
        const stderr = err?.stderr ? err.stderr.toString() : err?.message || String(err);
        errors.push(`[website/docs] VitePress documentation build failed:\n${stderr}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('✗ Release readiness verification FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  `✓ Release readiness verified for ${pkg.name}@${pkg.version} (mode=${opts.mode}): package.json, tarball, CHANGELOG.md, and documentation are in sync.`,
);
