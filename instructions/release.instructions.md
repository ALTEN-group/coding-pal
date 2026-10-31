---
description: "Normative standards for release declarations (release.md) and release workflows. Applies when authoring, reviewing, or consuming release.md or .github/workflows/release*.yml."
applyTo: "**/release.md,**/.github/workflows/release*.yml"
---

# Release Standards

When authoring or validating a release declaration, follow the installed `release-plan` skill (read its `references/release-contract.md`).

## Roles

- **Autonomous release.** The `Owner` remains `DevOps` for accountability, not as a mandatory sign-off gate. The pipeline authorizes release after deterministic validation and records the automated decision and evidence. Never claim a human approved it. Keep rollout thresholds, rollback requirements, and retry limits enforced at every risk tier; escalate failed controls that cannot be resolved automatically.
- **The rollout is deterministic.** Promotion, hold, and rollback come from `evaluate-rollout.mjs` against thresholds declared before deployment. No AI judges a rollout.

## Deploy Versus Release

- Deploying puts code in production switched off. Releasing is switching it on. The release decision flag is `enable` (or `<feature>.enable`), and it is turned on only after the last stage passes.
- Every release has an immutable, versioned artifact. Never `latest`, never rebuilt under the same version.
- A tag `v<version>` on `main` triggers the release. The tag, `Version`, and `Artifact` agree.

## Declare Before You Deploy

- Thresholds, watch windows, and rollback are in `release.md` before the first deployment. Never tune a threshold during a rollout to get it through.
- Follow the `release-plan` contract for stages and thresholds, the rollback section, and the tier cross-checks.

## Scoped Releases & Blast Radius

- Prefer focused releases linked to a primary issue (e.g. `#42` or `#42, #43`). Avoid holding unrelated changes for large batch releases, as batching multiplies blast radius and muddies Learn metrics.
- No vibes-based rollout. A person watching a dashboard and deciding by feel is not a gate. Promotion and rollback decisions are calculated deterministically from declared thresholds.

## Credentials And Scope

- No agent holds production credentials. Pipelines use short-lived OIDC tokens bound to the `production` environment. Never commit a long-lived production secret.
- The agent writes only `release.md`. Never edit the release workflow, deploy, tag, shift traffic, or toggle a flag.
- Hand the outcome metric to Learn as the `release-plan` contract specifies.
