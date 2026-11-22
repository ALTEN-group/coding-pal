#!/usr/bin/env node
/**
 * Single-flight chain (repository-wide).
 *
 * Only ONE issue is in flight (Code -> Prove -> merge) at a time, so every issue is coded on a main that
 * already contains the issues before it: no stale-base conflicts and no re-runs. A milestone does not
 * change this (stale bases conflict the same way), it only groups issues into one release and makes the
 * chain prefer the next `ready` issue of the milestone that just merged.
 *
 *   mode "intercept" - called at the top of Code. If another issue is already in flight, this issue is
 *                      parked as `ready` (no AI call) instead of being coded.
 *   mode "advance"   - called after an issue merged. If nothing else is in flight, a `ready` issue is started
 *                      by adding `5-release`: first the lowest-numbered one in the same milestone as the
 *                      merged issue, then the lowest-numbered one overall.
 *
 * Reads JSON on stdin:
 *   { "mode", "issueNumber", "milestone": "5.0.0" | "",           // milestone of issueNumber, if any
 *     "issues":    [{ "number", "labels": [...], "milestone": {"title"} | null }],   // open issues of the repo
 *     "mergedPrs": [{ "headRefName" }],                            // merged PRs of the repository
 *     "openPrs":   [{ "headRefName" }] }                           // open PRs of the repository
 * An issue is merged when a PR from branch `feature/issue-<n>-*` merged. An issue is IN FLIGHT only while work is
 * actually queued or running for it: it carries a stage label (`3-code`, `4-prove`, `5-release`) and has an open
 * PR (intercept) or just the label (advance). An open PR alone does not count: a parked (`ready`) or paused issue
 * keeps its PR, and counting it would let two issues block each other forever.
 * `needs:developer` issues never block and are never started: a failure stops the chain, it does not jam it.
 */
import { mergedIssueNumbers } from './plan-batch.mjs';

export const READY_LABEL = 'ready';
const STAGE_LABELS = ['3-code', '4-prove', '5-release'];

const labelNames = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean).map((l) => l.toLowerCase());

export function planChain({ mode, issueNumber, milestone = '', issues = [], mergedPrs = [], openPrs = [] }) {
  const self = Number(issueNumber);
  const merged = mergedIssueNumbers(mergedPrs);
  const withOpenPr = mergedIssueNumbers(openPrs);
  const others = issues
    .filter((i) => i.number !== self && !merged.has(i.number))
    .map((i) => ({ number: i.number, labels: labelNames(i.labels), milestone: i.milestone?.title ?? i.milestone ?? '' }))
    .filter((i) => !i.labels.includes('needs:developer'));

  if (mode === 'intercept') {
    const blockers = others
      .filter((i) => withOpenPr.has(i.number) && i.labels.some((l) => STAGE_LABELS.includes(l)))
      .map((i) => i.number)
      .sort((a, b) => a - b);
    return { action: blockers.length ? 'intercept' : 'proceed', blockers };
  }

  if (mode === 'advance') {
    const busy = others
      .filter((i) => i.labels.some((l) => STAGE_LABELS.includes(l)))
      .map((i) => i.number)
      .sort((a, b) => a - b);
    if (busy.length) return { action: 'none', reason: 'busy', busy };
    const sameTrain = (i) => (milestone && i.milestone === milestone ? 0 : 1);
    const next = others
      .filter((i) => i.labels.includes(READY_LABEL))
      .sort((a, b) => sameTrain(a) - sameTrain(b) || a.number - b.number)[0];
    return next ? { action: 'trigger', issue: next.number } : { action: 'none', reason: 'no-ready' };
  }

  return { action: 'none', reason: 'unknown-mode' };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => console.log(JSON.stringify(planChain(JSON.parse(input || '{}')))));
}
