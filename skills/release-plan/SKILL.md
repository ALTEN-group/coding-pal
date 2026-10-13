---
name: release-plan
description: 'Structure, author, validate, and execute the release declaration (release.md) for one change: immutable versioned artifact, rollout stages, health and business thresholds, named rollback, and the outcome metric handed to Learn, plus a deterministic promote/hold/rollback decision for each rollout stage. Use when a Release Planner agent or DevOps drafts a release before deployment, when CI validates release readiness on a tag, or when a rollout pipeline evaluates a stage.'
license: MIT
---

# Release Plan

Produce deterministic `release.md` declarations that DevOps can approve quickly and the rollout pipeline can execute without judgement calls. AI drafts and proposes thresholds; DevOps decides. Promotion and rollback are computed by a script against thresholds declared before deployment.

## When to Use This Skill

- A merged change must be declared for release: tier, artifact, flag, rollout stages, thresholds, rollback, and outcome metric.
- CI must gate a release tag by validating `release.md` against `think.md` and `plan.md`.
- A rollout pipeline must decide, for one stage, whether to promote, hold, or roll back.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/release-plan/` or `.claude/skills/release-plan/`, use that base path.

## Workflow

1. **Read `references/release-contract.md` now.** It is the authoritative source for headings, fields, stage shapes per tier, threshold rules, and rollback mechanisms.
2. Draft `release.md` from `think.md` (tier and rollback), `plan.md` (raised tier, file scope), and the Triage hypothesis (outcome metric). Propose thresholds from the tier defaults in the contract. Never invent a baseline: take it from the Triage evidence or leave a question.
3. Validate with the deterministic script from this skill's directory:

```bash
node scripts/validate-release.mjs --release specs/issue-42/release.md \
  --think specs/issue-42/think.md --plan specs/issue-42/plan.md

# Or the whole work item directory, plus the git tag in CI
node scripts/validate-release.mjs --dir specs/issue-42 --tag v1.4.0
```

Treat a nonzero validator exit as invalid output and fix the file rather than ignoring errors. Model compliance is advisory; the script is the enforcement gate.

4. In the rollout pipeline, decide each stage with no AI:

```bash
node scripts/evaluate-rollout.mjs --release specs/issue-42/release.md --stage canary-5 --metrics metrics.json
```

Exit code 0 means promote, 2 means hold, 1 means rollback or error. On rollback the JSON names the mechanism from the breached threshold.

5. Copy `references/release.yml` to `.github/workflows/release.yml` and replace every `PLACEHOLDER`. It validates the declaration on the tag, builds the immutable artifact, deploys to staging, loops `evaluate-rollout.mjs` through the production stages, then enables the flag.
6. DevOps approves `release.md` before the tag is pushed. The agent never deploys, never holds production credentials, and never disables or loosens a threshold.

## Done When

- The validator accepts `release.md` with exit code 0, using `--think` and `--plan` (or `--dir`) whenever those records exist.
- One issue, a versioned immutable artifact, every threshold with a named rollback, and an outcome metric (or a stated reason for none) are declared.
- No sign-off, deployment, or production credential came from the AI.
