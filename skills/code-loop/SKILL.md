---
name: code-loop
description: 'Drive the Code stage one plan step at a time with persistent progress, enforce the fix-loop limit, and guard agent branches. Use when a Code agent implements a validated plan.md, when it records a step result or failure, or before committing to check the branch is short-lived and correctly named.'
license: MIT
---

# Code Loop

Make the Code stage deterministic: one plan step per turn, recorded in `progress.json`, bounded by a fix-loop limit the agent cannot reset, on a short-lived branch. AI implements; the Developer steps in only when the limit is reached.

## When to Use This Skill

- A Code agent implements a validated `plan.md` and must record each step's result.
- A step fails its checks and the failed attempt must be counted against the fix-loop limit.
- Before committing, the agent must prove it is on a short-lived, correctly named branch.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/code-loop/` or `.claude/skills/code-loop/`, use that base path. Run the scripts from the repository root (so `specs/` paths resolve) and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/code-loop-contract.md` now.** It is the authoritative source for the loop, the `progress.json` state, the fix-loop limit, and the branch rules.
2. Check the branch before the first commit (use `--base develop` for a branch created from `develop`):

```bash
node <skill-dir>/scripts/branch-guard.mjs --git --base main --max-age-days 5
```

3. Drive the loop, one step per turn:

```bash
node <skill-dir>/scripts/code-loop.mjs next   --dir specs/issue-42
node <skill-dir>/scripts/code-loop.mjs start 1 --dir specs/issue-42
# apply the step's New Code, run its Verification and Bootable Check, then the controls
node <skill-dir>/scripts/code-loop.mjs pass 1  --dir specs/issue-42
# or, when anything fails:
node <skill-dir>/scripts/code-loop.mjs fail 1  --dir specs/issue-42 --reason "AC-2 test returns 200, expected 403"
node <skill-dir>/scripts/code-loop.mjs status --dir specs/issue-42
node <skill-dir>/scripts/code-loop.mjs check-history --dir specs/issue-42   # git: the counters were never lowered (CI runs it too)
```

4. Treat a nonzero exit as a stop. After the fix-loop limit, make no further attempts and escalate. If Plan changes after Code starts, stop and revalidate it before restarting. Approval requires explicit `Automated by <identity> on YYYY-MM-DD` attribution or actual human approval; never fabricate a person's signature.
5. When every step is `done`, open the pull request with the `pr-record` skill and validate it with `--stage code`.

## Done When

- `code-loop.mjs status` shows every plan step `done` and fix-loop attempts within the limit.
- `code-loop.mjs check-history` exits with code 0.
- `branch-guard.mjs` exits with code 0 for the working branch.
- Nobody edited `progress.json` or `plan.md` by hand.
