export const START = "2026-10-13T08:00:00Z";
export const STEP_MINUTES = 5;

export function isoAt(index, start = START, stepMinutes = STEP_MINUTES) {
	return new Date(Date.parse(start) + index * stepMinutes * 60_000).toISOString().replace(".000", "");
}

export function makeSeries(values, start = START, stepMinutes = STEP_MINUTES) {
	return values.map((v, i) => ({ t: isoAt(i, start, stepMinutes), v }));
}

// Twelve baseline points alternating 0.28 / 0.32: mean 0.30, std 0.02.
const baselinePoints = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 0.28 : 0.32));

export const stable = [...baselinePoints, 0.3, 0.29, 0.31, 0.3, 0.3, 0.31, 0.29, 0.3];
export const highAnomaly = [...baselinePoints, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.42, 0.44];
export const mediumAnomaly = [...baselinePoints, 0.3, 0.3, 0.3, 0.3, 0.3, 0.37, 0.38, 0.4];
export const rising = Array.from({ length: 12 }, (_, i) => Math.round((0.3 + 0.02 * i) * 100) / 100);
export const falling = Array.from({ length: 12 }, (_, i) => Math.round((0.9 - 0.02 * i) * 100) / 100);

export const wideBaseline = { error_rate: { mean: 0.4, std: 0.5 } };
export const givenBaseline = { error_rate: { mean: 0.3, std: 0.02 } };

export const deploys = [
	{ t: "2026-10-13T08:20:00Z", version: "v1.9.0", diff: "unrelated copy change" },
	{ t: "2026-10-13T09:10:00Z", version: "v2.0.0", diff: "new order-total calculation" },
	{ t: "2026-10-13T09:25:00Z", version: "v2.0.1", diff: "retry policy tweak" },
	{ t: "2026-10-13T09:40:00Z", version: "v2.0.2", diff: "after the anomaly began" },
];
