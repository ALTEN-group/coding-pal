# Delivery Pipeline

The delivery pipeline turns a GitHub issue into a merged, released change with AI agents and deterministic controls:

**Think → Plan → Code → Prove → Release**

Application repositories (Megadex, Foxnox, Gatelin) call reusable workflows of this repository from thin caller files. The agents, instructions and skills the workflows use live in this same repository and are checked out at the **same ref as the running workflow**, so a pinned engine version always runs the matching validators and agents.

## Architecture

| Layer | Where | What |
|---|---|---|
| Engine | `.github/workflows/pipeline-*.yml`, `audit-runner.yml` | Reusable workflows (`workflow_call`) |
| Primitives | `agents/`, `skills/`, `instructions/` | Stage agents, validators, gate scripts, stack standards |
| Installer | `scripts/factory/install-primitives.sh` | Installs the stage's primitives plus the stack standards detected from the repository files |
| Callers | `templates/callers/*.yml` → each application's `.github/workflows/` | Triggers, `project_title`, deployment settings |
| Bootstrap | `scripts/factory/bootstrap.sh` | Labels, Project boards, milestones and caller files (dry run by default) |
| Tests | `tests/workflows_test.rb`, `skills/*/scripts/*.test.mjs` | Regression tests, run by `CI - Workflow tests` and `test-skills` |

Callers pin the engine by tag (`@v1`), never by `main`.

## Start, pause and resume

Add a stage label to an open issue:

| Label | Runs through | Stops at |
|---|---|---|
| `1-think` | Think | `# Think:` specification comment |
| `2-plan` | Plan | `# Plan:` comment |
| `3-code` | Code | Open or updated pull request |
| `4-prove` | Prove | Validated and approved PR, **before merge** |
| `5-release` | Think → … → Release | Merge, release, container images and docs published, then Done |

- Add `pause:think|plan|code|prove` (or tick `Pause after …` in the issue body) to stop after a phase.
- **Think and Plan run in parallel** across issues. **Code onward is single-flight per repository**: the `ready` label means "the pipeline may start this issue"; after a merge the chain starts the next `ready` issue (same milestone first, then lowest number).
- Failures flag the issue `needs:developer` and comment the reason.

## Project board

Each repository has a Project V2 board named like the repository, with the `Status` options `Triage, Think, Plan, Code, Prove, Release, Done`. Labels start work; `Status` reports the phase entered. Disable the board's built-in "closed → Done" automations: only the pipeline sets Done.

## Prove

Eight deterministic controls (`control-guard`, `secret-guard`, `dependency-guard`, `scope-guard`, `task-gate`, `criteria-verify`, `test-probe`, `preview-smoke`), up to five auto-remediation loops, an independent review, approval and a squash merge. A build gate only runs when the repository has a `build` script.

## Release (services)

Release means **a GitHub Release plus container images**:

1. After the PR merges, the pipeline decides the version bump. Labels, titles and the milestone name set the floor (`feat` → minor, `fix` → patch, `breaking` / `release:major` → major, a version-named milestone declares its level). **Evidence can only raise it:** the OpenAPI spec (`swagger/src/*.openapi*.json`), Liquibase changesets under `db/liquibase/`, and the `docker/conf/.env.*.example` templates are diffed against the previous release tag. A major derived from evidence alone stops with a comment asking for the `breaking` label. See `skills/release-bump/SKILL.md`.
2. `main` is protected, so the bump travels in a **release PR** (`release/vX.Y.Z`: `package.json`, lock files, `CHANGELOG.md`) merged through the pipeline identity's bypass.
3. The tag and GitHub Release are created on the merge commit with the pipeline token (a release created with the default `GITHUB_TOKEN` would not start other workflows).
4. The repository's `publish.yml` builds the images on `release: published`. The pipeline waits for it, and for the documentation deployment, before moving the issue to **Done**.

**Milestone trains:** issues sharing a GitHub milestone are held in *Release* (`# Release held`) until the last one merges, then ship as one release with one bump and one changelog. A milestone named like a version declares intent (`1.0.0` over `0.9.0` is a confirmed major). `release:now` ships what has merged so far. Pull requests that only change tests, docs, CI or other non-shipping files never release.

## Branch protection

Human pull requests need an approving review and a code-owner review. Pipeline pull requests (including release PRs) have no independent reviewer, so the pipeline account is a bypass actor of the `main` ruleset and Prove falls back to a comment when GitHub refuses a self-approval. Keep required status checks and the up-to-date requirement as the repository has them: Prove already merges the latest base into the branch and pins the merge to the validated head commit.

## Audits

Weekly audits (`dependency-leverage`, `dead-code`, `test-gap`, `docs-sync`, `a11y-audit`, `token-audit`) create **one GitHub Issue per consolidated finding** (label `audit:<agent>`), attach it to the board and set no trigger label, so findings wait for triage. Scheduled runs skip private repositories, repositories without recent commits and agents that already have ten open findings. `audit-fleet.yml` dispatches `audits.yml` across `FLEET_REPOS`; `harness-audits.yml` runs `token-audit` on this repository itself.

## Setup

1. Create the two organization Actions secrets and grant them to the application repositories and this one:
   - `COPILOT_GITHUB_TOKEN`: fine-grained token with the account permission *Copilot Requests*.
   - `PIPELINE_GITHUB_TOKEN`: fine-grained token on the organization with Actions, Contents, Issues and Pull requests read/write (Workflows write if the pipeline edits workflow files) and organization Projects read/write.
2. Bootstrap each repository (dry run first, then `--apply`):

```bash
bash scripts/factory/bootstrap.sh labels --repo ALTEN-group/Megadex --apply
bash scripts/factory/bootstrap.sh board --owner ALTEN-group --title Megadex --apply
bash scripts/factory/bootstrap.sh callers --out ../Megadex/.github/workflows --project-title Megadex --minute 19
```

3. Apply the `main` ruleset, add a first milestone named after the next version, then label an issue.

## Testing the pipeline

```bash
LC_ALL=en_US.UTF-8 ruby tests/workflows_test.rb
node --test skills/*/scripts/*.test.mjs
```

The Ruby suite checks shell syntax, token separation, resume checkpoints, the delivery queue, Project status updates, the release flow and the installer with a strict mock GitHub CLI and temporary directories; no live GitHub writes, agents or releases run. Permissions, agent runs, merges and releases still need a pilot in a disposable repository.
