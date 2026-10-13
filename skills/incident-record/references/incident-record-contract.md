# Incident Record Contract

An incident record is the written memory of one production fault: how it was detected, how fast it was mitigated, what caused it, how it was repaired with a failing test first, and which control should have caught it. It lives next to the code and feeds the Learn stage's exit gate: a loss becomes a Triage issue.

AI correlates and drafts. **Humans conclude.** A cause without a named person who concluded it, or a rollback without a named person who decided it, is invalid.

---

## 1. Directory & Naming

- Path: `docs/incidents/<YYYY-MM-DD>-<slug>.md`. The date is the `Detected At` date (UTC). The slug is lowercase ASCII with hyphens, for example `2026-10-13-checkout-5xx.md`.
- UTF-8 without BOM.

---

## 2. Structure

### Required Document Structure (In Exact Order)

1. `# Incident: <title>`
2. `## Summary`
3. `## Detect`
4. `## Mitigate`
5. `## Diagnose`
6. `## Repair`
7. `## Learn`
8. `## Ambiguities & Open Questions`

No other level-two headings. Fields are bullets `- **<Label>:** <value>`. Timestamps are ISO 8601 UTC (`2026-10-13T09:30:00Z`).

### `## Summary`

| Label | Content |
|---|---|
| `Severity` | `SEV1`, `SEV2`, or `SEV3` |
| `Tier` | Blast radius tier: `Low`, `Medium`, `High`, or `Critical` |
| `Detected At` | When the alert fired or the customer reported it |
| `Mitigated At` | When the customer impact stopped |
| `Resolved At` | When the fix was in production |
| `Rollback Decided By` | `<name> (DevOps)` or `<name> (QA and maintainer)` |

`Detected At <= Mitigated At <= Resolved At`.

### `## Detect`

How the fault was detected (alert, probe, customer report). Not empty.

### `## Mitigate`

- `Mechanism`: `flag off`, `rollback`, or `forward fix`. Add free-text detail as another bullet.

Mitigation comes first: stop the impact, then diagnose.

### `## Diagnose`

| Label | Content |
|---|---|
| `Diagnosis Started At` | At or after `Mitigated At`, and not after `Resolved At` |
| `Cause` | The conclusion in one or two sentences |
| `Evidence` | Logs, traces, deploys, and diffs that were correlated (mention at least one) |
| `Concluded By` | `<name> (QA and maintainer)`, `<name> (Developer)`, or `<name> (DevOps)` |

AI may correlate the evidence and propose the cause. A person concludes.

### `## Repair`

| Label | Content |
|---|---|
| `Reproducing Test` | Workspace-relative path in backticks, `/` separators, no `..` |
| `Failed Before Fix` | `yes`: the test failed before the fix |
| `Passes After Fix` | `yes` |
| `Test Commit` | Hexadecimal commit id (7 to 40 characters) |
| `Fix Commit` | Hexadecimal commit id, different from `Test Commit` |
| `Commit Order` | `test <timestamp>, fix <timestamp>`: the test commit is strictly earlier, not before `Diagnosis Started At`, and the fix is not after `Resolved At` |

The repair is test first: add a test that reproduces the defect, confirm it fails, fix the defect, confirm it passes.

### `## Learn`

| Label | Content |
|---|---|
| `Review Date` | ISO date, Monday to Friday, within 5 working days after the `Resolved At` date |
| `Reviewed By` | `<name> (<role>)` with a role from `Product Owner`, `Developer`, `Architect`, `DevOps`, `QA and maintainer` |
| `What Should Have Caught This` | What reached production that a control should have caught |
| `Control Hardening` | Nested items `<guard\|gate\|contract\|probe>: <what to add>`, or `None: <reason>` on the same line |
| `Triage Issue` | `#<number>` of the issue that carries the hardening. `_None._` only when `Control Hardening` is `None`. `Pending` is accepted only at the `draft` stage |
| `Postmortem Actions` | Nested items `<action> (owner: <name>)`, or `_None._` |

```markdown
- **Control Hardening:**
  - gate: require the mutation score bar on the order-total module
  - probe: add a preview smoke check that submits a gift-card-only basket
- **Triage Issue:** #57
- **Postmortem Actions:**
  - Document the zero-item basket rule in the checkout glossary (owner: Sam Lee)
```

Every defect, rollback, or near-miss is asked: what reached production that a control should have caught? A missing check becomes a **guard**, **gate**, **contract**, or **probe**. A signal that arrived too late becomes an earlier **probe**.

### `## Ambiguities & Open Questions`

Open questions, or the exact literal `_None._`.

---

## 3. Validation (`scripts/validate-incident.mjs`)

```bash
node scripts/validate-incident.mjs --file docs/incidents/2026-10-13-checkout-5xx.md --tests-dir tests
node scripts/validate-incident.mjs --file <incident.md> --stage draft
```

| Check | Why |
|---|---|
| Exact headings and order, `# Incident:` title | Predictable for readers and for `learn-signals` |
| Enumerated severity, tier, mechanism, roles | Comparable incidents and a real owner |
| `Detected <= Mitigated <= Resolved` | A believable timeline |
| `Diagnosis Started At >= Mitigated At` | Mitigation precedes diagnosis |
| `Concluded By` and `Rollback Decided By` name a person and a role | Humans conclude and decide |
| `Rollback Decided By`, `Concluded By`, and `Reviewed By` name a real person: AI and bot names (`copilot`, `claude`, `gpt`, `gemini`, `bot`, `agent`, `dependabot`, `renovate`, `github-actions`, `ai`, `llm`, and similar) and placeholders (`x`, `tbd`, `<name>`, a bare role) are rejected | AI proposes, humans decide |
| Evidence mentions logs, traces, deploys, or diffs | The cause is correlated, not guessed |
| `Reproducing Test` path, and with `--tests-dir` it exists there | The defect has a test |
| `Failed Before Fix: yes`, `Passes After Fix: yes`, test commit strictly before fix commit | A failing test first |
| `Review Date` on a weekday within 5 working days after `Resolved At` | The review actually happens |
| `Control Hardening` items typed, or `None` with a reason | A loss either hardens a control or says why not |
| `Triage Issue` consistent with `Control Hardening` | The loop closes in Triage |
| Postmortem actions each have an owner | Actions get done |
| File name `<YYYY-MM-DD>-<slug>.md` with the `Detected At` date | Findable, sortable |

`--stage draft` accepts `Triage Issue: Pending`, so `learn-signals` can emit the issue before its number is known. CI runs the default `final` stage.

On success the script prints **time to restore** (`Detected At` to `Mitigated At`, minutes) against the factory target of under 15 minutes. A missed target is reported, not rejected: it is a metric, not a validity rule.

---

## 4. Anti-Patterns & Prohibitions

1. **No diagnosis before mitigation.** Flag off, roll back, or fix forward first.
2. **No AI conclusions.** The agent drafts from the timeline notes and correlated evidence. A named person concludes.
3. **No fix without a failing test.** The test commit precedes the fix commit.
4. **No blame.** Record causes and controls, not culprits.
5. **No credentials in the record.** Run `secret-guard` before committing.
6. **Production is not the agent's.** The agent never mitigates, never holds production credentials, and never executes a rollback.
