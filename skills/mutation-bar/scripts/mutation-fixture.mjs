export function mutant(id, status, line = 1, mutatorName = "ArithmeticOperator") {
	return { id: String(id), mutatorName, status, location: { start: { line, column: 1 }, end: { line, column: 5 } } };
}

/** Builds a Stryker mutation-testing-elements report from `{ path: [[status, line, mutator?], ...] }`. */
export function stryker(files) {
	let id = 0;
	const out = {};
	for (const [path, mutants] of Object.entries(files)) {
		out[path] = { language: "javascript", source: "", mutants: mutants.map(([status, line, mutator]) => mutant(++id, status, line, mutator)) };
	}
	return JSON.stringify({ schemaVersion: "2", thresholds: { high: 80, low: 60 }, files: out });
}

const repeat = (status, n) => Array.from({ length: n }, (_, i) => [status, i + 1]);

/** 9 of 10 scorable mutants detected in src/a.js (90), 6 of 10 in src/b.js (60); excluded statuses are ignored. */
export const validStryker = stryker({
	"src/a.js": [...repeat("Killed", 8), ["Timeout", 9], ["Survived", 40, "ConditionalExpression"], ["CompileError", 50], ["Ignored", 51]],
	"src/b.js": [...repeat("Killed", 5), ["Timeout", 6], ["Survived", 12, "StringLiteral"], ["Survived", 14, "BlockStatement"], ["NoCoverage", 30, "ArithmeticOperator"], ["NoCoverage", 31, "ArithmeticOperator"], ["RuntimeError", 60]],
});

export const validSummary = JSON.stringify({ killed: 70, survived: 10, timeout: 10, noCoverage: 10 });
