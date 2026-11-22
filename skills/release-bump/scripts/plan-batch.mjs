#!/usr/bin/env node
/**
 * Milestone release-train planner.
 *
 * Issues that share a GitHub milestone are released together: each merged issue waits in the
 * Release column until the last open issue of the milestone has merged, then one release ships
 * everything. An issue without a milestone releases on its own, as before.
 *
 * Reads JSON on stdin:
 *   { "issueNumber": 70,
 *     "issues":    [{ "number", "title", "state": "OPEN" | "CLOSED", "labels": ["a"] | [{"name"}] }],   // whole milestone, any state
 *     "mergedPrs": [{ "number", "headRefName" }],                           // merged PRs of the repo
 *     "labels":    ["release:now", ...] }                                   // labels on this issue + PR
 * Writes JSON: { hold, forced, members, pending, titles, labels }
 *   members - this issue plus every other milestone issue already merged (released together)
 *   pending - open milestone issues not merged yet (the train waits for them). A CLOSED issue is never pending:
 *             one closed without a PR (for example "Already Resolved on Base Branch") has nothing left to ship, and
 *             would otherwise hold the train forever.
 *
 * The `release:now` label ships the train without waiting for the pending issues.
 */

export function mergedIssueNumbers(mergedPrs) {
  const merged = new Set();
  for (const pr of mergedPrs || []) {
    const match = /^feature\/issue-(\d+)(?:-|$)/.exec(pr.headRefName || '');
    if (match) merged.add(Number(match[1]));
  }
  return merged;
}

const labelNames = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);

export function planBatch({ issueNumber, issues = [], mergedPrs = [], labels = [] }) {
  const merged = mergedIssueNumbers(mergedPrs);
  const self = Number(issueNumber);
  const forced = labelNames(labels).some((l) => l.toLowerCase() === 'release:now');
  const members = issues.filter((i) => i.number === self || merged.has(i.number));
  const pending = issues.filter((i) => i.number !== self && !merged.has(i.number) && String(i.state || 'OPEN').toUpperCase() !== 'CLOSED');
  const memberLabels = new Set(labelNames(labels).map((l) => l.toLowerCase()));
  for (const issue of members) for (const l of labelNames(issue.labels)) memberLabels.add(l.toLowerCase());
  return {
    hold: pending.length > 0 && !forced,
    forced,
    members: members.map((i) => i.number).sort((a, b) => a - b),
    pending: pending.map((i) => i.number).sort((a, b) => a - b),
    titles: members.map((i) => i.title || '').filter(Boolean),
    labels: [...memberLabels].sort(),
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => console.log(JSON.stringify(planBatch(JSON.parse(input || '{}')))));
}
