---
name: release-bump
description: "Choose the semver bump for Node.js service releases (release PR + tag + GitHub Release, Docker image built by publish.yml) from what actually ships (OpenAPI, Liquibase and env-template diffs vs the previous release tag), not from the issue title."
---

# Release Bump Skill

Used by the auto-release step of the delivery pipeline for Megadex, Foxnox, Gatelin and other services. A release is a **release PR** (version bump + CHANGELOG), the tag `vX.Y.Z[-alpha.N]` and a **GitHub Release**; the repo's own `publish.yml` builds the Docker images on `release: published`.

```bash
node skills/release-bump/scripts/classify-bump.mjs \
  --repo-root "$PWD" --prev-ref "<previous release tag, may be empty>" --current-version <X.Y.Z> \
  --title "<issue title>" [--title ...] [--milestone <name>] [--labels "a,b"] \
  [--openapi-glob ...] [--liquibase-glob ...] [--env-glob ...]
node skills/release-bump/scripts/prepare-release.mjs --version <targetVersion> --date <ISO> [--title <t>]... [--specs-dir specs/issue-N]
```

`classify-bump.mjs` prints `{ bump, reason, shippedChanges, needsConfirmation, evidence: { openapi, liquibase, env }, targetVersion }`; the workflow uses `targetVersion` verbatim. `prepare-release.mjs` bumps `package.json` / `package-lock.json` (and `admin/`, `web/` when they share the old version), writes the CHANGELOG section in the app's existing format, and prints the changed files as JSON. It is idempotent.

## Rules

Evidence is computed by comparing the files at `--prev-ref` with the working tree. It can only **raise** the level, never lower it.

| Evidence | Level |
| :--- | :--- |
| No shipped file changed (version-only `package.json` edits ignored) | `none` - no release |
| Shipped files changed, nothing below | `patch` |
| (a) OpenAPI (`swagger/src/*.openapi*.json`): added path/operation, optional parameter/property, response status | `minor` |
| (a) removed path/operation, removed or renamed required parameter, newly required parameter or request property, removed response property, narrowed enum, changed type | `major` |
| (b) Liquibase (`db/liquibase/**`): any new `changeSet` id | `minor` |
| (b) new changeSet with drop/rename/retype (`dropTable`, `dropColumn`, `renameColumn`, `modifyDataType`, `DROP `, `RENAME `...), reported `(destructive)`; edit of an already released changeSet, reported `(modified released changeSet)` | `major` |
| (c) env templates (`docker/conf/.env.*.example`): added variable with a default | `patch` |
| (c) added variable without a default (deployers must set it) | `minor` |
| (c) removed or renamed variable | `major` |
| No previous release (`--prev-ref` empty) | at least `minor` |

- Intent only raises the bump: `feat...` floors at minor, `fix...` at patch, `feat!:` / `BREAKING CHANGE` / label `breaking` or `release:major` floors at major. `release:minor` / `release:patch` labels also set floors.
- A **major** derived from evidence alone (no `breaking` / `release:major` / `!` marker, milestone not declaring a major) is not released: `needsConfirmation` is true, the step fails with an issue comment asking for the `breaking` label, then the release is re-run.
- `0.x` stable versions release breaking changes as `minor` (no confirmation needed).
- Prerelease versions (`-alpha.N`, `-beta.N`, `-rc.N`) release any shipped change as `prerelease` (`0.1.0-alpha.1` -> `0.1.0-alpha.2`), unless the milestone is the plain version of the current core (`0.1.0` while on `0.1.0-alpha.6`): then `bump` is `promote` and `targetVersion` is the milestone version.
- Globs default to the paths above; `**` and `*` only.

## Test, docs and CI PRs never release

`pr-ships.mjs` reads the merged PR's changed files on stdin and prints `true`/`false`. Shipped: `src/**`, `db/**`, `swagger/src/**`, `docker/conf/*.example`, dockerfiles, `admin/**` and `web/**` sources, `package.json` / `package-lock.json`, `tsconfig*.json`. Not shipped: tests (`tests/**`, `*.test.*`, `*.spec.*`, `**/e2e/**`), docs (`doc/**`, `website/**`, markdown), CI (`.github/**`), agent/IDE context (`.agents/**`, `.claude/**`, `.cursor/**`, `.vscode/**`), `specs/**`, `scripts/**`, `docker/*compose*`, `docker/restler/**`, non-example `docker/conf/*`. If nothing ships the issue gets `# No release` and the release step ends, even when main carries earlier unreleased changes: those wait for the next PR that changes shipped code, and the changelog of that release lists every shipping commit since the previous tag. Exceptions: a milestone train release, and the `release:now` label.

## Milestone release trains

Issues that share a GitHub milestone release together instead of one by one (`plan-batch.mjs`):

- Without a milestone an issue releases on its own right after merge.
- With a milestone, a merged issue is held in the **Release** column (comment `# Release held: milestone ...`). When the last open issue of the milestone merges, one release ships the whole train: one bump, one changelog (issue titles), one tag and GitHub Release, and every member moves to Done.
- A milestone named like a version declares the intent: `5.0.0` over a released `4.6.0` is a confirmed major (no `breaking` label needed); `4.7.0` floors at minor, `4.6.1` at patch. Evidence can still raise the level, never lower it.
- Labels and titles of all merged members count toward the floor. A milestone issue counts as merged when a merged PR from branch `feature/issue-<n>-*` exists.
- Add the `release:now` label to an issue to ship what is merged so far without waiting for the rest.

### Automatic milestones (audits)

`plan-milestone.mjs` picks the train for a new audit issue (one train at a time). Input: `latestReleaseTag` (or `latestVersion`), `title`, `labels`, open `milestones`.

- Issues that need no release (`test`, `docs`, `ci`, `style`, `build` titles) get no milestone.
- The level comes from the title and labels: `feat` = minor, `!` / `breaking` / `release:major` = major, everything else = patch. On `0.x` a major is a minor train (`0.5.0` -> `0.6.0`).
- An open milestone named like a version above the latest release is the train in progress: the issue joins it. If the issue needs a higher level than the train, the milestone is renamed up (`4.7.0` becomes `5.0.0`), never split.
- With no train in progress, a milestone is created at the next version for that level (`4.6.1` + patch = `4.6.2`, minor = `4.7.0`, major = `5.0.0`).
- When the latest release is a prerelease (`0.1.0-alpha.3`), its core `0.1.0` is the promotion train: patch and minor issues join `0.1.0`.
- No release yet or an unparseable tag: no automatic milestone. Issues created by hand are not assigned automatically.
- When the train releases (or ends with no release) its milestone is closed. A partial `release:now` release leaves it open.

### Single-flight chain and the `ready` label

Only one issue is in flight (Code -> Prove -> merge) at a time, repository-wide, so every issue is coded on a `main` that already contains the ones before it (`plan-chain.mjs`, no AI calls). A milestone does not change this; it only groups issues into one release.

- **`ready`** means "the pipeline may start this issue". Audits never set it; you do. Issues without it are never started automatically.
- **Chain:** after an issue merges, Prove starts a `ready` issue by adding `5-release` (and removing `ready`): first the lowest-numbered one in the same milestone as the merged issue, then the lowest-numbered one overall. It only does so when no other issue is in flight, meaning it carries a `3-code`/`4-prove`/`5-release` stage label.
- **Intercept:** at the top of Code, if another issue is in flight (an open pipeline PR *and* a stage label), the issue is parked as `ready` (stage labels removed, comment `# Queued`) instead of being coded.
- **Failure stops the chain:** `needs:developer` issues neither block nor get started. Fix or relabel and the chain resumes at the next merge.
- **Think and Plan** are not part of the queue and may run in parallel; only Code and Prove are serialized.
- **In flight means work is queued or running.** An open PR alone does not count: a parked (`ready`) or paused issue keeps its PR, and counting it would let two issues block each other forever.
