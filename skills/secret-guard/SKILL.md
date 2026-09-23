---
name: secret-guard
description: 'Mechanically prevent agents from introducing hardcoded credentials, cloud API keys, private key blocks, or platform tokens into git diffs or source code.'
license: MIT
---

# Secret Guard

Pre-commit and in-flight guard preventing accidental credential leaks and hardcoded secrets.

## When to Use This Skill

- An AI coding agent has edited code, configuration files, or test fixtures, and must verify that no sensitive credentials or tokens were hardcoded.
- A pre-commit hook or CI pipeline needs to mechanically scan git diffs for keys before merging.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/secret-guard/` or `.claude/skills/secret-guard/`).

## Workflow

1. Read `references/secret-contract.md` to review the credential detection patterns.
2. Run the secret guard against git changes or files:

```bash
# Scan git working tree changes against HEAD
node scripts/secret-guard.mjs --git

# Scan specific files
node scripts/secret-guard.mjs --file src/config.js

# Run with JSON output for automated agent ingestion
node scripts/secret-guard.mjs --git --json
```

3. If secrets are detected:
   - Replace hardcoded secrets with environment variables (`process.env.VAR`), secrets managers, or sanitized mocks.
   - Re-run until the command exits with code 0.

## Done When

- `scripts/secret-guard.mjs` exits with code 0.
- Zero credentials or private key blocks are present in modified lines.
