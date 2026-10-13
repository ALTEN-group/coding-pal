export const MEETING = "2026-09-24-acme-discovery";

/**
 * A small, hand-checkable event log.
 * issue-42: meeting end 10:00, transcribed 10:30, ranked after 6h, released 48h after transcription.
 * issue-43: ranked after 10h, released 72h after transcription, then rolled back (incident mitigated in 10 minutes).
 */
export const validEvents = () => [
	{ t: "2026-09-24T10:00:00Z", type: "meeting.ended", id: MEETING },
	{ t: "2026-09-24T10:30:00Z", type: "meeting.transcribed", id: MEETING },
	{ t: "2026-09-24T14:00:00Z", type: "issue.created", id: "issue-42", meeting: MEETING },
	{ t: "2026-09-24T14:05:00Z", type: "issue.created", id: "issue-43", meeting: MEETING },
	{ t: "2026-09-24T16:00:00Z", type: "issue.ranked", id: "issue-42" },
	{ t: "2026-09-24T20:00:00Z", type: "issue.ranked", id: "issue-43" },
	{ t: "2026-09-25T09:00:00Z", type: "code.first_run", id: "issue-42", green: true },
	{ t: "2026-09-25T09:30:00Z", type: "code.fix_loop", id: "issue-42", count: 2 },
	{ t: "2026-09-25T10:00:00Z", type: "pr.opened", id: "issue-42" },
	{ t: "2026-09-25T12:00:00Z", type: "ci.first_run", id: "issue-42", green: true },
	{ t: "2026-09-25T14:00:00Z", type: "pr.validated", id: "issue-42", tier: "Medium" },
	{ t: "2026-09-25T15:00:00Z", type: "pr.merged", id: "issue-42" },
	{ t: "2026-09-26T10:30:00Z", type: "release.production", id: "issue-42", percent: 100 },
	{ t: "2026-09-26T07:00:00Z", type: "code.first_run", id: "issue-43", green: false },
	{ t: "2026-09-26T07:30:00Z", type: "code.fix_loop", id: "issue-43", count: 4 },
	{ t: "2026-09-26T08:00:00Z", type: "ci.first_run", id: "issue-43", green: false },
	{ t: "2026-09-26T09:00:00Z", type: "pr.human_edit", id: "issue-43" },
	{ t: "2026-09-26T20:00:00Z", type: "pr.validated", id: "issue-43", tier: "High", ci_green_at: "2026-09-26T08:00:00Z" },
	{ t: "2026-09-26T21:00:00Z", type: "pr.merged", id: "issue-43" },
	{ t: "2026-09-27T08:00:00Z", type: "release.production", id: "issue-43", percent: 50 },
	{ t: "2026-09-27T10:30:00Z", type: "release.production", id: "issue-43", percent: 100 },
	{ t: "2026-09-27T12:00:00Z", type: "release.rollback", id: "issue-43" },
	{ t: "2026-09-27T12:30:00Z", type: "incident.opened", id: "incident-1", change: "issue-43" },
	{ t: "2026-09-27T12:40:00Z", type: "incident.mitigated", id: "incident-1" },
	{ t: "2026-09-30T14:00:00Z", type: "evidence.first_signal", id: "issue-42" },
	{ t: "2026-10-01T00:00:00Z", type: "pr.reworked", id: "issue-42" },
	{ t: "2026-10-01T08:00:00Z", type: "defect.production", id: "defect-1", escaped: true },
	{ t: "2026-10-01T09:00:00Z", type: "defect.production", id: "defect-2", escaped: false },
	{ t: "2026-10-01T10:00:00Z", type: "defect.production", id: "defect-3", escaped: false },
	{ t: "2026-10-02T09:00:00Z", type: "hypothesis.closed", id: "issue-42", verdict: "validated" },
	{ t: "2026-10-02T10:00:00Z", type: "hypothesis.closed", id: "issue-44", verdict: "invalidated" },
	{ t: "2026-10-03T10:00:00Z", type: "hypothesis.closed", id: "issue-45", verdict: "invalidated" },
	{ t: "2026-10-05T09:00:00Z", type: "feature.deleted", id: "issue-44" },
	{ t: "2026-10-06T09:00:00Z", type: "stage.assisted", id: "issue-42", stage: "code", share: 1 },
	{ t: "2026-10-06T09:05:00Z", type: "stage.assisted", id: "issue-42", stage: "triage", share: 0.5 },
	{ t: "2026-10-07T09:00:00Z", type: "ai.cost", id: "issue-42", usd: 1.5, stage: "code", change: "issue-42" },
	{ t: "2026-10-07T09:05:00Z", type: "ai.cost", id: "issue-42", usd: 0.5, stage: "triage", change: "issue-42" },
	{ t: "2026-10-07T10:00:00Z", type: "pr.authorship", id: "issue-42", ai_lines: 90, human_lines: 10 },
	{ t: "2026-10-07T10:05:00Z", type: "pr.authorship", id: "issue-43", ai_lines: 100, human_lines: 0 },
	{ t: "2026-10-07T11:00:00Z", type: "usecase.run", id: "issue-42", usecase: "automated-test-creation", minutes: 20, iterations: 1, usd: 0.5, human_intervention: true, first_pass: true },
	{ t: "2026-10-07T11:05:00Z", type: "usecase.run", id: "issue-43", usecase: "automated-test-creation", minutes: 40, iterations: 3, usd: 1.5, human_intervention: false, first_pass: false },
	{ t: "2026-10-07T11:10:00Z", type: "usecase.run", id: "issue-43", usecase: "fix-loop", minutes: 9, iterations: 4, usd: 0.25, human_intervention: false, first_pass: false },
	{ t: "2026-10-12T09:00:00Z", type: "context.session", id: "issue-42", hit: true },
	{ t: "2026-10-13T09:00:00Z", type: "context.session", id: "issue-43", hit: true },
	{ t: "2026-10-14T09:00:00Z", type: "context.session", id: "issue-45", hit: false },
];

export const toJsonl = (events) => `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
