export const validLedger = `# Hypothesis Ledger

Reviewed at the weekly Outcome review. Only the Product Owner records a verdict.

| Issue | Hypothesis | Metric | Baseline | Target | Direction | Watch Ends | Verdict | Evidence | Action | Decided |
|---|---|---|---|---|---|---|---|---|---|---|
| #12 | Automatic reconciliation cuts the morning dispatch delay | Median minutes from dispatch window open to first truck out | 45 | 10 | down | 2026-09-30 | Validated | Observed 8 on 2026-10-02 (dashboards/dispatch-delay.png) | Remove flag | Sam Lee (Product Owner) on 2026-10-05 |
| #15 | A bulk export button reduces manual exports | Manual CSV exports per week | 120 | 40 | down | 2026-09-30 | Invalidated | Observed 131 on 2026-10-02 (analytics export, 2026-10-02) | Delete feature (Pending) | Sam Lee (Product Owner) on 2026-10-05 |
| #18 | Inline help raises checkout completion | Checkout completion rate (%) | 62 | 70 | up | 2026-10-10 | Inconclusive | Observed 63 on 2026-10-12 | Iterate once | Sam Lee (Product Owner) on 2026-10-13 |
| #21 | Saved filters raise weekly active planners | Weekly active planners | 200 | 260 | up | 2026-10-31 | Open | _None._ | _None._ | _None._ |
| #9 | Dark mode lifts evening sessions | Evening sessions per week | 1000 | 1200 | up | 2026-08-30 | Invalidated | Observed 940 on 2026-09-01 | Delete feature (Deleted 2026-09-10) | Sam Lee (Product Owner) on 2026-09-02 |
`;

export const emptyLedger = `# Hypothesis Ledger

| Issue | Hypothesis | Metric | Baseline | Target | Direction | Watch Ends | Verdict | Evidence | Action | Decided |
|---|---|---|---|---|---|---|---|---|---|---|
`;

export const ADD_ENTRY = {
	issue: "30",
	hypothesis: "Order templates shorten order entry",
	metric: "Minutes per order",
	baseline: "6",
	target: "3",
	direction: "down",
	watchEnds: "2026-11-30",
};
