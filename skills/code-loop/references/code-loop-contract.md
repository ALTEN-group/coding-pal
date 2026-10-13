# Code Loop Contract

Code turns a validated `plan.md` into a pull request by an autonomous loop: generate one step, run the checks and controls, fix until green, record the result, repeat. This contract defines the state that proves the loop ran, the fix-loop limit that bounds it, and the branch rules that keep the work short-lived.

AI implements. **The Developer supervises and steps in only when the fix-loop limit is reached.** The contract encodes that split: the agent can record attempts but can never reset or raise the limit.

---

## 1. Inputs and Outputs

| Item | Location | Owner |
|---|---|---|
| Validated plan | `specs/issue-<n>/plan.md` | The Developer approves it in `## Approval` (`Approved By`); never edited after approval |
| Think record | `specs/issue-<n>/think.md` | Architect and Developer |
| Loop state | `specs/issue-<n>/progress.json` | Written only by `code-loop.mjs` |
| Pull request | opened with the `pr-record` body | Code agent |

---

## 2. The Loop, One Plan Step per Turn

For each step, in order:

0. Code starts only from an approved plan. `plan.md` `## Approval` -> `Approved By` must read `<name> (Developer) on YYYY-MM-DD` (optionally followed by `; <name> (Architect) on YYYY-MM-DD`) with a person's name, never `Pending`, an AI, or a placeholder (the full rule is in the `think-plan` contract). `start` and `next` otherwise exit 1 with `plan is not approved by a Developer; Code starts only from an approved plan`. `status` still works and shows the approval line, as does `next`.
1. `code-loop.mjs next`, then `start <n>`.
2. Apply the step's `New Code`, adjusted only to fit the repository. Report any divergence.
3. Write only the files listed in the step's `Files`.
4. Run the step's `Verification` and `Bootable Check`, then the controls (`task-gate`, `scope-guard`, `secret-guard`, `dependency-guard`, `criteria-verify` on the test reports, and any installed control).
5. All green: `pass <n>`, then commit.
6. Anything failing: `fail <n> --reason "<what failed>"`, repair, and run the checks again.

A step is atomic. Steps run strictly in plan order and only one step is in progress at a time.

---

## 3. `progress.json`

```json
{
	"issue": "42",
	"planSha256": "<sha256 of plan.md with LF line endings>",
	"steps": {
		"1": { "status": "done", "attempts": 1, "verifiedAt": "2026-10-13T09:30:00Z", "lastFailure": "tests/routes/role.test.js failed: expected 403" },
		"2": { "status": "in_progress", "attempts": 0, "verifiedAt": null, "lastFailure": null }
	},
	"fixLoop": { "attempts": 1, "limit": 5 }
}
```

- Created on the first `code-loop.mjs` command for a work item. `issue` is `<n>` for a directory named `issue-<n>`, otherwise the directory name.
- `status`: `pending`, `in_progress`, or `done`. Statuses are ordered: done steps first, at most one `in_progress`, then pending steps.
- `verifiedAt`: ISO 8601 UTC timestamp, set when a step passes, otherwise `null`.
- `attempts` per step and `fixLoop.attempts` per work item. `fixLoop.attempts` always equals the sum of the step attempts; a hand edit that breaks this is rejected.
- `lastFailure` is the `--reason` of the latest failed attempt.
- `planSha256` is the sha256 of `plan.md` with CRLF normalised to LF.

### Plan changes

If `plan.md` changes after Code started (any step started or any attempt recorded), every command fails with `plan changed after Code started; the Developer must re-approve`. Before anything started, the file is simply re-read.

---

## 4. Fix-Loop Limit

- The limit is **per work item**, default **5**, fixed when `progress.json` is created (`--limit` is accepted only then, from 1 to 5, and can only lower the default). Passing a different `--limit` later is an error, and a `progress.json` whose limit is above 5 is rejected.
- Each `fail` increments the step attempts and the work-item counter.
- More than 3 attempts prints a warning: the plan was too big or too vague. Tell the Developer and consider splitting the plan.
- At the limit `fail` exits 1 with `fix-loop limit reached: the Developer steps in`. From then on `start`, `pass`, and `fail` refuse with the same message.
- There is no `reset-attempts`. Only the Developer, outside the loop, can change the state, and the change is visible in the pull request.
- Deleting or rewriting `progress.json` cannot reset the counter either: `check-history` (section 5) compares the file with the base and every commit that touched it.
- The `pr-record` Code gate rejects attempts above the limit, and a limit above 5.

---

## 5. Commands

| Command | Effect | Exit |
|---|---|---|
| `status` | Each step with status and attempts, plus totals and the approval line. `--json` for machines | 0 |
| `next` | The next step that is not done, with the approval line, its Files, Action, Verification, Bootable Check, Serves. `--json` for machines | 1 when all steps are done, or the plan is not approved |
| `start <n>` | Marks step `n` in progress. Only the next undone step may start | 1 on order or state violations, or when the plan is not approved |
| `pass <n>` | Marks step `n` done with `verifiedAt`. Requires `in_progress` | 1 otherwise |
| `fail <n> --reason "<text>"` | Records a failed attempt. A reason is required | 1 at the limit |
| `check-history [--base <ref>]` | Verifies with git that the counters in `progress.json` were never lowered (below) | 1 on any violation |

All commands take `--dir specs/issue-<n>`. Plan steps are parsed fence-aware: `### Step` text inside a `New Code` code block is not a step.

### `check-history`

`node code-loop.mjs check-history --dir specs/issue-<n> [--base origin/main]` closes the hole in a local file: `progress.json` can be deleted or rewritten, so the counter must not rely on it alone. The base defaults to `origin/main` and falls back to `main`. With git it reads `progress.json` on the base ref, then on every commit that touched it (`git log --reverse <base>..HEAD -- <path>`), then at `HEAD` and in the working tree, and exits 1 when:

- the file existed on the base but is missing at `HEAD`, in any commit, or in the working tree;
- `fixLoop.attempts` or any step's `attempts` is lower than in the previous version, or a step was removed (this also catches a rewrite hidden by an earlier commit with higher attempts);
- `fixLoop.limit` was raised;
- `planSha256` changed after Code started. A `progress.json` with no step started and no attempt recorded is exempt, because the loop re-reads an untouched plan.

The `verification-pipeline` `verify.yml` runs it for every work item whose `progress.json` is in the pull request or on the base branch, using the base branch's copy of the controls.

---

## 6. Branch Rules (`branch-guard.mjs`)

- Agents work on short-lived branches created from `main` or `develop`: `^(feature|fix|chore)/issue-\d+-[a-z0-9]+(?:-[a-z0-9]+)*$`, for example `feature/issue-42-add-roles`.
- An agent never commits to `main`, `develop`, or `release/*`.
- The branch age is the author date of the first commit not on the base (`--base`, default `main`). It must not exceed `--max-age-days` (default 5). Long-running branches create merge conflicts that break agentic context.
- In CI the base and the branch must be fetched (`fetch-depth: 0`). The guard falls back to `origin/<name>` when a local branch is missing.

---

## 7. Agent Boundaries

1. Developers do not write code by hand. A wrong pattern is fixed by correcting Persistent Context, not the code.
2. Green before PR: never open a pull request with a failing build, type check, lint, test, or control.
3. Tests derive from the plan's acceptance criteria and carry the `AC-<n>` id in their name.
4. Never write outside the step's `Files`. Never weaken, skip, or edit a control.
5. A new dependency is declared in the plan first and reported in the pull request.
6. Never set Human Validation, never use production credentials.
7. When the agent misunderstands a pattern, it records a **context correction suggestion** (which Persistent Context file, which rule) as a pull request or issue comment and stops, instead of hand-fixing the code.

---

## 8. Exit Gate

A work item leaves Code when `pr-record`'s `validate-pr.mjs --stage code` exits 0: the plan approved by a Developer, every step done, attempts within the limit, every acceptance criterion traced in the pull request, links resolving, and Human Validation still `Pending`. The trace is the agent's claim: `criteria-verify` proves from the test reports that each criterion has a passing test, and runs in the loop and again in Prove.
