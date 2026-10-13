# Verification Pipeline Contract

The Platform Rails give every squad the same delivery skeleton on day one. This skill ships the two GitHub Actions workflows as copy-and-customize templates, and `rails-check.mjs` to verify a project still has them.

The templates are in `references/`. Copy them, change only the lines marked `CUSTOMIZE`.

---

## 1. `verify.yml`: Verification

Triggered on `pull_request`. Permissions: `contents: read`.

| Job | Purpose | Steps |
|---|---|---|
| `clean-rerun` | Where the agent cannot influence the result: a clean checkout and install, then the same commands as the Code loop | checkout, setup-node, install, build, type check, lint, tests (with a JUnit report and mutation testing), upload the reports |
| `controls` | The deterministic controls, one step each. The job stops at the first failure | `code-loop check-history` (before the soft reset), `control-guard` on the PR diff, `secret-guard`, `dependency-guard`, `scope-guard`, `criteria-verify`, `mutation-bar`, `contract-compat` against the base branch, scanners, `security-gate` |
| `preview` | The running application | install, start the stack, `preview-smoke`, fuzz tests, E2E tests, stop the stack |

Design rules:

- **Controls come from the base branch.** The `controls` and `preview` jobs extract `.agents/skills` from `origin/<base>` and run those copies, so a pull request cannot change the controls that judge it. Put `.github/workflows/` under CODEOWNERS so the Architect reviews workflow changes.
- **The PR is presented as one change.** In `controls`, `git reset --soft origin/<base>` keeps the files and makes the whole pull request appear as changes against `HEAD`. The git-based guards (`secret-guard`, `dependency-guard`, `scope-guard`) then inspect all of it. The downloaded `reports/` folder is excluded from git, so `scope-guard` does not see it as out-of-scope files.
- **The work item is derived from the branch** (`feature|fix|chore/issue-<n>-<slug>`), which gives `specs/issue-<n>/plan.md` for `criteria-verify`.
- **The fix-loop counter cannot be reset in the pull request.** Before the soft reset, `controls` runs `code-loop.mjs check-history --dir specs/issue-<n> --base origin/<base>` for every work item whose `progress.json` is in the pull request diff or on the base branch. It reads the file from the base and from every commit that touched it, and fails when the file is deleted, an attempt counter goes down, the limit is raised, or the plan hash changes after Code started (see the `code-loop` contract). The soft reset would flatten those commits, so the step must stay before it.
- **No step may fail silently.** No `continue-on-error`, no `|| true`. `control-guard` fails the pull request if one is added.
- **Customize:** Node version, build and test commands, test and mutation report paths, scope globs from the plan, OpenAPI path, scanners, license policy, preview start command and URL, fuzz and E2E commands.

Inputs a project provides: `waivers.json` (start with `[]`), `preview-routes.json`, and an OpenAPI document if it has a public contract.

---

## 2. `remediate.yml`: Auto-Remediation

Triggered by `workflow_run` completion of `verify` with a failure. Permissions: `contents: read`, `actions: read`, `issues: write`, `pull-requests: write`.

| Step | Purpose |
|---|---|
| Count the fix-loop attempts | Reads the `fix-loop:<n>` label of the pull request (0 when absent) |
| Hand over to the Developer | At the limit (5): labels `needs:developer`, comments once, and stops. No agent runs |
| Checkout | The exact failing commit (`head_sha`). The push token is not kept in the git config |
| Count this attempt | Before the agent runs: creates and applies `fix-loop:<n+1>`, removes `fix-loop:<n>`. An attempt is counted even if a later step fails |
| Collect the failing gate output | `gate-output.log` (excluded from git), the tail of the failed job logs, and the controls taken from the base branch |
| **Run the Gate Fixer (PLACEHOLDER)** | The one step a squad provides: run the `Gate Fixer` agent with `/fix-gates gate-output.log`. It fails by default until replaced |
| Require a fix commit | The agent must commit |
| `control-guard` on the agent's commit | Runs the base-branch copy of the control against the agent's work. A weakened control stops the run before the push |
| Push the fix | Fast-forward only, with the `REMEDIATE_PUSH_TOKEN` that re-triggers `verify`. A moved branch makes the push fail instead of overwriting work |

Design rules:

- **Same repository only.** Runs from forks are ignored.
- **No production secrets.** The agent runner gets its own model credential (`AGENT_API_KEY`) only. The `gh` token and the push token are given to the steps that need them, not to the runner. `control-guard` rule R7 fails a pull request that adds production credentials to a `remediate` or `agent` workflow.
- **Failing logs are untrusted input.** Do not give the runner more than it needs.
- **The limit is outside the agent.** The label is counted by the workflow with a token the runner does not have, so the agent cannot reset it. In the agent's own loop, `code-loop` counts the work item's fix-loop in the same way.
- **Residual risk.** The runner shares the job's workspace, so a runner with a shell could tamper with the local copy of the controls. Run the agent in a sandbox that cannot write outside the checkout.

---

## 3. `rails-check`

```text
node rails-check.mjs --root <dir> [--config rails.json] [--json]
```

It verifies a project has the Platform Rails and prints one `MISSING <category> <item>: <detail>` line per gap. Exit 0 = complete, 1 = something is missing.

| Check | Default requirement |
|---|---|
| Workflows | `.github/workflows/verify.yml` and `.github/workflows/remediate.yml` exist |
| Controls in `verify.yml` | References `control-guard.mjs`, `secret-guard.mjs`, `dependency-guard.mjs`, `scope-guard.mjs`, `verify-criteria.mjs`, `mutation-bar.mjs`, `contract-compat.mjs`, `security-gate.mjs`, `preview-smoke.mjs` (comment lines do not count) |
| Remediation in `remediate.yml` | References `control-guard.mjs`, `workflow_run`, and `fix-loop:` |
| Pull request template | `.github/pull_request_template.md` exists |
| `apm.yml` agents | Lists `code.agent.md` and `gate-fix.agent.md` |
| `apm.yml` skills | Lists `code-loop`, `pr-record`, `criteria-verify`, `mutation-bar`, `contract-compat`, `security-gate`, `control-guard`, `preview-smoke`, `task-gate`, `scope-guard`, `secret-guard`, `dependency-guard` |
| Installed skills | Each of those skills has `.agents/skills/<name>/SKILL.md` |

Optional `rails.json` replaces any of these lists: `controlScripts`, `remediateReferences`, `agents`, `skills`. Unknown keys are an error. `rails.json` is a protected control file for `control-guard`.

---

## 4. Anti-Patterns

1. **No pipeline per squad.** Customize the marked lines, keep the skeleton. Drift is what `rails-check` finds.
2. **No soft controls.** A control that can fail silently is not a control.
3. **No agent that edits its own judges.** Workflows, installed skills, and control configuration are changed by the Architect only.
4. **No unlimited loops.** At the limit of 5 attempts the Developer steps in.
