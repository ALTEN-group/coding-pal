---
name: release-readiness
description: "Verify a Node.js service's package.json, lockfile, CHANGELOG.md, production dockerfile, publish workflow, OpenAPI spec and env templates before PR validation or release."
---

# Release Readiness Skill

Deterministic pre-release gate for services released as GitHub Releases + Docker images (Megadex, Foxnox, Gatelin).

## Usage

### 1. During PR validation (`Code` & `Prove`)
```bash
node skills/release-readiness/scripts/verify-release-readiness.mjs --mode pr
```

### 2. Before tagging a release
```bash
node skills/release-readiness/scripts/verify-release-readiness.mjs \
  --mode release --expected-version <X.Y.Z[-alpha.N]> [--previous-version <prev>]
```

`--dir <repo>` selects the repository (default: cwd). `--require-dist` is accepted and ignored. Exit code 0 on success; on failure a readable list of errors goes to stderr and the exit code is 1. Warnings are printed but never fail the run.

## Deterministic checks

1. **`package.json` and lockfile**: `version` is valid SemVer, equals `--expected-version` (release mode) and is above `--previous-version` when given. `package-lock.json` top-level and `packages[""]` versions equal `package.json`.
2. **`CHANGELOG.md`** (the app's format: `# X.Y.Z (Nov 21st 2026)` headings, `  - ` bullets; `##` headings and long month names are accepted):
   - Release mode: the top entry is the released version, dated, and not `(unreleased)`. PR mode may also have a top `(unreleased)` entry.
   - No leftover `(unreleased)` heading for older versions, no duplicate versions, at least one bullet in the top entry, no `TODO`/`TBD`/`FIXME`.
   - PR mode: the entry of the `package.json` version is compared with the one in tag `v<version>`; editing a released entry fails.
3. **Docker**: a production dockerfile exists (`docker/dockerfile.prod` or any `Dockerfile*`) and `.github/workflows/publish.yml` exists.
4. **OpenAPI**: every `swagger/src/*.openapi*.json` is valid JSON. When `info.version` is a plain semver different from the release version it is reported as a **warning**, not an error.
5. **Env templates**: `.env.*.example` files in `docker/conf/` and the repository root parse (`KEY=value` lines, comments); duplicate variables only warn.
