---
name: telemetry-scan
description: 'Deterministic predictive monitoring over exported telemetry: flag anomalies (last 3 points beyond 3 sigma), adverse trends with an ETA to a threshold, and threshold breaches, and list the deploys shortly before the first anomalous point. Use for the Learn stage Detect and Explain steps, or when CI should alert on a high severity signal. Reads series files only; never queries production; exits 3 on a high severity finding.'
license: MIT
---

# Telemetry Scan

Compare live signals with a baseline and thresholds before customers notice. The scan reads exported series, so the same input always gives the same findings. **Monitoring informs; humans act.**

## When to Use This Skill

- Learn is asked to watch a release: error rate creeping up, saturation approaching, cost drifting.
- A signal looks odd and the question is which deploy preceded it.
- CI should alert on a high severity signal in an exported metrics file.
- The weekly review needs the findings that may become Triage issues.

## Path resolution

Resolve `references/` and `scripts/` relative to **this skill's install directory** (the folder that contains this `SKILL.md`), not the consumer repository root or the current shell cwd. If the skill was installed under `.agents/skills/telemetry-scan/` or `.claude/skills/telemetry-scan/`, use that base path.

## Workflow

1. **Read `references/telemetry-scan-contract.md` now.** It defines the input files, the finding rules, and the exit codes.
2. Get exports from the user or the pipeline (series, optionally baseline, thresholds, and deploys). Never query or log in to a production system, and never ask for production credentials.
3. Run the scan from this skill's directory:

```bash
node scripts/telemetry-scan.mjs --series series.json --thresholds thresholds.json \
  --deploys deploys.json --horizon-minutes 120
node scripts/telemetry-scan.mjs --series series.json --thresholds thresholds.json --json > findings.json
```

4. **Detect:** report each finding with its numbers. **Explain:** for each finding, read the listed deploys and diffs, correlate with the logs and traces the user supplies, and propose a likely cause. State clearly that the QA and maintainer confirms the cause.
5. **Act (human):** the QA and maintainer decides whether to mitigate. Hand `findings.json` to the `learn-signals` skill to open Triage issues for the `high` findings.

Exit codes: `0` scanned, `1` invalid input, `3` at least one `high` finding (CI alerts on it).

## Done When

- The scan ran on supplied exports and its exit code was reported (`0`, `1`, or `3`).
- Every finding was reported with its evidence numbers and the deploys before its onset.
- Causes are labelled as proposals. Nothing was mitigated, rolled back, or changed in production.
