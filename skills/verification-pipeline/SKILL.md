---
name: verification-pipeline
description: 'Platform Rails delivery skeleton: copy-and-customize GitHub Actions templates (verify and remediate) that run the clean CI re-run, every deterministic control, the preview probes and the auto-remediation loop, plus rails-check to verify a project has them. Use when setting up a repository for the Agentic Software Factory or auditing that its pipeline has not drifted.'
license: MIT
---

# Verification Pipeline

The same verification skeleton for every repository: automated checks and controls in the agent's loop, then the same checks and controls again in CI, and an auto-remediation loop that stops at the fix-loop limit.

## When to Use This Skill

- A new repository needs the Platform Rails: `verify.yml`, `remediate.yml`, a pull request template, and the controls installed.
- A project must prove it still has the rails (CI check, onboarding review, drift audit).

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). If the skill was installed under `.agents/skills/verification-pipeline/` or `.claude/skills/verification-pipeline/`, use that base path.

## Workflow

1. **Read `references/verification-pipeline-contract.md`** for what each job does, what to customize, and what `rails-check` verifies.
2. Install the controls the pipeline runs (`apm install`) and list them in `apm.yml`.
3. Copy the templates into the project and customize only the lines marked `CUSTOMIZE`:

```bash
mkdir -p .github/workflows
cp references/verify.yml .github/workflows/verify.yml
cp references/remediate.yml .github/workflows/remediate.yml
```

4. Replace the `PLACEHOLDER` step in `remediate.yml` with the squad's agent runner. Add `.github/pull_request_template.md`. Put `.github/workflows/` under CODEOWNERS (Architect).
5. Verify the rails:

```bash
node scripts/rails-check.mjs --root . [--config rails.json]
```

6. Treat a nonzero exit as a missing rail. Each missing item is printed. Add it, never remove it from the config to pass.

## Done When

- `scripts/rails-check.mjs` exits with code 0 on the project root.
- `verify.yml` has the jobs `clean-rerun`, `controls`, and `preview`, and no step is allowed to fail silently.
- `remediate.yml` has an agent runner in place of the placeholder, no production secrets, and the fix-loop limit of 5.
