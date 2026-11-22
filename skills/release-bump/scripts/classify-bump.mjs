#!/usr/bin/env node
/**
 * Evidence-based semver bump classifier for @1pizzateam/* libraries.
 *
 * Compares the npm tarball we are about to ship (--next) with the tarball that is
 * currently published (--prev) and decides the release type from what actually changes:
 *
 *   none   - no shipped runtime/type file changed (docs, CI, tests only): do not release
 *   patch  - shipped runtime changed, public .d.ts API unchanged
 *   minor  - public API additions or backwards-compatible changes
 *   major  - public API removal or incompatible change (requires explicit confirmation)
 *
 * The issue title / labels only raise the result (a floor); they never lower it.
 *
 * Usage:
 *   classify-bump.mjs --next <dir> [--prev <dir>] --current-version <X.Y.Z[-pre]>
 *                     [--title <issue title>] [--labels a,b,c] [--ts-from <dir>]
 *
 * <dir> is an extracted npm tarball root (the folder containing package.json).
 * Without --prev (package never published) the result is max(minor, floor).
 * Prints one JSON document on stdout.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LEVELS = ['none', 'patch', 'minor', 'major'];
const rank = (level) => LEVELS.indexOf(level);
const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);

export function parseArgs(argv) {
  const opts = { next: '', prev: '', currentVersion: '', title: '', titles: [], milestone: '', labels: [], tsFrom: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--next' && value) opts.next = path.resolve(argv[++i]);
    else if (arg === '--prev' && value) opts.prev = path.resolve(argv[++i]);
    else if (arg === '--current-version' && value) opts.currentVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--title' && value !== undefined) {
      opts.title = argv[++i];
      opts.titles.push(opts.title);
    } else if (arg === '--milestone' && value !== undefined) opts.milestone = argv[++i];
    else if (arg === '--labels' && value !== undefined) {
      opts.labels = argv[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (arg === '--ts-from' && value) opts.tsFrom = path.resolve(argv[++i]);
  }
  return opts;
}

/** Floor derived from the human-declared intent (title + labels). */
export function intentFloor(title, labels) {
  const t = (title || '').trim();
  const breakingMarker =
    labels.includes('breaking') ||
    labels.includes('release:major') ||
    /^\w+(\([^)]*\))?!:/.test(t) ||
    /\bBREAKING[ -]CHANGE\b/i.test(t);
  if (breakingMarker) return { level: 'major', confirmedMajor: true };
  if (labels.includes('release:minor') || /^feat(\(|:|\s|!)/i.test(t)) return { level: 'minor', confirmedMajor: false };
  if (labels.includes('release:patch') || /^fix(\(|:|\s)/i.test(t)) return { level: 'patch', confirmedMajor: false };
  return { level: 'none', confirmedMajor: false };
}

/**
 * A milestone named like a version (`5.0.0`, `v4.7.0`) declares the intended release level
 * relative to the version currently published, e.g. `5.0.0` over `4.6.0` is a confirmed major.
 */
export function milestoneFloor(milestone, currentVersion) {
  const target = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((milestone || '').trim());
  const current = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion || '');
  if (!target || !current) return { level: 'none', confirmedMajor: false };
  const [tMajor, tMinor, tPatch] = target.slice(1).map(Number);
  const [cMajor, cMinor, cPatch] = current.slice(1).map(Number);
  if (tMajor > cMajor) return { level: 'major', confirmedMajor: true };
  if (tMajor === cMajor && tMinor > cMinor) return { level: 'minor', confirmedMajor: false };
  if (tMajor === cMajor && tMinor === cMinor && tPatch > cPatch) return { level: 'patch', confirmedMajor: false };
  return { level: 'none', confirmedMajor: false };
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Files that make a release meaningful: everything shipped except metadata and docs. */
const isIgnoredForRelease = (rel) => rel === 'package.json' || /\.md$/i.test(rel) || /^licen[cs]e/i.test(rel);

function fingerprint(root, version) {
  const map = new Map();
  for (const rel of walk(root)) {
    if (isIgnoredForRelease(rel)) continue;
    let content = readFileSync(path.join(root, rel), 'utf8');
    // The version string may be embedded in built output; it must not count as a change.
    if (version) content = content.split(version).join('__VERSION__');
    map.set(rel, createHash('sha256').update(content).digest('hex'));
  }
  return map;
}

function typesEntry(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const exp = pkg.exports && (pkg.exports['.'] ?? pkg.exports);
  const rel = pkg.types || pkg.typings || (exp && typeof exp === 'object' ? exp.types : undefined);
  if (!rel) return '';
  const full = path.join(root, rel);
  return existsSync(full) ? full : '';
}

function loadTypeScript(tsFrom) {
  for (const base of [tsFrom, import.meta.dirname]) {
    try {
      return createRequire(pathToFileURL(path.join(base, 'noop.js')))('typescript');
    } catch {
      // try next location
    }
  }
  return null;
}

/**
 * Compare exported declarations of two .d.ts entry points inside ONE TypeScript program,
 * so consumer-side assignability can be checked across old and new types.
 */
/**
 * Private members (`private x`, `#x`) are not public API, but TypeScript compares classes
 * nominally when they have private members: two declarations of the same class are never
 * mutually assignable once any private member differs. Strip them from every .d.ts the
 * program reads so only the public surface is compared.
 */
function stripPrivateMembers(ts, sf) {
  const isPrivate = (member) =>
    (member.name && ts.isPrivateIdentifier(member.name)) ||
    (ts.canHaveModifiers(member) &&
      (ts.getModifiers(member) || []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword));
  const visit = (node, context) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const kept = node.members.filter((m) => ts.isConstructorDeclaration(m) || !isPrivate(m));
      node = ts.isClassDeclaration(node)
        ? ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, kept)
        : ts.factory.updateClassExpression(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, kept);
    }
    return ts.visitEachChild(node, (child) => visit(child, context), context);
  };
  const result = ts.transform(sf, [(context) => (root) => ts.visitNode(root, (n) => visit(n, context))]);
  const text = ts.createPrinter({ removeComments: true }).printFile(result.transformed[0]);
  result.dispose();
  return ts.createSourceFile(sf.fileName, text, sf.languageVersion, true);
}

function diffApi(ts, prevTypes, nextTypes) {
  const options = {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, ...rest) => {
    const sf = getSourceFile(fileName, ...rest);
    return sf && /\.d\.[cm]?ts$/.test(fileName) && !/[\\/]node_modules[\\/]typescript[\\/]/.test(fileName)
      ? stripPrivateMembers(ts, sf)
      : sf;
  };
  const program = ts.createProgram([prevTypes, nextTypes], options, host);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });
  const exportsOf = (file) => {
    const sf = program.getSourceFile(file);
    const mod = sf && checker.getSymbolAtLocation(sf);
    const map = new Map();
    if (!mod) return { sf, map };
    for (const sym of checker.getExportsOfModule(mod)) {
      const real = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      map.set(sym.getName(), real);
    }
    return { sf, map };
  };
  const prev = exportsOf(prevTypes);
  const next = exportsOf(nextTypes);
  const changes = [];

  const declText = (sym) =>
    (sym.declarations || [])
      .map((d) => printer.printNode(ts.EmitHint.Unspecified, d, d.getSourceFile()).replace(/\s+/g, ' ').trim())
      .sort()
      .join('\n');
  const typeOf = (sym, sf) => {
    const out = [];
    if (sym.flags & ts.SymbolFlags.Value) out.push(checker.getTypeOfSymbolAtLocation(sym, sf));
    if (sym.flags & (ts.SymbolFlags.Type)) out.push(checker.getDeclaredTypeOfSymbol(sym));
    return out;
  };
  const assignable = (a, b) => (typeof checker.isTypeAssignableTo === 'function' ? checker.isTypeAssignableTo(a, b) : null);
  const addedRequiredMembers = (oldSym, newSym) => {
    if (!(newSym.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) || newSym.flags & ts.SymbolFlags.Class) return [];
    const oldProps = new Set(checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(oldSym)).map((p) => p.getName()));
    return checker
      .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(newSym))
      .filter((p) => !oldProps.has(p.getName()) && !(p.flags & ts.SymbolFlags.Optional))
      .map((p) => p.getName());
  };

  for (const [name, oldSym] of prev.map) {
    const newSym = next.map.get(name);
    if (!newSym) {
      changes.push({ name, level: 'major', detail: 'export removed' });
      continue;
    }
    if (declText(oldSym) === declText(newSym)) continue;
    const oldTypes = typeOf(oldSym, prev.sf);
    const newTypes = typeOf(newSym, next.sf);
    let compatible = oldTypes.length === newTypes.length;
    let identical = compatible;
    if (compatible) {
      for (let i = 0; i < oldTypes.length; i++) {
        const nToO = assignable(newTypes[i], oldTypes[i]);
        const oToN = assignable(oldTypes[i], newTypes[i]);
        if (nToO === null) { compatible = false; break; }
        if (!nToO) compatible = false;
        if (!(nToO && oToN)) identical = false;
      }
    }
    if (!compatible) {
      changes.push({ name, level: 'major', detail: 'declaration changed incompatibly' });
      continue;
    }
    const required = addedRequiredMembers(oldSym, newSym);
    if (required.length) {
      changes.push({ name, level: 'major', detail: `gained required member(s): ${required.join(', ')}` });
      continue;
    }
    changes.push({ name, level: 'minor', detail: identical ? 'declaration changed (equivalent type)' : 'declaration extended compatibly' });
  }
  for (const name of next.map.keys()) {
    if (!prev.map.has(name)) changes.push({ name, level: 'minor', detail: 'export added' });
  }
  return changes;
}

function isStableZeroMajor(version) {
  return /^0\.\d+\.\d+$/.test(version);
}

export function classify(opts) {
  const result = {
    bump: 'none',
    evidence: 'none',
    floor: 'none',
    needsConfirmation: false,
    shippedChanges: [],
    apiChanges: [],
    notes: [],
    reason: '',
  };
  const titles = opts.titles && opts.titles.length ? opts.titles : [opts.title];
  const floors = [
    ...titles.map((t) => intentFloor(t, opts.labels)),
    milestoneFloor(opts.milestone, opts.currentVersion),
  ];
  const floor = floors.map((f) => f.level).reduce(maxLevel, 'none');
  const confirmedMajor = floors.some((f) => f.confirmedMajor);
  result.floor = floor;
  if (opts.milestone) result.notes.push(`milestone ${opts.milestone}`);

  let evidence;
  if (!opts.prev) {
    evidence = 'minor';
    result.notes.push('no published baseline found; assuming minor');
    result.evidence = 'no-baseline';
  } else {
    const before = fingerprint(opts.prev, opts.currentVersion);
    const after = fingerprint(opts.next, opts.currentVersion);
    const files = new Set([...before.keys(), ...after.keys()]);
    for (const file of [...files].sort()) {
      if (before.get(file) !== after.get(file)) {
        result.shippedChanges.push(`${before.has(file) ? (after.has(file) ? 'modified' : 'removed') : 'added'} ${file}`);
      }
    }
    if (!result.shippedChanges.length) {
      evidence = 'none';
    } else {
      evidence = 'patch';
      const prevTypes = typesEntry(opts.prev);
      const nextTypes = typesEntry(opts.next);
      if (prevTypes && nextTypes) {
        const ts = loadTypeScript(opts.tsFrom);
        if (ts) {
          result.apiChanges = diffApi(ts, prevTypes, nextTypes);
          for (const change of result.apiChanges) evidence = maxLevel(evidence, change.level);
        } else {
          const same = readFileSync(prevTypes, 'utf8') === readFileSync(nextTypes, 'utf8');
          if (!same) {
            evidence = maxLevel(evidence, 'minor');
            result.notes.push('typescript not available; API diff skipped, .d.ts changed so assuming at least minor');
          }
        }
      } else if (prevTypes !== nextTypes) {
        evidence = maxLevel(evidence, 'minor');
        result.notes.push('types entry point added or removed');
      }
    }
  }
  if (result.evidence !== 'no-baseline') result.evidence = evidence;

  let level;
  if (evidence === 'none') {
    level = 'none';
  } else {
    level = maxLevel(evidence, floor);
  }

  if (level === 'major' && !confirmedMajor) {
    result.needsConfirmation = true;
  }
  if (level === 'major' && isStableZeroMajor(opts.currentVersion)) {
    level = 'minor';
    result.needsConfirmation = false;
    result.notes.push('0.x version: breaking change released as minor');
  }

  if (level === 'none') {
    result.bump = 'none';
  } else if (/-(alpha|beta|rc)/.test(opts.currentVersion)) {
    result.bump = 'prerelease';
    result.notes.push(`prerelease version: ${level}-level change released as prerelease`);
  } else {
    result.bump = level;
  }

  const parts = [`bump=${result.bump}`, `evidence=${result.evidence}`, `intent-floor=${floor}`];
  if (result.apiChanges.length) {
    parts.push(`api: ${result.apiChanges.map((c) => `${c.name} (${c.detail})`).join('; ')}`);
  }
  if (result.notes.length) parts.push(result.notes.join('; '));
  result.reason = parts.join(' | ');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const opts = parseArgs(process.argv);
  if (!opts.next || !opts.currentVersion) {
    console.error('Usage: classify-bump.mjs --next <dir> [--prev <dir>] --current-version <v> [--title t] [--labels a,b] [--ts-from dir]');
    process.exit(2);
  }
  console.log(JSON.stringify(classify(opts), null, 2));
}
