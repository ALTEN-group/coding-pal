---
name: dependency-guard
description: 'Mechanically prevent agents from introducing unvetted, unprompted, or banned dependencies into package.json manifests by comparing working tree changes against git HEAD.'
license: MIT
---

# Dependency Guard

Blast-radius control for project dependencies, preventing unapproved package bloat and banned libraries.

## When to Use This Skill

- An AI agent edits `package.json` to install or modify dependencies.
- A project enforces a zero-new-dependencies policy unless explicitly requested by the user.
- A team wants to enforce bans on bloated or deprecated libraries (`moment`, `request`).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/dependency-guard/` or `.claude/skills/dependency-guard/`).

## Workflow

1. Read `references/dependency-contract.md` to review allowed vs. banned criteria.
2. Run the dependency guard against git changes:

```bash
# Check git working tree changes against HEAD
node scripts/dependency-guard.mjs --git

# Allow specific user-authorized new packages
node scripts/dependency-guard.mjs --git --allow "zod,dotenv"

# Run with JSON output for automated agent ingestion
node scripts/dependency-guard.mjs --git --json
```

3. If the guard detects unauthorized packages:
   - Remove the package from `package.json`.
   - Implement the feature using native language runtime utilities or existing packages.
   - Re-run until the command exits with code 0.

## Done When

- `scripts/dependency-guard.mjs` exits with code 0.
- Zero unauthorized or banned packages are introduced.
