#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class VerifyError extends Error {
	constructor(message) {
		super(message);
		this.name = "VerifyError";
	}
}

const CRITERION_LINE = /^\s*[-*]\s+\*\*(AC-\d+):\*\*\s*(.*)$/;
const CRITERION_TOKEN = /(?<![A-Za-z0-9_])(AC-\d+)(?![A-Za-z0-9_])/gi;

export const VERDICTS = {
	pass: "PASS",
	fail: "FAIL",
	notCovered: "NOT COVERED",
	notPassing: "NOT PASSING",
	fileMissing: "TEST FILE NOT REPORTED",
};

/** Lines of a level-2 section, ignoring headings inside code fences. */
function sectionLines(md, heading) {
	const out = [];
	let fence = null;
	let inSection = false;
	for (const line of md.split(/\r?\n/)) {
		const marker = line.match(/^\s*(`{3,}|~{3,})/);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
		} else if (!fence) {
			const h2 = line.match(/^##\s+(.*?)\s*$/);
			if (h2) {
				inSection = h2[1] === heading;
				continue;
			}
		}
		if (inSection) out.push(line);
	}
	return out;
}

export function parseCriteria(md) {
	const criteria = [];
	for (const line of sectionLines(md, "Acceptance Criteria")) {
		const m = line.match(CRITERION_LINE);
		if (!m) continue;
		if (criteria.some((c) => c.id === m[1])) throw new VerifyError(`plan.md defines ${m[1]} more than once`);
		criteria.push({ id: m[1], text: m[2].trim() });
	}
	if (!criteria.length) throw new VerifyError('plan.md has no acceptance criteria ("- **AC-<n>:** ..." under "## Acceptance Criteria")');
	return criteria;
}

export function normalizePath(path) {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** First token of a Test Plan "Test" cell when it looks like a file path, else null. */
export function testPathOf(cell) {
	const m = cell.replace(/`/g, "").trim().match(/^(\S+?\.[A-Za-z0-9]+)(?::|\s|$)/);
	return m ? normalizePath(m[1]) : null;
}

export function parseTestPlan(md) {
	const rows = [];
	for (const line of sectionLines(md, "Test Plan")) {
		if (!line.trim().startsWith("|")) continue;
		const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
		if (cells.length < 3 || /^[-:\s]+$/.test(cells[0]) || /^criterion$/i.test(cells[0])) continue;
		rows.push({ criterion: cells[0], test: cells[1], path: testPathOf(cells[1]) });
	}
	return rows;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text) {
	return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
		if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
		return ENTITIES[e.toLowerCase()];
	});
}

function attributes(tag) {
	const attrs = {};
	for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = decode(m[2] ?? m[3]);
	return attrs;
}

const ATTR_TAG = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const JUNIT_TOKEN = new RegExp(`<testsuite\\b${ATTR_TAG}>|</testsuite>|<testcase\\b(?:${ATTR_TAG}/>|${ATTR_TAG}>[\\s\\S]*?</testcase>)`, "g");
const TESTCASE_OPEN = new RegExp(`^<testcase\\b${ATTR_TAG}`);

/** Parses JUnit XML (regex based, no dependencies). */
export function parseJUnit(xml) {
	// One pass, so a "<!--" inside CDATA output cannot hide the testcases that follow it.
	const clean = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
	const tests = [];
	const suites = [];
	for (const m of clean.matchAll(JUNIT_TOKEN)) {
		const token = m[0];
		if (token.startsWith("</testsuite")) {
			suites.pop();
		} else if (token.startsWith("<testsuite")) {
			if (!token.endsWith("/>")) suites.push(attributes(token));
		} else {
			const open = token.match(TESTCASE_OPEN)[0];
			const attrs = attributes(open);
			const body = token.endsWith("</testcase>") ? token.slice(open.length) : "";
			let status = "passed";
			if (/<(failure|error)\b/.test(body)) status = "failed";
			else if (/<skipped\b/.test(body)) status = "skipped";
			const suiteFile = [...suites].reverse().find((s) => s.file)?.file;
			const classname = attrs.classname ?? "";
			const file = attrs.file ?? suiteFile ?? (classname.includes("/") ? classname : null);
			tests.push({ name: attrs.name ?? "", match: [attrs.name, classname].filter(Boolean).join(" "), status, file: file ? normalizePath(file) : null });
		}
	}
	return tests;
}

/** Parses Jest or Vitest JSON (`testResults[].assertionResults[]`). */
export function parseJestJson(text) {
	let data;
	try {
		data = JSON.parse(text.replace(/^\uFEFF/, ""));
	} catch (err) {
		throw new VerifyError(`report is not valid JSON: ${err.message}`);
	}
	if (!Array.isArray(data?.testResults)) throw new VerifyError('JSON report has no "testResults" array (expected Jest or Vitest JSON)');
	const tests = [];
	for (const suite of data.testResults) {
		const file = typeof suite.name === "string" ? normalizePath(suite.name) : null;
		for (const a of suite.assertionResults ?? []) {
			const name = a.fullName ?? a.title ?? "";
			const status = a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "skipped";
			tests.push({ name, match: [a.fullName, a.title, ...(a.ancestorTitles ?? [])].filter(Boolean).join(" "), status, file });
		}
	}
	return tests;
}

export function parseReport(text, label = "report") {
	const head = text.trimStart();
	let tests;
	if (head.startsWith("<")) tests = parseJUnit(text);
	else if (head.startsWith("{")) tests = parseJestJson(text);
	else throw new VerifyError(`${label} is neither JUnit XML nor Jest/Vitest JSON`);
	if (!tests.length) throw new VerifyError(`${label} contains no test results`);
	return tests.map((t) => ({ ...t, report: label }));
}

export function criteriaInText(text) {
	return [...new Set([...text.matchAll(CRITERION_TOKEN)].map((m) => m[1].toUpperCase()))];
}

function reportsFile(reportedFiles, planPath) {
	return reportedFiles.some((f) => f === planPath || f.endsWith(`/${planPath}`));
}

/**
 * @param {string} planMd
 * @param {{name: string, match: string, status: string, file: string|null, report: string}[]} tests
 */
export function evaluate(planMd, tests, { requireTestFiles = false } = {}) {
	const criteria = parseCriteria(planMd);
	const ids = new Set(criteria.map((c) => c.id));
	const rows = parseTestPlan(planMd);
	for (const row of rows) {
		if (!ids.has(row.criterion)) throw new VerifyError(`Test Plan row "${row.criterion}" is not an acceptance criterion`);
	}

	const mapped = new Map(criteria.map((c) => [c.id, []]));
	const unmapped = [];
	for (const test of tests) {
		const hits = criteriaInText(test.match).filter((id) => ids.has(id));
		if (!hits.length) unmapped.push(test);
		for (const id of hits) mapped.get(id).push(test);
	}

	const reportedFiles = [...new Set(tests.map((t) => t.file).filter(Boolean))];
	const results = criteria.map((c) => {
		const own = mapped.get(c.id);
		const failed = own.filter((t) => t.status === "failed");
		const passed = own.filter((t) => t.status === "passed");
		let verdict = VERDICTS.pass;
		let reason = "";
		if (failed.length) {
			verdict = VERDICTS.fail;
			reason = `${failed.length} mapped test(s) failed: ${failed.map((t) => `"${t.name}"`).join(", ")}`;
		} else if (!own.length) {
			verdict = VERDICTS.notCovered;
			reason = "no reported test names this criterion";
		} else if (!passed.length) {
			verdict = VERDICTS.notPassing;
			reason = "every mapped test was skipped";
		} else if (requireTestFiles) {
			const planned = rows.filter((r) => r.criterion === c.id);
			const paths = planned.map((r) => r.path);
			if (!planned.length || paths.some((p) => !p)) {
				verdict = VERDICTS.fileMissing;
				reason = `Test Plan row for ${c.id} names no test file`;
			} else {
				const absent = paths.filter((p) => !reportsFile(reportedFiles, p));
				if (absent.length) {
					verdict = VERDICTS.fileMissing;
					reason = `Test Plan file(s) not in any report: ${absent.join(", ")}`;
				}
			}
		}
		return { id: c.id, text: c.text, tests: own.map((t) => ({ name: t.name, status: t.status, file: t.file })), verdict, reason };
	});

	return {
		pass: results.every((r) => r.verdict === VERDICTS.pass),
		criteria: results,
		unmapped: unmapped.map((t) => ({ name: t.name, status: t.status, file: t.file })),
		testCount: tests.length,
	};
}

const cell = (text) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function renderTable(result) {
	const out = ["| Criterion | Tests | Verdict |", "|---|---|---|"];
	for (const r of result.criteria) {
		const tests = r.tests.length ? r.tests.map((t) => `${t.name} (${t.status})`).join("; ") : "none";
		out.push(`| ${r.id} | ${cell(tests)} | ${r.verdict} |`);
	}
	const bad = result.criteria.filter((r) => r.verdict !== VERDICTS.pass);
	if (bad.length) {
		out.push("", "Unverified criteria:");
		for (const r of bad) out.push(`- ${r.id}: ${r.reason}`);
	}
	if (result.unmapped.length) {
		const shown = result.unmapped.slice(0, 20);
		out.push("", `Unmapped tests (informational, ${result.unmapped.length} of ${result.testCount}):`);
		for (const t of shown) out.push(`- ${t.name} (${t.status})`);
		if (result.unmapped.length > shown.length) out.push(`- ... and ${result.unmapped.length - shown.length} more`);
	}
	return `${out.join("\n")}\n`;
}

const USAGE = "Usage: node verify-criteria.mjs --plan <plan.md> --report <file> [--report <file> ...] [--require-test-files] [--json]";

function parseArgs(args) {
	const parsed = { plan: null, reports: [], requireTestFiles: false, json: false };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--plan" && next) parsed.plan = args[++i];
		else if (args[i] === "--report" && next) parsed.reports.push(args[++i]);
		else if (args[i] === "--require-test-files") parsed.requireTestFiles = true;
		else if (args[i] === "--json") parsed.json = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else throw new VerifyError(`unknown or incomplete argument "${args[i]}"`);
	}
	return parsed;
}

export async function runVerifyCriteria(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help) {
			console.log(`${USAGE}\nOptions:\n  --require-test-files  Each Test Plan test file must appear among the reported test files\n  --json                Print the result as JSON`);
			return 0;
		}
		if (!opts.plan || !opts.reports.length) {
			console.error(USAGE);
			return 1;
		}
		const planMd = await readFile(opts.plan, "utf-8");
		const tests = [];
		for (const path of opts.reports) tests.push(...parseReport(await readFile(path, "utf-8"), path));
		const result = evaluate(planMd, tests, { requireTestFiles: opts.requireTestFiles });
		process.stdout.write(opts.json ? `${JSON.stringify(result, null, 2)}\n` : renderTable(result));
		if (!result.pass) {
			const bad = result.criteria.filter((r) => r.verdict !== VERDICTS.pass).length;
			console.error(`✗ [criteria-verify] ${bad} of ${result.criteria.length} acceptance criteria are not verified`);
			return 1;
		}
		console.error(`✓ [criteria-verify] All ${result.criteria.length} acceptance criteria have a passing test (${opts.plan})`);
		return 0;
	} catch (err) {
		console.error(`✗ [criteria-verify] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runVerifyCriteria().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
