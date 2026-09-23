# Secret Guard Specification Contract

A **Secret Guard** mechanically prevents agents from hardcoding credentials, tokens, private keys, or passwords into source code or test fixtures.

## Credential Patterns Detected

1. **Cloud Provider Keys**:
   - AWS Access Key IDs (`AKIA[0-9A-Z]{16}`)
2. **Cryptographic Material**:
   - OpenSSH, RSA, EC, and PGP Private Key blocks (`-----BEGIN ... PRIVATE KEY-----`)
3. **Platform Tokens**:
   - GitHub Personal Access Tokens (`ghp_[a-zA-Z0-9]{36}`)
   - Slack Tokens (`xox[baprs]-...`)
4. **Generic Secrets in Assignment**:
   - Hardcoded variable assignments matching `(api_key|secret|token|password) = "..."` exceeding entropy thresholds.

## CLI Usage

```bash
# Scan git working tree changes against baseline HEAD (added lines only)
node scripts/secret-guard.mjs --git

# Scan specific files
node scripts/secret-guard.mjs --file src/config.js

# Output structured JSON report
node scripts/secret-guard.mjs --git --json
```

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | Zero credentials or secret patterns detected | Clean diff. Proceed. |
| `1` | One or more hardcoded secrets detected | Replace secret with environment variable (`process.env.VAR`) or mock fixture. |
| `2` | Configuration or CLI argument error | Check arguments or file paths. |
