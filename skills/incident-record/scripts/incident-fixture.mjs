export const INCIDENT_NAME = "2026-10-13-checkout-5xx.md";

export const validIncident = `# Incident: Checkout returns 5xx after the order-total release

## Summary
- **Severity:** SEV2
- **Tier:** High
- **Detected At:** 2026-10-13T09:30:00Z
- **Mitigated At:** 2026-10-13T09:42:00Z
- **Resolved At:** 2026-10-13T15:10:00Z
- **Rollback Decided By:** Robin Park (DevOps)

## Detect
The checkout error-rate alert fired at 09:30 and the support desk reported failed payments at 09:33.

## Mitigate
- **Mechanism:** flag off
- **Detail:** Disabled the new-order-total flag; the error rate returned to baseline at 09:42.

## Diagnose
- **Diagnosis Started At:** 2026-10-13T09:50:00Z
- **Cause:** The new order-total code divides by the item count, which is zero for gift-card-only baskets.
- **Evidence:** Error logs show division by zero in order-total at 09:29; the deploy of 09:25 is the only change; the diff touches the total calculation.
- **Concluded By:** Alex Kim (Developer)

## Repair
- **Reproducing Test:** \`tests/unit/order-total.test.ts\`
- **Failed Before Fix:** yes
- **Passes After Fix:** yes
- **Test Commit:** a1b2c3d
- **Fix Commit:** e4f5a6b
- **Commit Order:** test 2026-10-13T10:05:00Z, fix 2026-10-13T10:40:00Z

## Learn
- **Review Date:** 2026-10-15
- **Reviewed By:** Jo Martin (QA and maintainer)
- **What Should Have Caught This:** A unit test with a gift-card-only basket; mutation testing would have flagged the unguarded division.
- **Control Hardening:**
  - gate: require the mutation score bar on the order-total module
  - probe: add a preview smoke check that submits a gift-card-only basket
- **Triage Issue:** #57
- **Postmortem Actions:**
  - Document the zero-item basket rule in the checkout glossary (owner: Sam Lee)

## Ambiguities & Open Questions
_None._
`;

export const noControlIncident = validIncident
	.replace(/- \*\*Control Hardening:\*\*\n {2}- gate:.*\n {2}- probe:.*\n/, "- **Control Hardening:** None: the existing zero-item contract test covers this path; the release skipped it by an approved override.\n")
	.replace("- **Triage Issue:** #57", "- **Triage Issue:** _None._");
