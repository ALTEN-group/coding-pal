---
name: context-health
description: 'Check the health of Persistent Context and prepare the weekly Persistent Context & Controls review: lint instruction files (missing description, broad applyTo, the everything instruction, near-duplicates, dangling skill/agent/prompt references, secrets, stale files, count growth) and keep an append-only corrections log that proposes new artifacts for topics corrected or re-explained twice. Use when auditing instructions or preparing the review pack.'
license: MIT
---

# Context Health

Keep Persistent Context small, specific, scoped, current, and secret-free, and let evidence decide what to add: a topic corrected or re-explained twice becomes a proposed artifact.

## When to Use This Skill

- The weekly Persistent Context & Controls review needs its pack.
- An instruction file was added or changed and CI should lint it.
- A reviewer corrected or re-explained the same thing again and it should be logged.
- Someone asks whether the instruction set is growing without pruning.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/context-health/` or `.claude/skills/context-health/`, use that base path.

## Workflow

1. **Read `references/context-health-contract.md` now.** It lists the rules, severities, the baseline format, and the log format.
2. Lint the consumer repository from this skill's directory:

```bash
node scripts/context-lint.mjs --root . --baseline context-baseline.json
```

Fix errors (missing description, dangling references, secrets). Rotate a reported secret, do not only delete it. Report warnings (long, duplicate, stale, growth) for the Architect to decide.

3. Log a correction or re-explanation as soon as it happens:

```bash
node scripts/context-corrections.mjs add --log specs/learn/corrections.jsonl \
  --topic "Use named exports" --source "PR #123"
```

4. Before the review, list the topics that earned an artifact:

```bash
node scripts/context-corrections.mjs propose --log specs/learn/corrections.jsonl --min 2
```

5. Add control signal-to-noise findings **only as the user supplies them** (how often a control fires and is bypassed). Never invent numbers.
6. `--write-baseline` is a human decision made in a pull request, not something to run to silence the growth warning.

## Done When

- `context-lint.mjs` exits 0 (no errors) on the repository.
- Every proposal comes from the corrections log, and each is presented as a proposal for the Architect.
- No file was changed to hide a finding: no rewritten baseline, no deleted log line.
