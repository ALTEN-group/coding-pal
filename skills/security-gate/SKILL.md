---
name: security-gate
description: 'Gate a change on security and policy findings: fail on SARIF errors (Semgrep, Trivy, CodeQL), Conftest/OPA policy failures, and CycloneDX licenses that are not allowed, with time-boxed, approved waivers. Use in the Code loop and in CI before a pull request is validated by a human.'
license: MIT
---

# Security Gate

Deterministic Security & Policy-as-Code and license gate. It reads the output files of the scanners (SARIF, Conftest JSON, CycloneDX SBOM) and returns pass or fail. It never runs a scanner and never talks to the network.

## When to Use This Skill

- The Code loop or CI has produced SARIF, Conftest/OPA JSON, or a CycloneDX SBOM and needs a pass or fail verdict.
- A license policy (allowed or denied licenses) must be enforced on dependencies.
- A known finding needs a time-boxed waiver that a named person approved.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`). If the skill was installed under `.agents/skills/security-gate/` or `.claude/skills/security-gate/`, use that base path.

## Workflow

1. **Read `references/security-gate-contract.md`** for the inputs, severity rules, license rules, and the waiver format.
2. Produce the scanner output files with your tools (for example Semgrep or Trivy with SARIF output, Conftest with `--output json`, a CycloneDX SBOM generator).
3. Run the gate:

```bash
node scripts/security-gate.mjs \
  --sarif reports/semgrep.sarif --sarif reports/trivy.sarif \
  --conftest reports/conftest.json \
  --sbom reports/sbom.json --allow-licenses "MIT,Apache-2.0,ISC,BSD-3-Clause" \
  --waivers waivers.json
```

4. Treat a nonzero exit as a failure. Fix the code or the configuration the finding points at, then re-run the scanner and the gate.
5. Never edit `waivers.json` or lower `--min-severity` to get a pass. A waiver is a human decision: it needs a reason, an approver written as `<name> (<role>)`, and an expiry date, and it is added through a pull request that the Architect reviews.

## Done When

- `scripts/security-gate.mjs` exits with code 0 on fresh scanner output.
- No finding was hidden by editing a waiver, a scanner configuration, or the gate's arguments.
- Every waived finding is listed in the output with its approver and expiry.
