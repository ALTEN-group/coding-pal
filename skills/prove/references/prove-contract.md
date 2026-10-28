# Prove Record Contract (`prove.md`)

The Prove record (`specs/issue-<n>/prove.md`) is the deterministic verification artifact of the **Prove** stage. It combines the results of the repository's deterministic controls with an independent semantic review of the pull request diff against `think.md` and `plan.md`.

---

## 1. Document Structure

`prove.md` must start with a level-one heading `# Prove: <Title>` followed by the header metadata fields, and then **exactly these five level-two headings, in this order**:

1. `## Deterministic Controls`
2. `## Criteria Verification`
3. `## Semantic Review`
4. `## Findings`
5. `## Verdict`

### Header Metadata (under `# Prove: <Title>`)

```markdown
# Prove: Add Role-Based Access Control

- **Issue:** #42
- **PR:** #108
- **Think:** `specs/issue-42/think.md`
- **Plan:** `specs/issue-42/plan.md`
- **Branch:** `feature/issue-42-rbac`
- **Base:** `main`
```

- `Issue`: `#<n>` matching the `issue-<n>` directory when present.
- `PR`: `#<pr>` (pull request number).
- `Think` and `Plan`: workspace-relative paths in backticks resolving to the work item's `think.md` and `plan.md`.
- `Branch` and `Base`: non-empty branch names in backticks (or plain text).

---

## 2. `## Deterministic Controls`

A Markdown table with columns `Control | Status | Evidence`:

```markdown
| Control | Status | Evidence |
|---|---|---|
| validate-think | PASS | think.md validated (Low blast radius) |
| validate-plan | PASS | plan.md validated and cross-checked with think.md |
| branch-guard | PASS | feature/issue-42-rbac matches short-lived branch convention |
| code-loop | PASS | All 3 steps done, fix-loop 0/5, history intact |
| control-guard | PASS | 0 control-weakening findings against origin/main |
| secret-guard | PASS | 0 hardcoded credentials in diff |
| dependency-guard | PASS | No unauthorized dependency changes |
| scope-guard | PASS | All modified files within plan.md In Scope globs |
| task-gate | PASS | test and build stages exited 0 |
| criteria-verify | PASS | AC-1, AC-2, AC-3 covered by passing tests |
| test-probe | PASS | Tests fail when src/ files are reverted to origin/main |
| preview-smoke | PASS | GET / returned 200 within latency budget |
| validate-pr | PASS | PR body validated at code stage |
```

- Every core control (`validate-think`, `validate-plan`, `branch-guard`, `code-loop`, `control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`, `validate-pr`) must appear once. Additional project controls (`mutation-bar`, `contract-compat`, `security-gate`) may also be included.
- `Status` is `PASS`, `FAIL`, or `N/A (<reason>)` (for example `N/A (no existing tracked src/** file modified)`).
- `Evidence` must be concrete, non-placeholder text.

---

## 3. `## Criteria Verification`

A Markdown table with columns `Criterion | Implementation Evidence | Test Evidence | Status`:

```markdown
| Criterion | Implementation Evidence | Test Evidence | Status |
|---|---|---|---|
| AC-1 | `src/sim.js:42` applies hazard damage tick | `tests/sim.test.mjs`: `AC-1 applies hazard damage` (PASS) | PASS |
| AC-2 | `src/sim.js:78` clamps health at 0 | `tests/sim.test.mjs`: `AC-2 clamps health at zero` (PASS) | PASS |
| AC-3 | `src/levels.js:19` exports sector hazard flag | `tests/levels.test.mjs`: `AC-3 validates hazard flag` (PASS) | PASS |
```

- Every `AC-<n>` defined in `plan.md` `## Acceptance Criteria` must appear once, in order, and no unknown criterion may appear.
- `Implementation Evidence` and `Test Evidence` must be non-empty, non-placeholder text when `Status` is `PASS`.
- `Status` is `PASS` or `FAIL`.

---

## 4. `## Semantic Review`

Evaluates the three Prove dimensions from the Agentic Software Factory governance model:

```markdown
- **Client Intent:** PASS — Implementation in `src/sim.js` and `src/levels.js` fulfills the issue requirements and chosen approach in `think.md` with no stubs or hardcoded shortcuts.
- **Behavioral Experience:** PASS — Player hazard damage ticks and HUD feedback behave as specified in `think.md` system flow across normal and boundary states.
- **Safety & Blast Radius:** PASS — Changes remain strictly inside declared `In Scope` files at Low blast radius; existing level and simulation invariants hold.
```

- Exactly these three fields: `Client Intent`, `Behavioral Experience`, `Safety & Blast Radius`.
- Each field value starts with `PASS — ` (or `PASS: ` / `PASS - `) or `FAIL — ` (or `FAIL: ` / `FAIL - `) followed by substantive evidence (at least 15 characters).
- The phrase `line by line` or `line-by-line` is rejected anywhere in `prove.md`: governance bans line-by-line review as a gate.

---

## 5. `## Findings`

When every control, criterion, and semantic review dimension passes:

```markdown
_None._
```

When one or more checks fail, list numbered findings (`FINDING-1`, `FINDING-2`, ...):

```markdown
- **FINDING-1:** [criteria-verify / AC-2] `src/sim.js:78` — Health can drop below 0 when damage exceeds current health; clamp `player.health = Math.max(0, player.health - dmg)` and add assertion in `tests/sim.test.mjs`.
```

- Each finding starts with `- **FINDING-<n>:**` numbered sequentially from 1.
- Each finding must state what failed, where (`<file>:<line>` or control name), and what must be fixed.

---

## 6. `## Verdict`

```markdown
- **Status:** PASS
- **Summary:** All 13 deterministic controls passed, AC-1 through AC-3 are verified in code and tests, and semantic review confirmed Client Intent, Behavioral Experience, and Safety & Blast Radius.
```

- `Status`: `PASS` or `FAIL`.
- `Summary`: non-placeholder explanation of the verdict.
- **Consistency Invariants**:
  - `Status: PASS` is allowed **only** when zero controls have `Status: FAIL`, every `AC-<n>` has `Status: PASS`, all three Semantic Review dimensions start with `PASS`, and `## Findings` is `_None._`.
  - `Status: FAIL` requires at least one `FAIL` in Controls, Criteria, or Semantic Review, and at least one `- **FINDING-1:**` entry in `## Findings`.
  - With `--stage pass`, `validate-prove.mjs` exits 0 only when `prove.md` is valid **and** `Verdict` `Status` is `PASS`.
