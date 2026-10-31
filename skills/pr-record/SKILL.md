---
name: pr-record
description: 'Author and validate the pull request record: links to the backlog issue, plan, and think record, acceptance-criteria traceability, declared dependencies, blast radius, and Human Validation. Use when a Code agent opens a pull request (Code exit gate), when CI gates a pull request, or when checking the Prove human validation record for a blast radius tier.'
license: MIT
---

# Pull Request Record

Make the pull request a deterministic record: what it closes, which criteria it proves, which dependencies it adds, how risky it is, and how it was validated. Code opens it with legacy Human Validation fields Pending; independent Prove records automated validation after its controls pass.

## When to Use This Skill

- A Code agent finished all plan steps and must open the pull request.
- CI must gate the pull request before Prove (`--stage code`).
- CI checks the validation record before merge (`--stage prove --allow-auto-prove` for autonomous delivery).

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

Treat a nonzero exit as an invalid pull request and fix the body. Code accepts explicitly automated Plan approval (`Automated by <identity> on YYYY-MM-DD`) as well as actual human approval. At Code, leave legacy Human Validation fields Pending. After independent Prove passes, use `--stage prove --allow-auto-prove` for autonomous validation at every tier; follow the contract's rollback and staged-rollout requirements. Never impersonate a human or claim line-by-line review.

## Done When

- `validate-pr.mjs --stage code` exits with code 0 for the agent's pull request.
- Legacy Human Validation fields stay Pending during Code, then record evidence-backed automated results during Prove (or actual human confirmations when requested).
- At `--stage prove`, the validators required by the blast radius tier are recorded and the validator exits with code 0.
