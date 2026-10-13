export const ARCHITECT = "Dana Roy (Architect)";

export const SIGNED = "Signed by Dana Roy (Architect) on 2026-10-14";
export const UNSIGNED = "Drafted: unsigned";

/** A valid decision record. Override header fields; extra header lines are appended after Signature. */
export function makeDecision({
	title = "Expose role management through the Forge RBAC service",
	status = "Drafted",
	date = "2026-10-13",
	type = "contract-change",
	deciders = `Sam Lee (Developer), ${ARCHITECT}`,
	source = "specs/issue-42/think.md",
	supersedes = "_None._",
	signature = UNSIGNED,
	extra = "",
	options,
} = {}) {
	const optionBlocks =
		options ??
		`### Option 1: Call the Forge RBAC service
- **Pros:** No local persistence. Reuses audited authorization logic.
- **Cons:** Adds a runtime dependency on the Forge service.

### Option 2: Build a local role table
- **Pros:** No network hop.
- **Cons:** A second source of truth for permissions that drifts from the Forge.
`;
	return `# Decision: ${title}

- **Status:** ${status}
- **Date:** ${date}
- **Type:** ${type}
- **Deciders:** ${deciders}
- **Source:** \`${source}\`
- **Supersedes:** ${supersedes}
- **Signature:** ${signature}
${extra}
## Context
The admin portal needs to create roles. Authorization rules already live in the Forge RBAC service, and a second copy would diverge.

## Options
${optionBlocks}
## Decision
Option 1: the route handler calls the Forge RBAC service. No role data is stored locally.

## Consequences
- The new endpoint fails closed when the Forge service is unavailable.
- Role changes are audited in one place.
`;
}

export const TOOLING_EXTRA = `- **Native Alternatives Considered:** GitHub Projects and issue forms cover intake and tracking; neither can host the scheduled survey.
- **Context Preservation:** Survey results are exported weekly to \`docs/surveys/\` by a workflow so agents read them from the repository.
`;

export const DATA_MODEL_EXTRA = "- **Migration Plan:** `db/changelog/0042-add-roles.sql` adds the table; rollback drops it; no other squad's tables change.\n";

export const MODEL_EXTRA = "- **Evaluation Report:** `docs/evaluations/2026-10-model-x.md`\n";

/** A valid escalation record. */
export function makeEscalation({
	title = "Share the billing schema with the reporting squad",
	defaultDate = "2026-10-20",
	reason = "cross-squad conflict",
	status = "Open",
	resolution = "",
	options = "  1. Expose a read-only view.\n  2. Copy the table nightly.",
} = {}) {
	return `# Escalation: ${title}

- **Decision:** Whether the reporting squad may read the billing tables directly.
- **Options:**
${options}
- **Recommendation:** Expose a read-only view and keep writes with the billing squad.
- **Default Date:** ${defaultDate}
- **Reason:** ${reason}
- **Status:** ${status}
${resolution ? `- **Resolution:** ${resolution}\n` : ""}`;
}

export const THINK_SIGNED = `# Think: Role management

## Blast Radius
- **Tier:** High
- **Affected:** POST /roles
- **Rationale:** Authorization changes.
- **Rollback:** Disable the route.

## Decision Record
- **Required:** yes
- **Record:** \`docs/decisions/0001-forge-rbac.md\`
- **Status:** Signed

## Ambiguities & Open Questions
_None._
`;

export const THINK_NO = `# Think: Copy edit

## Blast Radius
- **Tier:** Low
- **Affected:** Landing page copy.
- **Rationale:** Copy only.
- **Rollback:** _None._

## Decision Record
- **Required:** no
- **Reason:** No contract, schema, or boundary change.
`;
