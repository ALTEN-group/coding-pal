#!/usr/bin/env node
/**
 * Automatic milestone planner: which release train does a new issue belong to?
 *
 * Reads JSON on stdin:
 *   { "latestReleaseTag": "v4.6.1",                 // latest GitHub release tag (or "latestVersion": "4.6.1")
 *     "title":      "perf(db): ...",                // new issue title
 *     "labels":     ["release:minor"],              // labels on the new issue
 *     "milestones": [{ "number": 1, "title": "5.0.0" }] }   // OPEN milestones of the repository
 * Writes JSON: { action, level, title, number? }
 *   none   - the issue does not need a release (tests, docs, CI), or there is no release yet: no milestone
 *   use    - join the open train `title` (#number)
 *   rename - join train `number` and raise its title to `title` (the issue needs a higher level)
 *   create - no train in progress: create milestone `title`
 *
 * One train at a time. A milestone named like a version (4.7.0, 5.0.0) that is above the latest released
 * version is "in progress". Its title is its release level, and it only ever moves up: an issue that
 * needs a higher level than the train renames it (4.7.0 -> 5.0.0) instead of opening a second train.
 *
 * Semver special cases (same as classify-bump.mjs):
 *   - 0.x stable: a breaking issue is a minor train (0.5.0 -> 0.6.0), never 1.0.0.
 *   - latest release is a prerelease (0.1.0-alpha.3): its core 0.1.0 is not released yet, so a patch or minor
 *     issue joins/creates the train `0.1.0` (the promotion to stable); only a breaking one needs a higher train.
 */

const NON_RELEASING_TYPES = /^(test|docs|ci|style|build)(\(|:|!)/i;
const LEVELS = ['none', 'patch', 'minor', 'major'];
const rank = (level) => LEVELS.indexOf(level);

const labelNames = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean).map((l) => l.toLowerCase());

/** Release level an issue needs, judged from its title and labels (the real bump still comes from the shipped diff). */
export function issueLevel(title, labels) {
  const names = labelNames(labels);
  const t = (title || '').trim();
  if (
    names.includes('breaking') ||
    names.includes('release:major') ||
    /^\w+(\([^)]*\))?!:/.test(t) ||
    /\bBREAKING[ -]CHANGE\b/i.test(t)
  ) return 'major';
  if (names.includes('release:minor') || /^feat(\(|:|\s|!)/i.test(t)) return 'minor';
  if (names.includes('release:patch')) return 'patch';
  if (NON_RELEASING_TYPES.test(t)) return 'none';
  return 'patch';
}

export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((text || '').trim());
  return m ? m.slice(1).map(Number) : null;
}

/** Parse a release tag or version, prerelease allowed: `v0.1.0-alpha.2` -> { core: [0,1,0], pre: 'alpha.2' }. */
export function parseRelease(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec((text || '').trim());
  return m ? { core: m.slice(1, 4).map(Number), pre: m[4] || '' } : null;
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Next stable version for a level. With `prerelease` (the base is `X.Y.Z-alpha.N`) its core X.Y.Z is the
 * next stable version for patch and minor; only `major` goes further.
 */
export function nextVersion(published, level, { prerelease = false } = {}) {
  const [major, minor, patch] = published;
  if (level === 'major') return `${major + 1}.0.0`;
  if (prerelease) return `${major}.${minor}.${patch}`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Level of a train title relative to the released version (`prerelease`: base is X.Y.Z-pre, the train X.Y.Z is a promotion = patch). */
export function trainLevel(published, title, { prerelease = false } = {}) {
  const target = parseVersion(title);
  if (!target) return 'none';
  if (target[0] > published[0]) return 'major';
  if (target[0] === published[0] && target[1] > published[1]) return 'minor';
  if (target[0] === published[0] && target[1] === published[1] && target[2] > published[2]) return 'patch';
  if (prerelease && cmp(target, published) === 0) return 'patch';
  return 'none';
}

export function planMilestone({ latestReleaseTag, latestVersion, published, title, labels = [], milestones = [] }) {
  const release = parseRelease(latestReleaseTag || latestVersion || published);
  let level = issueLevel(title, labels);
  if (!release || level === 'none') return { action: 'none', level };
  const base = release.core;
  const prerelease = Boolean(release.pre);
  if (base[0] === 0 && level === 'major') level = 'minor'; // 0.x: breaking changes are minor

  const trains = milestones
    .map((m) => ({ ...m, version: parseVersion(m.title) }))
    .filter((m) => m.version && (prerelease ? cmp(m.version, base) >= 0 : cmp(m.version, base) > 0))
    .sort((a, b) => cmp(a.version, b.version));

  const target = nextVersion(base, level, { prerelease });
  if (!trains.length) return { action: 'create', level, title: target };

  const current = trains[0];
  if (rank(trainLevel(base, current.title, { prerelease })) >= rank(level)) {
    return { action: 'use', level, title: current.title, number: current.number };
  }
  const existing = trains.find((m) => m.title.replace(/^v/, '') === target);
  if (existing) return { action: 'use', level, title: existing.title, number: existing.number };
  return { action: 'rename', level, title: target, number: current.number };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => console.log(JSON.stringify(planMilestone(JSON.parse(input || '{}')))));
}
