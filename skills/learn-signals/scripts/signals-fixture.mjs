export const highFinding = {
	id: "error_rate-anomaly-2026-10-13",
	metric: "error_rate",
	kind: "anomaly",
	severity: "high",
	onset: "2026-10-13T09:25:00Z",
	evidence: { current: 0.44, baselineMean: 0.3, baselineStd: 0.02, lastZ: [5, 6, 7], runLength: 3 },
	summary: "error_rate is above its baseline: the last 3 points have |z| >= 3 (z = 5, 6, 7) since 2026-10-13T09:25:00Z",
	deploys: [{ t: "2026-10-13T09:10:00Z", version: "v2.0.0", diff: "new order-total calculation" }],
};

export const mediumFinding = {
	id: "latency_p95-trend-2026-10-13",
	metric: "latency_p95",
	kind: "trend",
	severity: "medium",
	onset: "2026-10-13T08:10:00Z",
	evidence: { current: 0.52, slopePerHour: 0.24, r2: 1, etaMinutes: 70 },
	summary: "latency_p95 is heading toward max 0.8 at 0.24 per hour (r2 1): breach in about 70 minutes",
	deploys: [],
};

export const validFindings = { horizonMinutes: 120, metrics: [], findings: [highFinding, mediumFinding] };
