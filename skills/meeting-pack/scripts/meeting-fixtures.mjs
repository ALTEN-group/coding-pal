import { sha256 } from "./validate-meeting.mjs";

export const PACK_DIR = "meetings/2026-09-24-acme-discovery";

export const QUOTE_1 = "Our regional managers spend 45 minutes every morning cross-referencing CSV exports from SAP with local inventory sheets before trucks can roll.";
export const QUOTE_2 = "trucks wait until the sheets are reconciled";

export const validTranscript = `# Transcript: Acme discovery call

- **Date:** 2026-09-24
- **Tool:** Sanctioned meeting tool
- **Source File:** acme-call.txt
- **Recording Consent:** Yes - announced at the start of the call, all participants agreed
- **Duration:** 00:42:10

## Speakers
| Name | Role | Side |
|---|---|---|
| Sam Lee | Product Owner | internal |
| Dana Moreau | Operations Director | client |
| Alex Kim | Developer | internal |

## Transcript
[00:00:05] Sam Lee: Thanks for joining. Let's start with your morning dispatch process.
[00:15:32] Dana Moreau: ${QUOTE_1}
[00:16:10] Sam Lee: Just to confirm, the dispatch slot opens at six?
[00:16:25] Dana Moreau: Yes, the dispatch window opens at six and ${QUOTE_2}.
[00:30:40] Alex Kim: Which SAP export do they use today?
[00:30:55] Dana Moreau: The stock-on-hand export, we call it the SOH dump.
`;

export const validGlossary = `# Glossary

| Term | Definition | Aliases | Source |
|---|---|---|---|
| Dispatch window | The daily time slot during which trucks may leave the depot. | _None._ | docs/specs/dispatch.md |
| Reconciliation | Matching SAP stock figures with local inventory sheets. | cross-check, tally | docs/specs/inventory.md |
`;

export const PENDING = {
	speaker: "Pending",
	readBack: "Pending",
	sent: "Pending",
	client: "Pending",
};

export const CONFIRMED = {
	speaker: "Verified by Alex Kim on 2026-09-25",
	readBack: "Done by Sam Lee on 2026-09-24",
	sent: "Sent to Dana Moreau on 2026-09-25",
	client: "Confirmed by Dana Moreau on 2026-09-26",
};

export function makePack(hash = sha256(validTranscript), confirmation = PENDING) {
	return `# Meeting Pack: Acme discovery call

## Meeting
- **Date:** 2026-09-24
- **Transcript:** \`${PACK_DIR}/transcript.md\`
- **SHA-256:** ${hash}
- **Participants:**

  | Name | Role | Side |
  |---|---|---|
  | Sam Lee | Product Owner | internal |
  | Alex Kim | Developer | internal |
  | Dana Moreau | Operations Director | client |
  | Priya Nair | Regional Manager | client |

## Executive Summary
- **Business Drivers:** Regional managers lose time every morning reconciling SAP exports with local inventory.
- **Urgency:** Trucks cannot leave until the reconciliation is done, so it delays every delivery day.
- **Core Challenges:** Two disconnected data sources, manual cross-referencing, and no single view of mismatches.

## Domain Concepts & Terminology
| Term | Heard As | Definition | Status | Timestamp |
|---|---|---|---|---|
| Dispatch window | dispatch window | The time slot when trucks may leave. | known | 00:16:25 |
| Dispatch window | dispatch slot | Same concept, spoken differently. | correction | 00:16:10 |
| SOH dump | SOH dump | The stock-on-hand export from SAP. | new | 00:30:55 |

## Candidate Business Needs

### N1: Reconcile SAP exports with local inventory automatically
- **Problem Statement:** Regional managers cannot dispatch trucks until a manual reconciliation is finished, costing about 45 minutes per manager each morning.
- **Evidence:**

  | ID | Timestamp | Speaker | Quote |
  |---|---|---|---|
  | E1 | 00:15:32 | Dana Moreau (Operations Director) | "${QUOTE_1}" |
  | E2 | 00:16:25 | Dana Moreau (Operations Director) | "${QUOTE_2}" |

- **Draft Acceptance Criteria:**
  - Given SAP exports and local sheets for a depot, when the manager opens the morning view, then every mismatch is listed in one place.
- **Concepts:** Dispatch window, SOH dump

## Confirmation
- **Speaker Verification:** ${confirmation.speaker}
- **Client Read-Back:** ${confirmation.readBack}
- **Written Summary Sent:** ${confirmation.sent}
- **Client Confirmation:** ${confirmation.client}

## Ambiguities & Open Questions
_None._
`;
}
