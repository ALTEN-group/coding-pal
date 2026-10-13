export function sarif(results = [], rules = []) {
	return {
		$schema: "https://json.schemastore.org/sarif-2.1.0.json",
		version: "2.1.0",
		runs: [{ tool: { driver: { name: "semgrep", rules } }, results }],
	};
}

export function sarifResult({ ruleId = "js.sql-injection", level, path = "src/db.js", line = 12, message = "Possible SQL injection", properties } = {}) {
	const result = {
		ruleId,
		message: { text: message },
		locations: [{ physicalLocation: { artifactLocation: { uri: path }, region: { startLine: line } } }],
	};
	if (level) result.level = level;
	if (properties) result.properties = properties;
	return result;
}

export const cleanSarif = sarif([sarifResult({ level: "note", message: "Style hint" })]);

export const conftestPass = [{ filename: "deploy/k8s.yaml", namespace: "main", successes: 4, failures: [], warnings: [] }];

export const conftestFail = [
	{
		filename: "deploy/k8s.yaml",
		namespace: "main",
		successes: 3,
		failures: [{ msg: "containers must not run as root" }],
		warnings: [{ msg: "image tag should be pinned" }],
	},
];

export function sbom(components) {
	return { bomFormat: "CycloneDX", specVersion: "1.5", components };
}

export const cleanSbom = sbom([
	{ type: "library", name: "left-pad", version: "1.3.0", licenses: [{ license: { id: "MIT" } }] },
	{ type: "library", name: "yaml", version: "2.4.0", licenses: [{ expression: "MIT OR GPL-3.0-only" }] },
	{ type: "library", name: "tslib", version: "2.6.0", licenses: [{ license: { name: "Apache-2.0" } }] },
]);

export const ALLOW = "MIT,Apache-2.0,ISC,BSD-3-Clause";

export function waiver(overrides = {}) {
	return {
		id: "js.sql-injection",
		path: "src/db.js",
		reason: "Input is a constant, tracked in the decision record",
		approvedBy: "Dana Reed (Architect)",
		expires: "2026-12-31",
		...overrides,
	};
}
