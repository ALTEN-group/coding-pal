---
name: release-bump
description: "Choose the semver bump for @1pizzateam/* library releases from what actually ships (npm tarball + .d.ts API diff vs the published version), not from the issue title."
---

# Release Bump Skill

Used by the `Auto-release merged @1pizzateam/* library version` step in `pipeline-prove.yml`.

```bash
node .agents/skills/release-bump/scripts/classify-bump.mjs \
  --next <extracted new tarball> [--prev <extracted published tarball>] \
  --current-version <X.Y.Z> --title "<issue title>" --labels "a,b" --ts-from "$PWD"
```

## Rules

| Evidence (new tarball vs published `name@current-version`) | Bump |
| :--- | :--- |
| No shipped file changed (README/CHANGELOG/package.json/LICENSE are ignored; embedded version string ignored) | `none` - no release |
| Shipped runtime changed, `.d.ts` API unchanged | `patch` |
| Export added, optional parameter added, return type narrowed, parameter widened, optional member added | `minor` |
| Export removed, incompatible signature/type change, interface gained a required member | `major` |
| Package never published | at least `minor` |

- Intent only raises the bump: `feat...` floors at minor, `fix...` at patch, `feat!:` / `BREAKING CHANGE` / label `breaking` or `release:major` floors at major. `release:minor` / `release:patch` labels also set floors.
- A **major** derived from evidence alone (no `breaking`/`release:major`/`!` marker) is not released: the step fails with an issue comment asking for the `breaking` label, then the release is re-run.
- `0.x` stable versions release breaking changes as `minor`. Prerelease versions (`-alpha/-beta/-rc`) release any shipped change as `prerelease`.
- `private` and `#private` class members are stripped from both `.d.ts` sets before comparing: they are not public API, and TypeScript would otherwise treat any private-member change as an incompatible class. `protected` members still count.
- Compatibility is judged from the consumer side with the TypeScript checker (`isTypeAssignableTo`, old and new declarations in one program), so `typescript` must be resolvable from `--ts-from`; without it a changed `.d.ts` is treated as at least minor.

## Test, docs and CI PRs never release

`pr-ships.mjs` inspects the merged PR's changed files. If none can ship (tests, `*.test.*`, docs, `website/`, CI, specs, markdown, config), the issue gets `# No release` and the release step ends, even when master carries earlier unreleased changes. Those wait for the next PR that changes shipped code, and the changelog of that release lists every shipping commit since the previous tag. Exceptions: a milestone train release, and the `release:now` label.

## Milestone release trains

Issues that share a GitHub milestone release together instead of one by one (`plan-batch.mjs`):

- Without a milestone an issue releases on its own right after merge.
- With a milestone, a merged issue is held in the **Release** column (comment `# Release held: milestone ...`). When the last open issue of the milestone merges, one release ships the whole train: one bump, one changelog (issue titles), one npm publish, and every member moves to Done.
- A milestone named like a version declares the intent: `5.0.0` over a published `4.6.0` is a confirmed major (no `breaking` label needed); `4.7.0` floors at minor, `4.6.1` at patch. Evidence from the tarball diff can still raise the level, never lower it.
- Labels and titles of all merged members count toward the floor. A milestone issue counts as merged when a merged PR from branch `feature/issue-<n>-*` exists.
- Add the `release:now` label to an issue to ship what is merged so far without waiting for the rest.

### Automatic milestones (audits)

When an audit creates an issue in a published `@1pizzateam/*` library, `plan-milestone.mjs` picks its train (one train at a time):

- Issues that need no release (`test`, `docs`, `ci`, `style`, `build` titles) get no milestone.
- The level comes from the title and labels: `feat` = minor, `!` / `breaking` / `release:major` / `audit:vector-first` = major, everything else = patch.
- An open milestone named like a version above the published npm version is the train in progress: the issue joins it. If the issue needs a higher level than the train, the milestone is renamed up (`4.7.0` becomes `5.0.0`), never split.
- With no train in progress, a milestone is created at the next version for that level (`4.6.1` + patch = `4.6.2`, minor = `4.7.0`, major = `5.0.0`).
- When the train releases (or ends with no release) its milestone is closed, so the next audit opens a fresh one. A partial `release:now` release leaves it open.
- Issues created by hand are not assigned automatically; set the milestone yourself.

### Single-flight chain and the `ready` label

Only one issue is in flight (Code -> Prove -> merge) at a time, repository-wide, so every issue is coded on a `main` that already contains the ones before it (`plan-chain.mjs`, no AI calls). A milestone does not change this; it only groups issues into one release.

- **`ready`** means "the pipeline may start this issue". Audits never set it; you do. Issues without it are never started automatically.
- **Chain:** after an issue merges, Prove starts a `ready` issue by adding `5-release` (and removing `ready`): first the lowest-numbered one in the same milestone as the merged issue, then the lowest-numbered one overall. It only does so when no other issue is in flight, meaning it carries a `3-code`/`4-prove`/`5-release` stage label.
- **Intercept:** at the top of Code, if another issue is in flight (an open pipeline PR *and* a stage label), the issue is parked as `ready` (stage labels removed, comment `# Queued`) instead of being coded. So labeling several issues by hand is safe: the first one runs, the others queue.
- **Failure stops the chain:** `needs:developer` issues neither block nor get started. Fix or relabel and the chain resumes at the next merge.
- **Think and Plan** are not part of the queue and may run in parallel for any issue (for example label `2-plan` ahead of time); only Code and Prove are serialized.
- Applies to every repository on the pipeline, with or without milestones, libraries and apps alike. Release batching (milestones, the test-only gate) stays library-only.
- **In flight means work is queued or running.** An open PR alone does not count: a parked (`ready`) or paused issue keeps its PR, and counting it would let two issues block each other forever.
