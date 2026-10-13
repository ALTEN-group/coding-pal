export const QUOTE = "Our regional managers spend 45 minutes every morning cross-referencing CSV exports from SAP.";

export const validTriage = `# Triage: Regional managers lose 45 minutes every morning to inventory reconciliation

## Backlog Issue
- **Title:** Reconcile SAP exports with local inventory automatically
- **Problem Statement:** Regional managers cannot dispatch trucks until a manual reconciliation is finished, costing 45 minutes per day each.
- **Source:** Discovery call with the Operations Director, 2026-09-24
- **Hypothesis:** Automatic reconciliation cuts morning dispatch prep from 45 to under 5 minutes.

## Evidence
| ID | Type | Reference | Quote or Count |
|---|---|---|---|
| E1 | transcript-quote | meetings/2026-09-24-acme-discovery/transcript.md#15:14:32 | "${QUOTE}" |
| E2 | ticket-cluster | support/2026-09-export.csv | 14 tickets |

## System Mapping & Early Risk
- **Capabilities & Specs:** Inventory export (\`docs/specs/inventory-export.md\`).
- **Domain Concepts:** Dispatch window, regional inventory sheet.
- **Affected Systems:** Export service, SAP connector.
- **Early Risk:** Depends on SAP data quality.
- **Unknowns:** _None._

## Scorecard
| Field | Score | Rationale |
|---|---|---|
| Customer value | 4 | Directly quoted by the Operations Director (E1). |
| Business value | Pending PO | Product Owner decides. |
| Effort | 3 | One service and one connector. |
| Risk | 2 | No auth boundary involved. |
| Confidence | High | A direct quote and 14 corroborating tickets. |

## Decision
- **Proposed:** todo
- **Rationale:** High customer value, corroborated by tickets.
- **Evidence to Gather:** _None._
- **Final (PO):** Pending

## Ambiguities & Open Questions
_None._
`;
