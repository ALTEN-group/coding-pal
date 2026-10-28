#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const PROVE_SECTIONS = [
	"Deterministic Controls",
	"Criteria Verification",
	"Semantic Review",
	"Findings",
	"Verdict",
];

export const REQUIRED_CONTROLS = [
	"validate-think",
	"validate-plan",
	"branch-guard",
	"code-loop",
	"control-guard",
	"secret-guard",
	"dependency-guard",
	"scope-guard",
	"task-gate",
	"criteria-verify",
	"test-probe",
	"preview-smoke",
	"validate-pr",
];

export const SEMANTIC_DIMENSIONS = [
	"Client Intent",
	"Behavioral Experience",
	"Safety & Blast Radius",
];

const NONE = "_None._";
const PLACEHOLDER = /^(tbd|todo|n\/a|\.\.\.|<[^>]*>)$/i;

const USAGE = `Usage: node validate-prove.mjs (--prove <prove.md> [--plan <plan.md>] [--think <think.md>] | --dir <specs/issue-n>)
          [--stage draft|pass] [--root <workspace>]
`;

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

function isPlaceholder(value) {
	return !value || PLACEHOLDER.test(value.trim());
}

function maskFences(markdown, filename = "prove.md") {
	let fence = null;
	const masked = markdown.split("\n").map((line) => {
		const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
		if (fence) {
			if (m && m[1][0] === fence.char && m[1].length >= fence.len && !m[2].trim()) fence = null;
			return "\u0001".repeat(line.length);
		}
		if (m) {
			fence = { char: m[1][0], len: m[1].length };
			return "\u0001".repeat(line.length);
		}
		return line;
	});
	if (fence) fail(`${filename} contains an unclosed code fence`);
	return masked.join("\n");
}

function splitSections(markdown, filename, required = null) {
	const masked = maskFences(markdown, filename);
	const matches = [...masked.matchAll(/^## (.+)$/gm)];
	const names = matches.map((m) => m[1].trim());
	if (required) {
		if (names.length !== required.length || names.some((n, i) => n !== required[i])) {
			fail(`${filename} must contain exactly these level-two headings, in order: ${required.map((h) => `## ${h}`).join(", ")}`);
		}
	}
	const preamble = matches.length ? markdown.slice(0, matches[0].index).trim() : markdown.trim();
	const sections = {};
	matches.forEach((m, i) => {
		const start = m.index + m[0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		sections[names[i]] = markdown.slice(start, end).trim();
	});
	return { preamble, sections };
}

function parseFields(body) {
	const masked = maskFences(body).split("\n");
	const entries = [];
	const stray = [];
	body.split("\n").forEach((line, i) => {
		const m = masked[i].match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) entries.push([m[1].trim(), m[2]]);
		else if (!line.trim()) return;
		else if (entries.length) entries[entries.length - 1][1] += `\n${line}`;
		else stray.push(line.trim());
	});
	return { entries: entries.map(([label, value]) => [label, value.trim()]), stray };
}

function fieldMap(body, where, filename = "prove.md") {
	const { entries } = parseFields(body);
	const map = new Map();
	for (const [label, value] of entries) {
		if (map.has(label)) fail(`${filename} ${where} repeats the field "${label}"`);
		map.set(label, value);
	}
	return map;
}

function parseTable(body, columns, where, filename = "prove.md") {
	const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
	if (lines.length < 3) fail(`${filename} "${where}" must contain a Markdown table with a header, a separator, and at least one row`);
	const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	const header = cells(lines[0]);
	if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
		fail(`${filename} "${where}" table columns must be exactly: ${columns.join(" | ")}`);
	}
	return lines.slice(2).map((line) => {
		const row = cells(line);
		if (row.length !== columns.length) fail(`${filename} "${where}" row has ${row.length} cells, expected ${columns.length}: ${line}`);
		return row;
	});
}

function readPlanCriteria(planText) {
	const { sections } = splitSections(normalizeNewlines(planText), "plan.md");
	if (sections["Acceptance Criteria"] === undefined) fail('plan.md has no "## Acceptance Criteria" section');
	const criteria = [...sections["Acceptance Criteria"].matchAll(/^- \*\*(AC-\d+):\*\*/gm)].map((m) => m[1]);
	if (!criteria.length) fail("plan.md lists no acceptance criteria");
	return criteria;
}

function checkHeader(preamble, ctx) {
	const lines = preamble.split("\n").filter((l) => l.trim());
	if (!lines.length || !/^# Prove:\s+\S+/.test(lines[0])) {
		fail('prove.md must start with "# Prove: <Title>"');
	}
	const rest = lines.slice(1).join("\n");
	const fields = fieldMap(rest, "header");
	const issue = fields.get("Issue");
	if (!issue || !/^#\d+$/.test(issue)) fail('prove.md header must include "- **Issue:** #<n>"');
	if (ctx.issue && issue !== `#${ctx.issue}`) {
		fail(`prove.md header Issue is ${issue} but work item directory is issue-${ctx.issue}`);
	}
	const pr = fields.get("PR");
	if (!pr || !/^#\d+$/.test(pr)) fail('prove.md header must include "- **PR:** #<pr>"');
	for (const [label, file] of [["Think", "think.md"], ["Plan", "plan.md"]]) {
		const raw = fields.get(label);
		if (!raw) fail(`prove.md header is missing "- **${label}:**"`);
		const m = raw.match(/^`([^`\n]+)`$/);
		if (!m) fail(`prove.md header "${label}" must be a workspace-relative path in backticks (found: "${raw}")`);
		const rel = m[1].replace(/^\.\//, "");
		if (ctx.linkExists && !ctx.linkExists(rel)) fail(`prove.md header "${label}" link "${rel}" does not exist`);
		if (ctx.linkIsWorkItemFile && !ctx.linkIsWorkItemFile(rel, file)) {
			fail(`prove.md header "${label}" link "${rel}" is not the ${file} of this work item`);
		}
	}
	for (const label of ["Branch", "Base"]) {
		const raw = fields.get(label);
		if (!raw || isPlaceholder(raw.replace(/^`|`$/g, ""))) {
			fail(`prove.md header is missing a valid "- **${label}:**" field`);
		}
	}
}

function checkControls(section) {
	const rows = parseTable(section, ["Control", "Status", "Evidence"], "## Deterministic Controls");
	const seen = new Set();
	let failedCount = 0;
	for (const [controlRaw, status, evidence] of rows) {
		const control = controlRaw.replace(/^`|`$/g, "").trim();
		if (seen.has(control)) fail(`prove.md "## Deterministic Controls" lists "${control}" more than once`);
		seen.add(control);
		const isNA = /^N\/A\s*\([^()]+\)$/i.test(status);
		if (status !== "PASS" && status !== "FAIL" && !isNA) {
			fail(`prove.md control "${control}" has invalid Status "${status}"; must be "PASS", "FAIL", or "N/A (<reason>)"`);
		}
		if (isPlaceholder(evidence)) fail(`prove.md control "${control}" has empty or placeholder Evidence`);
		if (status === "FAIL") failedCount++;
	}
	const missing = REQUIRED_CONTROLS.filter((c) => !seen.has(c));
	if (missing.length) {
		fail(`prove.md "## Deterministic Controls" is missing required controls: ${missing.join(", ")}`);
	}
	return { total: rows.length, failedCount };
}

function checkCriteria(section, planCriteria) {
	const rows = parseTable(section, ["Criterion", "Implementation Evidence", "Test Evidence", "Status"], "## Criteria Verification");
	const seen = new Set();
	let failedCount = 0;
	for (const [criterionRaw, implEvidence, testEvidence, status] of rows) {
		const criterion = criterionRaw.replace(/^\*\*|\*\*$/g, "").trim();
		if (planCriteria && !planCriteria.includes(criterion)) {
			fail(`prove.md "## Criteria Verification" row "${criterion}" is not an acceptance criterion in plan.md`);
		}
		if (seen.has(criterion)) fail(`prove.md "## Criteria Verification" lists ${criterion} more than once`);
		seen.add(criterion);
		if (status !== "PASS" && status !== "FAIL") {
			fail(`prove.md criterion ${criterion} has invalid Status "${status}"; must be "PASS" or "FAIL"`);
		}
		if (isPlaceholder(implEvidence)) fail(`prove.md criterion ${criterion} has empty or placeholder Implementation Evidence`);
		if (isPlaceholder(testEvidence)) fail(`prove.md criterion ${criterion} has empty or placeholder Test Evidence`);
		if (status === "FAIL") failedCount++;
	}
	if (planCriteria) {
		const missing = planCriteria.filter((c) => !seen.has(c));
		if (missing.length) fail(`prove.md "## Criteria Verification" is missing acceptance criteria from plan.md: ${missing.join(", ")}`);
	}
	return { total: rows.length, failedCount };
}

function checkSemanticReview(section) {
	const { entries, stray } = parseFields(section);
	if (stray.length) fail(`prove.md "## Semantic Review" must contain only field bullets; found stray text: "${stray[0]}"`);
	const fields = fieldMap(section, "## Semantic Review");
	for (const dim of SEMANTIC_DIMENSIONS) {
		if (!fields.has(dim)) fail(`prove.md "## Semantic Review" is missing "- **${dim}:**"`);
	}
	for (const key of fields.keys()) {
		if (!SEMANTIC_DIMENSIONS.includes(key)) fail(`prove.md "## Semantic Review" has unknown field "${key}"`);
	}
	let failedCount = 0;
	for (const dim of SEMANTIC_DIMENSIONS) {
		const val = fields.get(dim);
		const m = val.match(/^(PASS|FAIL)\s*(?:—|--|-|:)\s*(.+)$/s);
		if (!m) {
			fail(`prove.md Semantic Review "${dim}" must start with "PASS — <evidence>" or "FAIL — <evidence>" (found: "${val}")`);
		}
		const [, status, rationale] = m;
		if (isPlaceholder(rationale) || rationale.trim().length < 15) {
			fail(`prove.md Semantic Review "${dim}" must include substantive evidence (at least 15 chars)`);
		}
		if (status === "FAIL") failedCount++;
	}
	return { failedCount };
}

function checkFindings(section) {
	if (section.trim() === NONE) return [];
	const { entries, stray } = parseFields(section);
	if (!entries.length || stray.length) {
		fail(`prove.md "## Findings" must be "${NONE}" or numbered "- **FINDING-<n>:** <detail>" bullets`);
	}
	entries.forEach(([label, val], idx) => {
		const expected = `FINDING-${idx + 1}`;
		if (label !== expected) {
			fail(`prove.md "## Findings" bullet ${idx + 1} must be labeled "${expected}" (found "${label}")`);
		}
		if (isPlaceholder(val) || val.trim().length < 15) {
			fail(`prove.md "${label}" must describe the failing control/file and required fix`);
		}
	});
	return entries;
}

function checkVerdict(section, controls, criteria, semantic, findings) {
	const fields = fieldMap(section, "## Verdict");
	const status = fields.get("Status");
	if (status !== "PASS" && status !== "FAIL") {
		fail(`prove.md "## Verdict" Status must be "PASS" or "FAIL" (found: "${status ?? ""}")`);
	}
	const summary = fields.get("Summary");
	if (isPlaceholder(summary) || summary.trim().length < 15) {
		fail('prove.md "## Verdict" Summary must provide a concise, non-placeholder rationale');
	}
	const totalFailures = controls.failedCount + criteria.failedCount + semantic.failedCount;
	if (status === "PASS") {
		if (totalFailures > 0) {
			fail(`prove.md Verdict is PASS, but ${totalFailures} check(s) failed in Controls, Criteria, or Semantic Review`);
		}
		if (findings.length > 0) {
			fail(`prove.md Verdict is PASS, but "## Findings" lists ${findings.length} finding(s) instead of "${NONE}"`);
		}
	} else {
		if (totalFailures === 0) {
			fail("prove.md Verdict is FAIL, but every Control, Criterion, and Semantic Review dimension is marked PASS");
		}
		if (findings.length === 0) {
			fail(`prove.md Verdict is FAIL, but "## Findings" is "${NONE}"; list at least one "- **FINDING-1:**" entry`);
		}
	}
	return { status, summary };
}

export function validateProveContent(rawProve, ctx = {}) {
	const stage = ctx.stage ?? "draft";
	if (!["draft", "pass"].includes(stage)) fail('--stage must be "draft" or "pass"');
	const text = normalizeNewlines(rawProve).replace(/<!--[\s\S]*?-->/g, "");
	if (!text.trim()) fail("prove.md is empty");
	if (/line[\s-]*by[\s-]*line/i.test(text)) {
		fail("prove.md must not claim line-by-line review: governance bans it as a gate; validate intent, behaviour, and safety instead");
	}
	const { preamble, sections } = splitSections(text, "prove.md", PROVE_SECTIONS);
	for (const name of PROVE_SECTIONS) {
		if (!sections[name]) fail(`prove.md "## ${name}" is empty`);
	}
	checkHeader(preamble, ctx);
	const planCriteria = ctx.planText ? readPlanCriteria(ctx.planText) : null;
	const controls = checkControls(sections["Deterministic Controls"]);
	const criteria = checkCriteria(sections["Criteria Verification"], planCriteria);
	const semantic = checkSemanticReview(sections["Semantic Review"]);
	const findings = checkFindings(sections.Findings);
	const verdict = checkVerdict(sections.Verdict, controls, criteria, semantic, findings);

	if (stage === "pass" && verdict.status !== "PASS") {
		fail(`prove.md Verdict Status is FAIL (${findings.length} finding(s)); required PASS for --stage pass`);
	}

	return {
		status: verdict.status,
		controls: controls.total,
		criteria: criteria.total,
		findings: findings.length,
	};
}

function fileIsReadable(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function readOptional(path) {
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

export function runValidator(args = process.argv.slice(2)) {
	const opts = { prove: null, plan: null, think: null, dir: null, stage: "draft", root: process.cwd(), help: false };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--prove" && args[i + 1]) opts.prove = args[++i];
		else if (args[i] === "--plan" && args[i + 1]) opts.plan = args[++i];
		else if (args[i] === "--think" && args[i + 1]) opts.think = args[++i];
		else if (args[i] === "--dir" && args[i + 1]) opts.dir = args[++i];
		else if (args[i] === "--stage" && args[i + 1]) opts.stage = args[++i];
		else if (args[i] === "--root" && args[i + 1]) opts.root = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") opts.help = true;
		else {
			console.error(`✗ unknown option or missing value for "${args[i]}"\n${USAGE}`);
			return 1;
		}
	}
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	if (!opts.prove && !opts.dir) {
		console.error(USAGE);
		return 1;
	}

	try {
		const specDir = opts.dir ? resolve(opts.dir) : resolve(opts.prove, "..");
		const provePath = opts.prove ? resolve(opts.prove) : join(specDir, "prove.md");
		const planPath = opts.plan ? resolve(opts.plan) : join(specDir, "plan.md");
		const thinkPath = opts.think ? resolve(opts.think) : join(specDir, "think.md");

		const proveText = readOptional(provePath);
		if (proveText === null) fail(`prove.md not found: ${provePath}`);
		const planText = readOptional(planPath);
		if (planText === null) fail(`plan.md not found: ${planPath}`);
		const thinkText = readOptional(thinkPath);
		if (thinkText === null) fail(`think.md not found: ${thinkPath}`);

		const issue = basename(specDir).match(/^issue-(\d+)$/)?.[1] ?? null;
		const ctx = {
			stage: opts.stage,
			planText,
			thinkText,
			issue,
			linkExists: (rel) => fileIsReadable(resolve(opts.root, rel)),
			linkIsWorkItemFile: (rel, file) => resolve(opts.root, rel) === resolve(specDir, file),
		};
		const res = validateProveContent(proveText, ctx);
		console.log(`✓ [prove] Validated (${res.status}): ${res.controls} controls, ${res.criteria} criteria, ${res.findings} finding(s)`);
		return 0;
	} catch (err) {
		console.error(`✗ [prove] Validation failed: ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const code = runValidator();
	if (code !== 0) process.exit(code);
}
