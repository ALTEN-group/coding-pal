---
name: test-probe
description: 'Mechanically verify that AI-generated tests are genuinely falsifiable by temporarily unpatching source code to prove that tests fail when the bug is present, rejecting vacuous and tautological tests.'
license: MIT
---

# Test Probe

Anti-tautology and behavioral falsifiability probe for agent-generated tests.

## When to Use This Skill

- An AI coding agent has generated or updated unit tests to fix a bug, and must verify that the test actually catches the bug (and does not vacuously pass even when the bug is present).
- A workflow or CI step wants to mechanically certify test efficacy before merging.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (e.g. `.agents/skills/test-probe/` or `.claude/skills/test-probe/`).

## Workflow

1. Read `references/probe-contract.md` to review the inversion and certification lifecycle.
2. Run the probe specifying the narrow test command and the modified source file(s):

```bash
# Verify that the test fails when the fix is removed
node scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js"

# Run with JSON output for automated agent ingestion
node scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js" --json
```

3. If the probe exits with code 1:
   - A **Tautological Test** was detected: the test passed even with the bug unpatched!
   - Rewrite the test assertions to specifically target the remediated behavior.
   - Re-run until the probe exits with code 0.

## Done When

- `scripts/test-probe.mjs` exits with code 0.
- The test suite fails when source code is unpatched and passes when patched.
