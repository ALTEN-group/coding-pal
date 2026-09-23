# Test Probe Specification Contract

An **Anti-Tautology Probe** mechanically proves that an AI-generated test is genuinely falsifiable and not vacuous (e.g., tests that pass unconditionally regardless of whether the code was fixed).

## Invariant Lifecycle

```
[1. Baseline]
Run test-cmd on current modified working tree
  │
  ├── Fails? ──> ABORT: Base test does not pass.
  ▼
[2. Inversion (Unpatch)]
Temporarily revert source implementation to baseline (HEAD)
Leave newly created / updated test file intact
  │
  ▼
[3. Falsifiability Assertion]
Run test-cmd on unpatched source
  │
  ├── Passes? ──> FAIL: TAUTOLOGY DETECTED! Test does not assert the fix.
  ▼
  Fails! (Test is verified falsifiable)
  │
  ▼
[4. Restoration]
Restore source implementation from in-memory backup
Re-run test-cmd to confirm passing state
  │
  ▼
[5. Certified] Exit 0
```

## CLI Usage

```bash
# Verify that newly added auth tests fail without the auth fix
node scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js"

# Inspect JSON falsifiability report
node scripts/test-probe.mjs --test-cmd "npm test -- tests/auth.test.js" --source "src/auth/service.js" --json
```

## Exit Codes

| Exit Code | Meaning | Agent Action |
|---|---|---|
| `0` | Test is genuinely falsifiable | Test approved. Proves the test actively catches the bug. |
| `1` | Tautology detected / vacuous test | Rewrite the test to assert actual bug behavior. |
| `2` | Configuration / command error | Check `--test-cmd` syntax or source paths. |
