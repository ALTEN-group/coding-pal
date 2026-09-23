# Dependency Guard Specification Contract

A **Dependency Guard** mechanically prevents agents from introducing unvetted, unprompted, or banned dependencies into project manifest files.

## Invariant Rules

1. **Zero Unprompted Dependencies**: An agent modifying `package.json` (or other dependency manifests) cannot add new packages under `dependencies` or `devDependencies` unless explicitly listed in `--allow`.
2. **Banned Dependencies Sentinel**: Deprecated, bloated, or unsafe libraries (e.g., `moment`, `request`, `lodash` when modular imports exist) are immediately rejected with a deterministic violation.
3. **Version Pinning Invariant**: If configured, wildcard or loose version ranges (`*`, `latest`) are rejected in favor of pinned or semver-compatible versions.

## CLI Usage

```bash
# Check git working tree changes against baseline HEAD
node scripts/dependency-guard.mjs --git

# Check with explicit allowed new packages
node scripts/dependency-guard.mjs --git --allow "zod,dotenv"

# Inspect manifest directly with custom banned packages
node scripts/dependency-guard.mjs --manifest package.json --banned "moment,request" --json
```

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | No unauthorized or banned dependencies added | Changes approved. |
| `1` | Unauthorized or banned dependency detected | Remove new packages; use existing project utilities or ask for permission. |
| `2` | Configuration / file read error | Fix arguments or check file paths. |
