---
name: pr-record
description: 'Author and validate the pull request record: links to the backlog issue, plan, and think record, acceptance-criteria traceability, declared dependencies, blast radius, and Human Validation. Use when a Code agent opens a pull request (Code exit gate), when CI gates a pull request, or when checking the Prove human validation record for a blast radius tier.'
license: MIT
---

# Pull Request Record

Make the pull request a deterministic record: what it closes, which criteria it proves, which dependencies it adds, how risky it is, and who validated it. AI opens it with Human Validation `Pending`; people validate it in Prove.

## When to Use This Skill

- A Code agent finished all plan steps and must open the pull request.
- CI must gate the pull request before Prove (`--stage code`).
- CI or a maintainer must check the human validation record before merge (`--stage prove`).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/pr-record/` or `.claude/skills/pr-record/`, use that base path. Run the scripts from the repository root (so `specs/` paths resolve) and write `<skill-dir>` as that install path.

## Workflow

1. **Read `references/pr-record-contract.md` now.** It is the authoritative source for the body sections, the Human Validation fields, and the required validators per blast radius tier.
2. Install `references/pull_request_template.md` as `.github/pull_request_template.md` once per repository, and customise it.
3. Write the body from the work item: the links, one traceability row per acceptance criterion with its test, the dependencies declared in the plan, the tier and rollback from `think.md`. Leave every Human Validation field `Pending`.
4. Validate from the repository root:

```bash
# Code exit gate (agent)
node <skill-dir>/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage code --added-deps "zod"

# Prove human validation record (people)
node <skill-dir>/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage prove --pr-date 2026-10-13
```

Treat a nonzero exit as an invalid pull request and fix the body. `--stage code` also needs a plan approved by a named Developer; the agent never fills in that approval. Never fill Human Validation as an agent, and never claim a line-by-line review.

## Done When

- `validate-pr.mjs --stage code` exits with code 0 for the agent's pull request.
- Every Human Validation field is `Pending` until a named person with a role confirms it.
- At `--stage prove`, the validators required by the blast radius tier are recorded and the validator exits with code 0.
