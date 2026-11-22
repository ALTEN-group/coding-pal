#!/usr/bin/env node
/**
 * Evidence-based semver bump classifier for Node.js services released as GitHub Releases + Docker images.
 *
 * Compares the repository at the previous release tag (--prev-ref) with the working tree (--repo-root)
 * and decides the release type from what actually changes:
 *
 *   none       - no shipped file changed (tests, docs, CI only): do not release
 *   patch      - shipped files changed, no API / migration / env evidence beyond that
 *   minor      - backwards-compatible additions (new endpoint, new changeSet, new env variable without default)
 *   major      - breaking change (removed endpoint, destructive migration, removed env variable)
 *   prerelease - current version is X.Y.Z-alpha.N: bump the counter
 *   promote    - current version is X.Y.Z-alpha.N and the milestone is the plain version X.Y.Z
 *
 * The issue title / labels / milestone only raise the result (a floor); evidence only raises it too.
 * A major that comes from evidence alone needs confirmation (`needsConfirmation`): the workflow then asks for
 * the `breaking` label. 0.x stable versions release breaking changes as minor.
 *
 * Usage:
 *   classify-bump.mjs --repo-root <dir> --prev-ref <git ref, may be empty> --current-version <X.Y.Z[-pre.N]>
 *                     [--title <t>]... [--milestone <name>] [--labels a,b]
 *                     [--openapi-glob <glob>] [--liquibase-glob <glob>] [--env-glob <glob>]
 *
 * Output (stdout, JSON):
 *   { bump, reason, shippedChanges: string[], needsConfirmation: boolean,
 *     evidence: { openapi: string[], liquibase: string[], env: string[] }, targetVersion?: string }
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isShippedPath } from './pr-ships.mjs';

const LEVELS = ['none', 'patch', 'minor', 'major'];
const rank = (level) => LEVELS.indexOf(level);
const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);

export const DEFAULT_GLOBS = {
  openapi: 'swagger/src/*.openapi*.json',
  liquibase: 'db/liquibase/**',
  env: 'docker/conf/.env.*.example',
};

export function parseArgs(argv) {
  const opts = {
    repoRoot: process.cwd(),
    prevRef: '',
    currentVersion: '',
    title: '',
    titles: [],
    milestone: '',
    labels: [],
    openapiGlob: DEFAULT_GLOBS.openapi,
    liquibaseGlob: DEFAULT_GLOBS.liquibase,
    envGlob: DEFAULT_GLOBS.env,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--repo-root' && value) opts.repoRoot = path.resolve(argv[++i]);
    else if (arg === '--prev-ref' && value !== undefined) opts.prevRef = argv[++i].trim();
    else if (arg === '--current-version' && value) opts.currentVersion = argv[++i].replace(/^v/, '');
    else if (arg === '--title' && value !== undefined) {
      opts.title = argv[++i];
      opts.titles.push(opts.title);
    } else if (arg === '--milestone' && value !== undefined) opts.milestone = argv[++i];
    else if (arg === '--labels' && value !== undefined) {
      opts.labels = argv[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (arg === '--openapi-glob' && value) opts.openapiGlob = argv[++i];
    else if (arg === '--liquibase-glob' && value) opts.liquibaseGlob = argv[++i];
    else if (arg === '--env-glob' && value) opts.envGlob = argv[++i];
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------
// Intent: title, labels, milestone
// ---------------------------------------------------------------------------------------------

/** Floor derived from the human-declared intent (title + labels). */
export function intentFloor(title, labels = []) {
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
 * relative to the current version, e.g. `5.0.0` over `4.6.0` is a confirmed major.
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

// ---------------------------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------------------------

const PRERELEASE_RE = /-(alpha|beta|rc)\b/i;
const isPrerelease = (v) => PRERELEASE_RE.test(v);
const isStableZeroMajor = (v) => /^0\.\d+\.\d+$/.test(v);

export function bumpVersion(version, level) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return '';
  const [major, minor, patch] = m.slice(1).map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** `0.1.0-alpha.1` -> `0.1.0-alpha.2`; `1.0.0-rc` -> `1.0.0-rc.1`. */
export function nextPrerelease(version) {
  const m = /^(\d+\.\d+\.\d+-[A-Za-z]+)(?:\.(\d+))?$/.exec(version);
  if (!m) return `${version}.1`;
  return `${m[1]}.${m[2] === undefined ? 1 : Number(m[2]) + 1}`;
}

const coreOf = (v) => (/^(\d+\.\d+\.\d+)/.exec(v) || [])[1] || '';

// ---------------------------------------------------------------------------------------------
// Git and file helpers
// ---------------------------------------------------------------------------------------------

function git(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${err.stderr || err.message}`);
  }
}

const gitShow = (root, ref, file) => git(root, ['show', `${ref}:${file}`], { allowFail: true });

const gitFiles = (root, ref) => git(root, ['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Small glob matcher: `**` (any depth, including none after a slash) and `*` (within one segment). */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matchGlob = (glob) => {
  const re = globToRegExp(glob);
  return (file) => re.test(file);
};

/**
 * Files matching `glob` in the previous ref and in the working tree, with their contents.
 * Returns [{ file, before: string|null, after: string|null }] for every file that exists on either side.
 */
function filePairs(opts, glob) {
  const match = matchGlob(glob);
  const before = new Set(gitFiles(opts.repoRoot, opts.prevRef).filter(match));
  const after = new Set(walk(opts.repoRoot).filter(match));
  return [...new Set([...before, ...after])].sort().map((file) => ({
    file,
    before: before.has(file) ? gitShow(opts.repoRoot, opts.prevRef, file) : null,
    after: after.has(file) ? readFileSync(path.join(opts.repoRoot, file), 'utf8') : null,
  }));
}

// ---------------------------------------------------------------------------------------------
// (a) OpenAPI diff
// ---------------------------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

function resolveRef(doc, node, seen = new Set()) {
  let cur = node;
  while (cur && typeof cur === 'object' && typeof cur.$ref === 'string' && cur.$ref.startsWith('#/')) {
    if (seen.has(cur.$ref)) return {};
    seen.add(cur.$ref);
    cur = cur.$ref
      .slice(2)
      .split('/')
      .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), doc);
  }
  return cur ?? {};
}

const typeSet = (schema) => {
  let t = schema.type;
  if (t === undefined) t = schema.properties ? 'object' : schema.items ? 'array' : undefined;
  const set = new Set(Array.isArray(t) ? t : t === undefined ? [] : [t]);
  if (schema.nullable) set.add('null');
  return set;
};

/**
 * Compare two schemas. `mode` is 'request' (data the client sends) or 'response' (data it receives).
 * Pushes { level, message } into `out`.
 */
function diffSchema(oldDoc, newDoc, oldS, newS, mode, where, out, depth = 0) {
  if (depth > 8) return;
  const o = resolveRef(oldDoc, oldS);
  const n = resolveRef(newDoc, newS);

  const ot = typeSet(o);
  const nt = typeSet(n);
  if (ot.size && nt.size && [...ot].sort().join() !== [...nt].sort().join()) {
    out.push({ level: 'major', message: `changed type of ${where} (${[...ot].join('|')} -> ${[...nt].join('|')})` });
    return;
  }
  if (Array.isArray(o.enum) && Array.isArray(n.enum)) {
    const removed = o.enum.filter((v) => !n.enum.some((w) => JSON.stringify(w) === JSON.stringify(v)));
    const added = n.enum.filter((v) => !o.enum.some((w) => JSON.stringify(w) === JSON.stringify(v)));
    if (removed.length) out.push({ level: 'major', message: `narrowed enum of ${where} (removed ${removed.join(', ')})` });
    else if (added.length) out.push({ level: 'minor', message: `widened enum of ${where} (added ${added.join(', ')})` });
  } else if (Array.isArray(o.enum) && !n.enum) {
    out.push({ level: 'minor', message: `enum of ${where} removed (widened)` });
  } else if (!o.enum && Array.isArray(n.enum)) {
    out.push({ level: 'major', message: `enum added to ${where} (narrowed)` });
  }
  if (o.format !== n.format && (o.format || n.format)) {
    out.push({ level: 'minor', message: `changed format of ${where} (${o.format || 'none'} -> ${n.format || 'none'})` });
  }

  if (o.properties || n.properties) {
    const oProps = o.properties || {};
    const nProps = n.properties || {};
    const oReq = new Set(o.required || []);
    const nReq = new Set(n.required || []);
    for (const name of Object.keys(oProps)) {
      if (!(name in nProps)) {
        out.push(mode === 'response'
          ? { level: 'major', message: `removed response property ${where}.${name}` }
          : { level: 'minor', message: `removed request property ${where}.${name} (no longer read)` });
        continue;
      }
      if (mode === 'request' && !oReq.has(name) && nReq.has(name)) {
        out.push({ level: 'major', message: `request property ${where}.${name} became required` });
      } else if (mode === 'response' && oReq.has(name) && !nReq.has(name)) {
        out.push({ level: 'major', message: `response property ${where}.${name} is no longer guaranteed` });
      }
      diffSchema(oldDoc, newDoc, oProps[name], nProps[name], mode, `${where}.${name}`, out, depth + 1);
    }
    for (const name of Object.keys(nProps)) {
      if (name in oProps) continue;
      if (mode === 'request' && nReq.has(name)) out.push({ level: 'major', message: `new required request property ${where}.${name}` });
      else out.push({ level: 'minor', message: `added ${mode} property ${where}.${name}` });
    }
  }
  if (o.items || n.items) {
    if (o.items && n.items) diffSchema(oldDoc, newDoc, o.items, n.items, mode, `${where}[]`, out, depth + 1);
  }
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (JSON.stringify(o[key]) !== JSON.stringify(n[key])) out.push({ level: 'minor', message: `changed ${key} of ${where}` });
  }
}

const pickContentSchema = (doc, content) => {
  if (!content || typeof content !== 'object') return undefined;
  const keys = Object.keys(content);
  const key = keys.find((k) => /json/i.test(k)) ?? keys[0];
  return key ? resolveRef(doc, content[key]).schema : undefined;
};

/** Parameters of an operation (path-level + operation-level), keyed `in:name`, with request body of Swagger 2.0 split off. */
function collectParams(doc, pathItem, op) {
  const params = new Map();
  let bodySchema;
  let bodyRequired = false;
  for (const raw of [...(pathItem.parameters || []), ...(op.parameters || [])]) {
    const p = resolveRef(doc, raw);
    if (!p.name && p.in !== 'body') continue;
    if (p.in === 'body') {
      bodySchema = p.schema;
      bodyRequired = Boolean(p.required);
      continue;
    }
    const schema = p.schema || { type: p.type, enum: p.enum, items: p.items, format: p.format };
    params.set(`${p.in}:${p.name}`, { required: p.in === 'path' || Boolean(p.required), schema });
  }
  if (op.requestBody) {
    const rb = resolveRef(doc, op.requestBody);
    bodySchema = pickContentSchema(doc, rb.content);
    bodyRequired = Boolean(rb.required);
  }
  return { params, bodySchema, bodyRequired };
}

function responsesOf(doc, op) {
  const map = new Map();
  for (const [status, raw] of Object.entries(op.responses || {})) {
    const r = resolveRef(doc, raw);
    map.set(status, r.schema || pickContentSchema(doc, r.content));
  }
  return map;
}

/** Diff two parsed OpenAPI (3.x, tolerant of 2.0) documents. Returns [{ level, message }]. */
export function diffOpenApi(oldDoc, newDoc) {
  const out = [];
  const oPaths = oldDoc.paths || {};
  const nPaths = newDoc.paths || {};
  for (const p of Object.keys(oPaths)) {
    if (!(p in nPaths)) {
      out.push({ level: 'major', message: `removed path ${p}` });
      continue;
    }
    for (const method of HTTP_METHODS) {
      const oOp = oPaths[p][method];
      if (!oOp) continue;
      const label = `${method.toUpperCase()} ${p}`;
      const nOp = nPaths[p][method];
      if (!nOp) {
        out.push({ level: 'major', message: `removed operation ${label}` });
        continue;
      }
      const o = collectParams(oldDoc, oPaths[p], oOp);
      const n = collectParams(newDoc, nPaths[p], nOp);
      for (const [key, oldParam] of o.params) {
        const newParam = n.params.get(key);
        if (!newParam) {
          out.push(oldParam.required
            ? { level: 'major', message: `${label}: removed or renamed required parameter ${key}` }
            : { level: 'minor', message: `${label}: removed optional parameter ${key}` });
          continue;
        }
        if (!oldParam.required && newParam.required) out.push({ level: 'major', message: `${label}: parameter ${key} became required` });
        diffSchema(oldDoc, newDoc, oldParam.schema, newParam.schema, 'request', `${label} param ${key}`, out);
      }
      for (const [key, newParam] of n.params) {
        if (o.params.has(key)) continue;
        out.push(newParam.required
          ? { level: 'major', message: `${label}: new required parameter ${key}` }
          : { level: 'minor', message: `${label}: added optional parameter ${key}` });
      }
      if (o.bodySchema && n.bodySchema) {
        if (!o.bodyRequired && n.bodyRequired) out.push({ level: 'major', message: `${label}: request body became required` });
        diffSchema(oldDoc, newDoc, o.bodySchema, n.bodySchema, 'request', `${label} body`, out);
      } else if (!o.bodySchema && n.bodySchema) {
        out.push(n.bodyRequired
          ? { level: 'major', message: `${label}: new required request body` }
          : { level: 'minor', message: `${label}: added optional request body` });
      } else if (o.bodySchema && !n.bodySchema) {
        out.push({ level: 'minor', message: `${label}: request body no longer read` });
      }
      const oRes = responsesOf(oldDoc, oOp);
      const nRes = responsesOf(newDoc, nOp);
      for (const [status, oSchema] of oRes) {
        if (!nRes.has(status)) {
          out.push(/^2/.test(status)
            ? { level: 'major', message: `${label}: removed response ${status}` }
            : { level: 'minor', message: `${label}: removed response ${status}` });
          continue;
        }
        const nSchema = nRes.get(status);
        if (oSchema && nSchema) diffSchema(oldDoc, newDoc, oSchema, nSchema, 'response', `${label} ${status}`, out);
        else if (oSchema && !nSchema) out.push({ level: 'major', message: `${label}: response ${status} lost its body` });
        else if (!oSchema && nSchema) out.push({ level: 'minor', message: `${label}: response ${status} gained a body` });
      }
      for (const status of nRes.keys()) {
        if (!oRes.has(status)) out.push({ level: 'minor', message: `${label}: added response ${status}` });
      }
    }
    for (const method of HTTP_METHODS) {
      if (nPaths[p][method] && !oPaths[p][method]) out.push({ level: 'minor', message: `added operation ${method.toUpperCase()} ${p}` });
    }
  }
  for (const p of Object.keys(nPaths)) {
    if (!(p in oPaths)) out.push({ level: 'minor', message: `added path ${p}` });
  }
  return out;
}

function openapiEvidence(opts, notes) {
  const items = [];
  for (const { file, before, after } of filePairs(opts, opts.openapiGlob)) {
    if (before === after) continue;
    if (before === null) {
      items.push({ level: 'minor', message: `${file}: added API spec` });
      continue;
    }
    if (after === null) {
      items.push({ level: 'major', message: `${file}: removed API spec` });
      continue;
    }
    try {
      for (const d of diffOpenApi(JSON.parse(before), JSON.parse(after))) items.push({ ...d, message: `${file}: ${d.message}` });
    } catch (err) {
      notes.push(`could not parse ${file} as JSON (${err.message}); API diff skipped`);
    }
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// (b) Liquibase diff
// ---------------------------------------------------------------------------------------------

const DESTRUCTIVE_TAGS = /\b(dropTable|dropColumn|renameTable|renameColumn|modifyDataType|dropNotNullConstraint|dropView|renameView|dropSequence|renameSequence)\b/;
const DESTRUCTIVE_SQL = /\bDROP\s+(TABLE|COLUMN|VIEW|SEQUENCE|SCHEMA|TYPE|CONSTRAINT|NOT\s+NULL)\b|\bRENAME\b|\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i;

const normalizeBody = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

/** Drop the rollback section of a YAML changeSet block (everything indented under `rollback:`). */
function stripYamlRollback(block) {
  const lines = block.split('\n');
  const out = [];
  let skipIndent = -1;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (skipIndent >= 0) {
      if (!line.trim() || indent > skipIndent) continue;
      skipIndent = -1;
    }
    if (/^\s*rollback\s*:/.test(line)) {
      skipIndent = indent;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Extract changeSets of a Liquibase changelog file (xml, formatted sql, yaml): [{ id, author, body }]. */
export function parseChangeSets(file, text) {
  const sets = [];
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xml') {
    for (const m of text.matchAll(/<changeSet\b([^>]*?)(?:\/>|>([\s\S]*?)<\/changeSet>)/g)) {
      const id = /\bid\s*=\s*["']([^"']*)["']/.exec(m[1])?.[1];
      const author = /\bauthor\s*=\s*["']([^"']*)["']/.exec(m[1])?.[1] ?? '';
      if (id === undefined) continue;
      sets.push({ id, author, attrs: m[1], body: normalizeBody((m[2] || '').replace(/<!--[\s\S]*?-->/g, '')) });
    }
  } else if (ext === '.sql') {
    const parts = text.split(/^--\s*changeset\s+/im).slice(1);
    for (const part of parts) {
      const [head, ...rest] = part.split('\n');
      const m = /^(\S+?):(\S+)/.exec(head.trim());
      if (!m) continue;
      sets.push({ id: m[2], author: m[1], attrs: head.trim(), body: normalizeBody(rest.join('\n')) });
    }
  } else if (ext === '.yaml' || ext === '.yml') {
    const parts = text.split(/^[ \t]*-[ \t]+changeSet\s*:[ \t]*$/m).slice(1);
    for (const part of parts) {
      const id = /^\s*id\s*:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(part)?.[1];
      const author = /^\s*author\s*:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(part)?.[1] ?? '';
      if (id === undefined) continue;
      sets.push({ id, author, attrs: '', body: part.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).join('\n'), yaml: true });
    }
  }
  return sets;
}

/** True when the changeSet forward change is destructive (drop/rename/retype); rollback and comments are ignored. */
export function isDestructive(set) {
  let body = set.body;
  body = body.replace(/<!--[\s\S]*?-->/g, '').replace(/<rollback\b[\s\S]*?<\/rollback>/gi, '');
  body = body.split('\n').filter((l) => !/^--\s*rollback\b/i.test(l) && !/^--(?!\s*changeset)/i.test(l)).join('\n');
  if (set.yaml) body = stripYamlRollback(body);
  return DESTRUCTIVE_TAGS.test(body) || DESTRUCTIVE_SQL.test(body);
}

export function diffLiquibase(file, before, after) {
  const out = [];
  if (after === null) return out;
  const oldSets = new Map(parseChangeSets(file, before ?? '').map((s) => [`${s.author}:${s.id}`, s]));
  for (const set of parseChangeSets(file, after)) {
    const old = oldSets.get(`${set.author}:${set.id}`);
    if (!old) {
      out.push(isDestructive(set)
        ? { level: 'major', message: `${file}: new changeSet ${set.id} (destructive)` }
        : { level: 'minor', message: `${file}: new changeSet ${set.id}` });
    } else if (old.body !== set.body || old.attrs.replace(/\s+/g, ' ') !== set.attrs.replace(/\s+/g, ' ')) {
      out.push({ level: 'major', message: `${file}: changeSet ${set.id} (modified released changeSet)` });
    }
  }
  return out;
}

function liquibaseEvidence(opts) {
  const items = [];
  for (const { file, before, after } of filePairs(opts, opts.liquibaseGlob)) {
    if (before === after || !/\.(xml|sql|ya?ml)$/i.test(file)) continue;
    items.push(...diffLiquibase(file, before, after));
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// (c) Environment template diff
// ---------------------------------------------------------------------------------------------

/** Variables of a `.env` template: Map name -> hasDefault. Commented-out lines are ignored. */
export function parseEnv(text) {
  const vars = new Map();
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(.*))?$/.exec(line);
    if (!m) continue;
    let value = (m[2] ?? '').trim();
    if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, '').trim();
    vars.set(m[1], value !== '' && value !== '""' && value !== "''");
  }
  return vars;
}

export function diffEnv(file, before, after) {
  const out = [];
  const o = parseEnv(before ?? '');
  if (after === null) return [{ level: 'major', message: `${file}: removed env template` }];
  const n = parseEnv(after);
  for (const name of o.keys()) {
    if (!n.has(name)) out.push({ level: 'major', message: `${file}: removed or renamed variable ${name}` });
  }
  for (const [name, hasDefault] of n) {
    if (o.has(name)) continue;
    out.push(hasDefault
      ? { level: 'patch', message: `${file}: added variable ${name} (with default)` }
      : { level: 'minor', message: `${file}: added variable ${name} (no default, deployers must set it)` });
  }
  return out;
}

function envEvidence(opts) {
  const items = [];
  for (const { file, before, after } of filePairs(opts, opts.envGlob)) {
    if (before === after) continue;
    if (before === null) {
      items.push(...diffEnv(file, '', after));
      continue;
    }
    items.push(...diffEnv(file, before, after));
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// Shipped changes between the previous release and HEAD
// ---------------------------------------------------------------------------------------------

/** package.json / package-lock.json differ only by the release version: not a shipped change. */
function onlyVersionChanged(root, ref, file) {
  const strip = (text) => {
    const j = JSON.parse(text);
    delete j.version;
    if (j.packages?.['']) delete j.packages[''].version;
    return JSON.stringify(j);
  };
  try {
    const before = gitShow(root, ref, file);
    const after = git(root, ['show', `HEAD:${file}`], { allowFail: true });
    return before !== null && after !== null && strip(before) === strip(after);
  } catch {
    return false;
  }
}

function shippedChanges(opts) {
  const changes = [];
  if (!opts.prevRef) {
    for (const file of git(opts.repoRoot, ['ls-files']).split('\n').filter(Boolean)) {
      if (isShippedPath(file)) changes.push(`added ${file}`);
    }
    return changes;
  }
  const names = git(opts.repoRoot, ['diff', '--name-status', '--no-renames', opts.prevRef, 'HEAD']);
  for (const line of names.split('\n').filter(Boolean)) {
    const [status, ...rest] = line.split('\t');
    const file = rest.join('\t');
    if (!isShippedPath(file)) continue;
    if (/(^|\/)package(-lock)?\.json$/.test(file) && status === 'M' && onlyVersionChanged(opts.repoRoot, opts.prevRef, file)) continue;
    changes.push(`${status === 'A' ? 'added' : status === 'D' ? 'removed' : 'modified'} ${file}`);
  }
  return changes;
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

const asStrings = (items) => items.map((i) => `[${i.level}] ${i.message}`);
const levelOf = (items) => items.reduce((acc, i) => maxLevel(acc, i.level), 'none');

export function classify(opts) {
  const o = {
    repoRoot: process.cwd(),
    prevRef: '',
    currentVersion: '',
    title: '',
    titles: [],
    milestone: '',
    labels: [],
    openapiGlob: DEFAULT_GLOBS.openapi,
    liquibaseGlob: DEFAULT_GLOBS.liquibase,
    envGlob: DEFAULT_GLOBS.env,
    ...opts,
  };
  if (o.prevRef && git(o.repoRoot, ['rev-parse', '--verify', '--quiet', `${o.prevRef}^{commit}`], { allowFail: true }) === null) {
    throw new Error(`--prev-ref "${o.prevRef}" does not resolve to a commit in ${o.repoRoot}`);
  }
  const notes = [];
  const titles = o.titles && o.titles.length ? o.titles : [o.title];
  const floors = [...titles.map((t) => intentFloor(t, o.labels)), milestoneFloor(o.milestone, o.currentVersion)];
  const floor = floors.map((f) => f.level).reduce(maxLevel, 'none');
  const confirmedMajor = floors.some((f) => f.confirmedMajor);
  if (o.milestone) notes.push(`milestone ${o.milestone}`);

  const result = {
    bump: 'none',
    reason: '',
    shippedChanges: shippedChanges(o),
    needsConfirmation: false,
    evidence: { openapi: [], liquibase: [], env: [] },
  };

  let evidenceLevel;
  let evidenceLabel;
  if (!o.prevRef) {
    evidenceLevel = 'minor';
    evidenceLabel = 'no-baseline';
    notes.push('no previous release; assuming at least minor');
  } else {
    const openapi = openapiEvidence(o, notes);
    const liquibase = liquibaseEvidence(o);
    const env = envEvidence(o);
    result.evidence = { openapi: asStrings(openapi), liquibase: asStrings(liquibase), env: asStrings(env) };
    if (!result.shippedChanges.length) {
      evidenceLevel = 'none';
    } else {
      evidenceLevel = [openapi, liquibase, env].map(levelOf).reduce(maxLevel, 'patch');
    }
    evidenceLabel = evidenceLevel;
  }

  let level = evidenceLevel === 'none' ? 'none' : maxLevel(evidenceLevel, floor);
  if (level === 'major' && !confirmedMajor) result.needsConfirmation = true;
  if (level === 'major' && isStableZeroMajor(o.currentVersion)) {
    level = 'minor';
    result.needsConfirmation = false;
    notes.push('0.x version: breaking change released as minor');
  }

  const milestoneVersion = /^v?(\d+\.\d+\.\d+)$/.exec((o.milestone || '').trim())?.[1];
  if (level === 'none') {
    result.bump = 'none';
  } else if (isPrerelease(o.currentVersion)) {
    result.needsConfirmation = false;
    if (milestoneVersion && milestoneVersion === coreOf(o.currentVersion)) {
      result.bump = 'promote';
      result.targetVersion = milestoneVersion;
      notes.push(`milestone ${milestoneVersion} promotes ${o.currentVersion} to stable`);
    } else {
      result.bump = 'prerelease';
      result.targetVersion = nextPrerelease(o.currentVersion);
      notes.push(`prerelease version: ${level}-level change released as prerelease`);
    }
  } else {
    result.bump = level;
    result.targetVersion = bumpVersion(o.currentVersion, level);
  }
  if (result.bump !== 'major') result.needsConfirmation = false;

  const parts = [`bump=${result.bump}`, `evidence=${evidenceLabel}`, `intent-floor=${floor}`];
  for (const [kind, list] of Object.entries(result.evidence)) {
    if (list.length) parts.push(`${kind}: ${list.slice(0, 5).join('; ')}${list.length > 5 ? `; +${list.length - 5} more` : ''}`);
  }
  if (notes.length) parts.push(notes.join('; '));
  result.reason = parts.join(' | ');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const opts = parseArgs(process.argv);
  if (!opts.currentVersion || !existsSync(opts.repoRoot) || !statSync(opts.repoRoot).isDirectory()) {
    console.error('Usage: classify-bump.mjs --repo-root <dir> --prev-ref <ref|""> --current-version <v> [--title t]... [--milestone m] [--labels a,b] [--openapi-glob g] [--liquibase-glob g] [--env-glob g]');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(classify(opts), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}
