---
name: task-gate
description: 'Execute multi-stage verification pipelines (linting, type checking, test suites, schema validation) and emit structured diagnostics for agent self-repair before declaring completion.'
license: MIT
---

# Task Gate

Turn an agent's completion criteria into an executable pipeline that certifies task correctness and generates structured failure diagnostics.

## When to Use This Skill

- An AI coding agent has completed a code modification or refactoring and must verify that lint, build, types, and narrow tests all pass before declaring `Done When`.
- A multi-agent orchestrator or CI pipeline needs to run sequential checks with fail-fast semantics and capture the exact failure snippet for automated self-repair.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/task-gate/` or `.claude/skills/task-gate/`).

## Workflow

1. Read `references/gate-contract.md` for configuration schema and diagnostic format.
2. Execute the task gate with ad-hoc stages or a configuration file:

```bash
# Ad-hoc stages
node scripts/task-gate.mjs --stage "lint:npm run lint" --stage "tests:npm test"

# Run with JSON output for automated agent ingestion
node scripts/task-gate.mjs --stage "types:npx tsc --noEmit" --stage "tests:npm test" --json

# Run with a declarative config
node scripts/task-gate.mjs --config gate.json
```

3. If any stage fails:
   - Ingest the `errorSnippet` from stdout/stderr.
   - Self-repair the identified issue.
   - Re-run the task gate until exit code is 0.

## Done When

- `scripts/task-gate.mjs` exits with code 0.
- All declared verification stages succeed.
