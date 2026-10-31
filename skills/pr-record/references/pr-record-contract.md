# Pull Request Record Contract

The pull request is the work item record and Code exit gate. Its body is validated at Code and again after independent Prove assessment. The historical `Human Validation` heading is retained for compatibility; it does not mandate human sign-off.

AI decides and validates autonomously at every risk tier. **Automation never claims a human sign-off.** At `code`, the legacy `Human Validation` fields remain `Pending`. At `prove`, `--allow-auto-prove` / `ALLOW_AUTO_PROVE=1` enables explicitly automated results after the independent Prove report and deterministic controls pass. Existing human validation formats remain supported for requested review checkpoints.

### Autonomous Prove at every tier

- Set `Client Intent`, `Behavioral Experience`, and `Safety & Blast Radius` to `Auto-merge` only after a validated passing Prove report provides their evidence.
- High and Critical also require `Rollback Validated: <exact rollback mechanism from Think>; Automated verification`, backed by actual rollback verification evidence in the Prove report.
- Critical also requires `Joint Sign-off: Automated verification` (not a human signature) and a non-placeholder `Staged Rollout` reference.
- Missing rollback/rollout evidence still blocks merge; autonomy is not a waiver.
- An automated plan uses `Approved By: Automated by <identity> on YYYY-MM-DD`; no mandatory Developer sign-off is required.

---

## 1. Body Structure

Exactly these level-two headings, in this order. HTML comments are ignored, so guidance in the template does not count as content.

1. `## Links`
2. `## Acceptance Criteria Traceability`
3. `## Dependencies`
4. `## Blast Radius`
5. `## Human Validation`

### `## Links`

```markdown
- **Closes:** #42
- **Plan:** `specs/issue-42/plan.md`
- **Think:** `specs/issue-42/think.md`
```

- `Closes`: `#<n>`. For a work item directory named `issue-<n>` the number must match.
- `Plan` and `Think`: workspace-relative paths in backticks, no `..`, no spaces. They must exist and be the `plan.md` and `think.md` of the work item being validated (`--dir`).

### `## Acceptance Criteria Traceability`

```markdown
| Criterion | Test | Status |
|---|---|---|
| AC-1 | tests/routes/role.test.js: AC-1 rejects unauthenticated requests | Passing |
```

- Exactly these columns.
- Every `AC-<n>` of `plan.md` appears once, and only plan criteria appear.
- `Test` is a real test reference (not empty or a placeholder). `Status` is `Passing` for every row.

### `## Dependencies`

`_None._`, or one bullet per new dependency:

```markdown
- **zod:** Request validation. MIT licence, no known advisories at the pinned version.
```

- Each entry has a reason that records its security and licensing evaluation.
- Each declared dependency appears in `plan.md`: dependencies are bounded by the plan.
- With `--added-deps "a,b"` (for example from `dependency-guard` output or the manifest diff) every added dependency must be declared here.

### `## Blast Radius`

```markdown
- **Tier:** High
- **Rollback:** Revert the merge commit and redeploy the previous image tag.
```

- `Tier` equals the effective tier: the tier in `think.md`, or the higher tier when `plan.md` records `Raised to <tier>` in its Blast Radius Check.
- `Rollback` is required for `High` and `Critical`, and contains the rollback mechanism text recorded in `think.md` (whitespace and case are ignored). If `think.md` has none for those tiers, the Architect records one in Think first. For `Low` and `Medium`, use `_None._` or a short note.

### `## Human Validation`

Only the fields listed here, one per line as `- **<Field>:** <value>`, with no other text.

| Tier | Fields |
|---|---|
| Low, Medium | `Client Intent`, `Behavioral Experience`, `Safety & Blast Radius` |
| High | the three above + `Rollback Validated` |
| Critical | the three above + `Rollback Validated`, `Joint Sign-off`, `Staged Rollout` |

The three questions: **Client Intent** (does it do what the client asked), **Behavioral Experience** (does it feel right in the preview environment), **Safety & Blast Radius** (access boundaries, data, and what breaks if it is wrong).

---

## 2. Stages

### `code` stage (Code exit gate)

`validate-pr.mjs --stage code` checks the five sections above plus:

- `progress.json` exists, its `planSha256` matches `plan.md`, every plan step is `done` with `verifiedAt`, step attempts add up to `fixLoop.attempts`, attempts do not exceed the limit, and the limit is at most 5 (`--max-fix-loop` defaults to 5 and can only lower it). Step attempts are non-negative integers and the steps are numbered 1 to the plan's step count.
- Plan carries valid `Automated by <identity> on YYYY-MM-DD` approval, or an actual human Developer approval. Explicit legacy pending-approval mode remains supported; it is not an approval.
- Every Human Validation field is exactly `Pending`.

### `prove` stage (optional human validation mode)

`validate-pr.mjs --stage prove` checks the five sections plus the validation record. A confirmation is:

```text
Confirmed by <name> (<role>) on YYYY-MM-DD
```

- `<role>` is exactly one of `Product Owner`, `Developer`, `Architect`, `DevOps`, `QA and maintainer`.
- `<name>` is a person. Names such as `Code Agent`, `Copilot`, `dependabot[bot]`, or `<name>` are rejected.
- The date is a real date and is not before the **PR record date**: `--pr-date`, or the latest `verifiedAt` date in `progress.json`.

Required validators by tier (from the governance page):

| Tier | Required |
|---|---|
| Low | Each of the three questions is `Auto-merge` (all controls green, no named person needed), or each is confirmed by a Developer |
| Medium | Each of the three questions is confirmed by a Developer |
| High | Dual validation: each question confirmed by a Developer or an Architect, with at least one of each, and they are different people. `Rollback Validated` (below) |
| Critical | Each question confirmed by a Developer, Architect, or Product Owner. `Joint Sign-off: Confirmed by <name> (Architect) and <name> (Product Owner) on YYYY-MM-DD` (two different people, either order). `Staged Rollout:` a reference to the staged rollout plan. `Rollback Validated` as for High |

### `Rollback Validated` (High and Critical)

```text
Rollback Validated: <mechanism> by <name> (DevOps) on YYYY-MM-DD; <name> (Product Owner) on YYYY-MM-DD
```

- A named **DevOps** person first, then a named **Product Owner**. The two are different people, the role strings are exact, and AI, bot, or placeholder names are rejected. Both dates are real and not before the PR record date.
- `<mechanism>` must overlap the `Rollback` text recorded in `think.md` (whitespace and case ignored).
- The factory has no project manager role, so the Product Owner is the role that stands for the business side of the rollback validation.

### Line-by-line review is not a gate

The phrase `line by line` or `line-by-line` anywhere in Human Validation is an error at both stages. Deterministic controls and independent assessment validate intent, behaviour, and safety; routine human diff review is not a gate.

---

## 3. Template

`references/pull_request_template.md` is a copy-and-customise template. Install it as `.github/pull_request_template.md`. Keep the headings and fields; replace the placeholders. Remove the fields your tier does not use, and add the High or Critical fields when the tier needs them.

---

## 4. CI Pattern

```bash
# on the pull request, after the agent opened it
node .agents/skills/pr-record/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage code --added-deps "zod"

# when the people have validated (for example on the label `validated` or before auto-merge)
node .agents/skills/pr-record/scripts/validate-pr.mjs --body pr.md --dir specs/issue-42 --stage prove --pr-date 2026-10-13
```

`pr.md` is the pull request body (for example `gh pr view --json body -q .body > pr.md`). Exit code 0 passes and 1 fails with a one-line message.
