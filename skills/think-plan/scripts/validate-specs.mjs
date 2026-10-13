#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

export const TIERS = ["Low", "Medium", "High", "Critical"];

const THINK_REQUIRED_H2 = [
	"Business Need & Outcome",
	"Options Considered",
	"Chosen Approach",
	"Forge Asset Bindings",
	"System Flow & Responsibilities",
	"Constraints & Invariants",
	"Blast Radius",
	"Decision Record",
	"Persistent Context Updates",
	"Ambiguities & Open Questions",
];

const PLAN_REQUIRED_H2 = [
	"File Scope & Boundaries",
	"Prerequisites & Context",
	"Acceptance Criteria",
	"Implementation Checklist",
	"Test Plan",
	"Open Questions & Assumptions",
	"Blast Radius Check",
	"Done When",
	"Approval",
];

export const STAGES = ["draft", "approved"];
const PENDING = "Pending";

const STEP_REQUIRED_FIELDS = ["Files", "Action", "New Code", "Verification", "Bootable Check", "Serves"];
const OPTION_SOURCES = ["Forge reuse", "Custom build", "Hybrid"];
const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const MIGRATION_PATH = /(migration|changelog|liquibase|\.sql$|(^|\/)db\/)/i;
const NO_ANSWER = /^(_none\._|none|n\/a|no|nothing|no rollback|not applicable|tbd)\.?$/i;
const BINDING_LABEL = /^forge\/[a-z0-9]+(?:-[a-z0-9]+)*@\S+$/;
const THINK_FENCE_INFO = new Set(["", "text", "txt", "plaintext", "mermaid"]);
const FENCE_BLOCK = /^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\1[`~]*[ \t]*$/gm;

function isPlaceholder(value) {
	return !value || PLACEHOLDER.test(value.trim());
}

/** Replaces every line inside a fenced code block with a filler so structural regexes cannot match code. */
function maskFences(markdown, filename = "document") {
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

function splitSections(markdown, required, filename) {
	const masked = maskFences(markdown, filename);
	const matches = [...masked.matchAll(/^## (.+)$/gm)];
	const names = matches.map((m) => m[1].trim());
	if (names.length !== required.length) {
		fail(`${filename} must contain exactly ${required.length} level-two headings: ${required.map((h) => `## ${h}`).join(", ")}`);
	}
	const sections = {};
	matches.forEach((m, i) => {
		if (names[i] !== required[i]) fail(`${filename} heading #${i + 1} is "## ${names[i]}", expected "## ${required[i]}"`);
		const start = m.index + m[0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		const body = markdown.slice(start, end).trim();
		if (!body) fail(`${filename} has empty section for "## ${names[i]}"`);
		sections[names[i]] = body;
	});
	return sections;
}

/** Parses "- **Label:** value" fields; continuation lines (tables, sub-bullets, code) belong to the previous field. */
function parseFields(body) {
	const masked = maskFences(body).split("\n");
	const entries = [];
	body.split("\n").forEach((line, i) => {
		const m = masked[i].match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) entries.push([m[1].trim(), m[2]]);
		else if (entries.length) entries[entries.length - 1][1] += `\n${line}`;
	});
	return entries.map(([label, value]) => [label, value.trim()]);
}

function fieldMap(entries) {
	const map = new Map();
	for (const [label, value] of entries) map.set(label.toLowerCase(), value);
	return map;
}

const SIGNED_BY = /^signed by (.+?) \(Architect\) on (\d{4}-\d{2}-\d{2})\.?$/i;
const NOT_A_PERSON = /(^|[^a-z0-9])(copilot|claude|gpt|gemini|chatgpt|openai|anthropic|bot|agent|dependabot|renovate|github-actions|ai|llm)([^a-z0-9]|$)/i;
const SIGNER_PLACEHOLDER = /^(tbd|x|<[^>]*>)$/i;

function isValidDate(value) {
	return !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/** A signed decision record carries a named human Architect and a real date; AI drafts, the Architect signs. */
function checkSignature(status, filename) {
	const m = status.match(SIGNED_BY);
	if (!m) fail(`${filename} Decision Record "Status" "${status}" must read "Signed by <name> (Architect) on YYYY-MM-DD"`);
	const name = m[1].trim();
	if (SIGNER_PLACEHOLDER.test(name)) fail(`${filename} Decision Record signer "${name}" is a placeholder; name the Architect`);
	if (NOT_A_PERSON.test(name)) fail(`${filename} Decision Record signer "${name}" must be a person, never an AI or automation`);
	if (!isValidDate(m[2])) fail(`${filename} Decision Record signature date ${m[2]} must be a valid date`);
}

const APPROVER = /^(.+?) \((Developer|Architect)\) on (\d{4}-\d{2}-\d{2})$/;

/**
 * Checks an "Approved By" value for the given stage. A draft carries exactly "Pending"; an approved file names
 * the humans who approved it, in one of the allowed role sequences. AI drafts, people approve.
 * @param {string[][]} allowedRoles
 * @returns {{status: "pending"|"approved", approvals: {name: string, role: string, date: string}[]}}
 */
function checkApproval(value, stage, allowedRoles, where, filename) {
	if (stage === "draft") {
		if (value !== PENDING) fail(`${filename} ${where} "Approved By" must be exactly "${PENDING}" at the draft stage; only a person approves, after review (found "${value}")`);
		return { status: "pending", approvals: [] };
	}
	const approvals = value.split(";").map((part) => {
		const m = part.trim().match(APPROVER);
		return m && { name: m[1].trim(), role: m[2], date: m[3] };
	});
	const form = (roles) => roles.map((role) => `<name> (${role}) on YYYY-MM-DD`).join("; ");
	const roles = approvals.map((a) => a?.role).join(",");
	if (approvals.some((a) => !a) || !allowedRoles.some((r) => r.join(",") === roles)) {
		fail(`${filename} ${where} "Approved By" "${value}" must read "${allowedRoles.map(form).join('" or "')}" at the approved stage`);
	}
	for (const { name, role, date } of approvals) {
		if (SIGNER_PLACEHOLDER.test(name)) fail(`${filename} ${where} approver "${name}" is a placeholder; name the ${role}`);
		if (NOT_A_PERSON.test(name)) fail(`${filename} ${where} approver "${name}" must be a person, never an AI or automation`);
		if (!isValidDate(date)) fail(`${filename} ${where} approval date ${date} must be a valid date`);
	}
	if (new Set(approvals.map((a) => a.name.toLowerCase())).size !== approvals.length) {
		fail(`${filename} ${where} "Approved By" must name two different people`);
	}
	return { status: "approved", approvals };
}

function need(map, label, where, filename, { allowNone = true } = {}) {
	const value = map.get(label.toLowerCase());
	if (value === undefined) fail(`${filename} "${where}" is missing the "- **${label}:**" field`);
	if (!value || (!value.includes("\n") && isPlaceholder(value))) fail(`${filename} "${where}" field "${label}" is empty or a placeholder`);
	if (!allowNone && value === NONE) fail(`${filename} "${where}" field "${label}" must not be "${NONE}"`);
	return value;
}

function parseTier(value, label, filename) {
	const tier = TIERS.find((t) => t.toLowerCase() === value.split(/[\s.,;:(]/)[0].toLowerCase());
	if (!tier) fail(`${filename} ${label} must start with one of: ${TIERS.join(", ")}`);
	return tier;
}

function extractPaths(value) {
	return [...value.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim().replace(/^\.\//, "")).filter(Boolean);
}

function checkPath(path, where, filename) {
	if (path.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(path) || /\s/.test(path)) {
		fail(`${filename} ${where} path "${path}" must be a workspace-relative path without spaces or ".."`);
	}
}

function parseTable(body, columns, where, filename) {
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

/** think.md carries no source code and no task checklist: only text or diagram fences, no checkbox items, no step headings. */
function checkThinkHasNoCode(markdown, filename) {
	for (const m of markdown.matchAll(/^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`~]*)/gm)) {
		if (!THINK_FENCE_INFO.has(m[1].toLowerCase())) fail(`${filename} must not contain source code; found a "${m[1]}" code block (code belongs in the Plan's "New Code" fields)`);
	}
	const masked = maskFences(markdown, filename);
	if (/^\s*[-*] \[[ xX]\]/m.test(masked)) fail(`${filename} must not contain a task checklist; steps belong in the Plan`);
	if (/^#{3,4} Step \d+/m.test(masked)) fail(`${filename} must not contain implementation steps; they belong in the Plan`);
}

/**
 * Validates the contents of a think.md markdown file.
 * @param {string} rawMarkdown
 * @param {string} [filename="think.md"]
 * @param {{stage?: "draft"|"approved"}} [settings]
 */
export function validateThinkContent(rawMarkdown, filename = "think.md", settings = {}) {
	const stage = settings.stage ?? "draft";
	if (!STAGES.includes(stage)) fail(`stage "${stage}" must be one of: ${STAGES.join(", ")}`);
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);

	const h1 = markdown.match(/^# Think:\s+(.+)$/m);
	if (!h1 || !h1[1].trim()) fail(`${filename} must start with a level-one heading: "# Think: <Feature or Task Name>"`);

	const sections = splitSections(markdown, THINK_REQUIRED_H2, filename);
	checkThinkHasNoCode(markdown, filename);

	const business = fieldMap(parseFields(sections["Business Need & Outcome"]));
	for (const label of ["Backlog Issue", "Problem Statement", "Consumer", "Desired Outcome"]) {
		need(business, label, "## Business Need & Outcome", filename, { allowNone: false });
	}

	const options = parseOptions(sections["Options Considered"], filename);

	const chosen = fieldMap(parseFields(sections["Chosen Approach"]));
	const selectedRaw = need(chosen, "Selected", "## Chosen Approach", filename, { allowNone: false });
	const selectedMatch = selectedRaw.match(/^Option (\d+)\b/i);
	const selected = selectedMatch && options.find((o) => o.number === Number(selectedMatch[1]));
	if (!selected) fail(`${filename} "Selected" must name one of the options, for example "Option 1" (found "${selectedRaw}")`);
	need(chosen, "Reasoning", "## Chosen Approach", filename, { allowNone: false });
	const approval = checkApproval(need(chosen, "Approved By", "## Chosen Approach", filename, { allowNone: false }), stage, [["Developer", "Architect"]], "## Chosen Approach", filename);
	if (selected.source === "Custom build") {
		need(chosen, "Custom Build Reason", "## Chosen Approach", filename, { allowNone: false });
	}

	const bindings = parseFields(sections["Forge Asset Bindings"]);
	if (!bindings.length) fail(`${filename} "## Forge Asset Bindings" must list bindings as "- **<asset>:** <how it is composed>" or "- **None:** <reason>"`);
	for (const [label, value] of bindings) {
		if (!value || isPlaceholder(value)) fail(`${filename} Forge binding "${label}" needs a description`);
	}
	const hasNone = bindings.some(([label]) => label.toLowerCase() === "none");
	for (const [label] of bindings) {
		if (label.toLowerCase() !== "none" && !BINDING_LABEL.test(label)) fail(`${filename} Forge binding "${label}" must be formatted "forge/<asset-id>@<version>" (or "None")`);
	}
	if (hasNone && bindings.length > 1) fail(`${filename} Forge Asset Bindings cannot combine "None" with real bindings`);
	if (hasNone && selected.source !== "Custom build") {
		fail(`${filename} the selected option uses the Forge (${selected.source}), so Forge Asset Bindings must list the bound assets`);
	}
	if (!hasNone && selected.source === "Custom build") {
		fail(`${filename} the selected option is a custom build, so Forge Asset Bindings must state "- **None:** <reason>"`);
	}

	const flow = fieldMap(parseFields(sections["System Flow & Responsibilities"]));
	for (const label of ["Request Tracing", "Component Responsibilities", "Boundaries"]) {
		need(flow, label, "## System Flow & Responsibilities", filename, { allowNone: false });
	}

	const constraints = fieldMap(parseFields(sections["Constraints & Invariants"]));
	for (const label of ["Decision Records", "Non-Negotiable Rules", "Side-Effect Constraints"]) {
		need(constraints, label, "## Constraints & Invariants", filename);
	}

	const blast = fieldMap(parseFields(sections["Blast Radius"]));
	const tier = parseTier(need(blast, "Tier", "## Blast Radius", filename, { allowNone: false }), "Blast Radius Tier", filename);
	need(blast, "Affected", "## Blast Radius", filename, { allowNone: false });
	need(blast, "Rationale", "## Blast Radius", filename, { allowNone: false });
	const rollback = need(blast, "Rollback", "## Blast Radius", filename);
	if ((tier === "High" || tier === "Critical") && NO_ANSWER.test(rollback)) {
		fail(`${filename} a ${tier} blast radius must name the rollback mechanism`);
	}

	const decision = fieldMap(parseFields(sections["Decision Record"]));
	const required = need(decision, "Required", "## Decision Record", filename, { allowNone: false }).toLowerCase().split(/[\s.,;:(]/)[0];
	if (!["yes", "no"].includes(required)) fail(`${filename} Decision Record "Required" must be "yes" or "no"`);
	const decisionRequired = required === "yes";
	if (decisionRequired) {
		need(decision, "Record", "## Decision Record", filename, { allowNone: false });
		const status = need(decision, "Status", "## Decision Record", filename, { allowNone: false });
		if (!/^(drafted|signed)\b/i.test(status)) fail(`${filename} Decision Record "Status" must be "Drafted" (awaiting Architect) or "Signed by <name> (Architect) on YYYY-MM-DD"`);
		if (/^signed\b/i.test(status)) checkSignature(status, filename);
	} else {
		need(decision, "Reason", "## Decision Record", filename, { allowNone: false });
		if (tier === "Critical") fail(`${filename} a Critical blast radius requires a decision record`);
	}

	const updatesBody = sections["Persistent Context Updates"];
	const contextUpdates = [];
	if (updatesBody !== NONE) {
		const updates = parseFields(updatesBody);
		if (!updates.length || updates.some(([label]) => label.toLowerCase() !== "update")) {
			fail(`${filename} "## Persistent Context Updates" must be "${NONE}" or bullets formatted "- **Update:** \`path\` - what changes"`);
		}
		for (const [, value] of updates) {
			const paths = extractPaths(value);
			if (!paths.length) fail(`${filename} each Persistent Context update must name its file in backticks`);
			paths.forEach((p) => checkPath(p, "Persistent Context update", filename));
			contextUpdates.push(...paths);
		}
	}

	if (isPlaceholder(sections["Ambiguities & Open Questions"])) {
		fail(`${filename} "## Ambiguities & Open Questions" must list questions or contain "${NONE}"`);
	}

	return { title: h1[1].trim(), options, selected, tier, rollback, decisionRequired, contextUpdates, approval };
}

function parseOptions(body, filename) {
	const masked = maskFences(body);
	const heads = [...masked.matchAll(/^### Option (\d+):\s+(.+)$/gm)];
	if (heads.length < 2 || heads.length > 4) {
		fail(`${filename} "## Options Considered" must contain 2 to 4 options formatted "### Option <N>: <Name>" (found ${heads.length})`);
	}
	return heads.map((m, i) => {
		const number = Number(m[1]);
		if (number !== i + 1) fail(`${filename} option numbers must be sequential. Expected Option ${i + 1}, found Option ${number}`);
		const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
		const fields = fieldMap(parseFields(body.slice(m.index + m[0].length, end)));
		const where = `Option ${number}`;
		need(fields, "Approach", where, filename, { allowNone: false });
		const source = OPTION_SOURCES.find((s) => s.toLowerCase() === need(fields, "Source", where, filename, { allowNone: false }).toLowerCase());
		if (!source) fail(`${filename} ${where} "Source" must be one of: ${OPTION_SOURCES.join(", ")}`);
		for (const label of ["Trade-offs", "Cost", "Risk"]) need(fields, label, where, filename, { allowNone: false });
		return { number, name: m[2].trim(), source };
	});
}

function parseStepBlock(block, expectedNumber, filename) {
	const [headingLine, ...rest] = block.split("\n");
	const heading = headingLine.trim();
	const m = heading.match(/^### Step (\d+):\s+(.+)$/);
	if (!m) fail(`${filename} step heading must match format: "### Step <N>: <Name>" (found: "${heading}")`);
	const number = Number(m[1]);
	if (number !== expectedNumber) fail(`${filename} step numbers must be sequential. Expected Step ${expectedNumber}, found Step ${number}`);

	const entries = parseFields(rest.join("\n"));
	const expected = STEP_REQUIRED_FIELDS.map((f) => f.toLowerCase());
	const seen = new Set();
	let last = -1;
	for (const [label] of entries) {
		const key = label.toLowerCase();
		const idx = expected.indexOf(key);
		if (idx === -1) fail(`${filename} in Step ${number}: unexpected field "- **${label}:**"`);
		if (seen.has(key) || idx <= last) {
			fail(`${filename} in Step ${number}: fields are duplicated or out of order. Expected order: ${STEP_REQUIRED_FIELDS.join(", ")}`);
		}
		seen.add(key);
		last = idx;
	}
	const fields = fieldMap(entries);
	for (const field of STEP_REQUIRED_FIELDS) {
		if (!fields.get(field.toLowerCase())) fail(`${filename} in Step ${number}: missing or empty required field "- **${field}:**"`);
	}
	if (isPlaceholder(fields.get("action"))) fail(`${filename} in Step ${number}: "Action" is a placeholder`);
	for (const field of ["Verification", "Bootable Check"]) {
		if (!/`[^`\n]*\S[^`\n]*`/.test(fields.get(field.toLowerCase()))) {
			fail(`${filename} in Step ${number}: "${field}" must be a command in backticks, checked by a command and not by opinion`);
		}
	}

	const newCode = fields.get("new code");
	if (newCode !== NONE) {
		const blocks = [...newCode.matchAll(FENCE_BLOCK)];
		if (!blocks.length || blocks.every((b) => !b[2].trim())) {
			fail(`${filename} in Step ${number}: "New Code" must be a fenced code block with the code for this step, or "${NONE}" when the step writes no code`);
		}
		if (newCode.replace(FENCE_BLOCK, "").trim()) fail(`${filename} in Step ${number}: "New Code" must contain only fenced code blocks`);
	}

	const files = extractPaths(fields.get("files"));
	if (!files.length) fail(`${filename} in Step ${number}: "Files" must list explicit workspace-relative paths in backticks`);
	files.forEach((f) => checkPath(f, `Step ${number} file`, filename));
	const serves = [...fields.get("serves").matchAll(/\bAC-\d+\b/g)].map((s) => s[0]);
	if (!serves.length) fail(`${filename} in Step ${number}: "Serves" must reference at least one acceptance criterion such as AC-1`);

	return { step: number, name: m[2].trim(), files, serves, hasCode: newCode !== NONE };
}

function pathInScope(path, scope) {
	return scope.some((s) => (s.endsWith("/") ? path.startsWith(s) : path === s));
}

/**
 * Validates the contents of a plan.md markdown file.
 * @param {string} rawMarkdown
 * @param {string} [filename="plan.md"]
 * @param {{think?: ReturnType<typeof validateThinkContent>, allowOpenQuestions?: boolean, stage?: "draft"|"approved"}} [options]
 */
export function validatePlanContent(rawMarkdown, filename = "plan.md", options = {}) {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);

	const h1 = markdown.match(/^# Plan:\s+(.+)$/m);
	if (!h1 || !h1[1].trim()) fail(`${filename} must start with a level-one heading: "# Plan: <Feature or Task Name>"`);

	const sections = splitSections(markdown, PLAN_REQUIRED_H2, filename);

	if (!/think\.md/i.test(sections["Prerequisites & Context"])) {
		fail(`${filename} "## Prerequisites & Context" must reference the think.md specification it is derived from`);
	}
	const prerequisiteLines = sections["Prerequisites & Context"].split("\n").filter((line) => line.trim());
	if (prerequisiteLines.length < 2) {
		fail(`${filename} "## Prerequisites & Context" must list at least one dependency, environment variable, or service after the think.md reference, or "- None."`);
	}

	const scopeFields = fieldMap(parseFields(sections["File Scope & Boundaries"]));
	const inScope = extractPaths(need(scopeFields, "In Scope", "## File Scope & Boundaries", filename, { allowNone: false }));
	if (!inScope.length) fail(`${filename} "In Scope" must list the files agents may change, in backticks`);
	inScope.forEach((p) => checkPath(p, "In Scope", filename));
	const outOfScopeRaw = need(scopeFields, "Out of Scope", "## File Scope & Boundaries", filename);
	const outOfScope = extractPaths(outOfScopeRaw);
	if (outOfScopeRaw !== NONE && !outOfScope.length) fail(`${filename} "Out of Scope" must list files or directories in backticks, or "${NONE}"`);
	const overlap = inScope.find((p) => pathInScope(p, outOfScope));
	if (overlap) fail(`${filename} "${overlap}" is both In Scope and Out of Scope`);
	const irreversible = need(scopeFields, "Irreversible Changes", "## File Scope & Boundaries", filename);

	const criteria = parseCriteria(sections["Acceptance Criteria"], filename);

	const checklist = sections["Implementation Checklist"];
	const heads = [...maskFences(checklist).matchAll(/^### Step \d+:.*$/gm)];
	if (!heads.length) fail(`${filename} must contain at least one step in "## Implementation Checklist" formatted as "### Step 1: <Name>"`);
	const steps = heads.map((m, i) => parseStepBlock(checklist.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : checklist.length), i + 1, filename));
	const stepNumbers = new Set(steps.map((s) => s.step));

	const touched = new Set();
	for (const s of steps) {
		for (const f of s.files) {
			if (pathInScope(f, outOfScope)) fail(`${filename} Step ${s.step} touches "${f}", which is Out of Scope`);
			if (!pathInScope(f, inScope)) fail(`${filename} Step ${s.step} touches "${f}", which is not declared In Scope`);
			touched.add(f);
		}
		for (const ac of s.serves) {
			if (!criteria.includes(ac)) fail(`${filename} Step ${s.step} serves ${ac}, which is not an acceptance criterion`);
		}
	}
	for (const f of inScope) {
		if (![...touched].some((t) => (f.endsWith("/") ? t.startsWith(f) : t === f))) {
			fail(`${filename} In Scope file "${f}" is not covered by any implementation step`);
		}
	}
	for (const ac of criteria) {
		if (!steps.some((s) => s.serves.includes(ac))) fail(`${filename} ${ac} is not served by any implementation step`);
	}

	const testRows = parseTable(sections["Test Plan"], ["Criterion", "Test", "Step"], "## Test Plan", filename);
	const tested = new Set();
	for (const [criterion, test, stepRef] of testRows) {
		if (!criteria.includes(criterion)) fail(`${filename} Test Plan row "${criterion}" is not an acceptance criterion`);
		if (isPlaceholder(test)) fail(`${filename} Test Plan row ${criterion} needs a test`);
		const n = Number(stepRef.replace(/^Step\s+/i, ""));
		if (!stepNumbers.has(n)) fail(`${filename} Test Plan row ${criterion} names Step "${stepRef}", which does not exist`);
		if (!steps[n - 1].serves.includes(criterion)) fail(`${filename} Test Plan row ${criterion} names Step ${n}, which does not serve ${criterion}`);
		tested.add(criterion);
	}
	for (const ac of criteria) {
		if (!tested.has(ac)) fail(`${filename} ${ac} has no row in the Test Plan`);
	}

	if (irreversible === NONE) {
		const risky = inScope.find((p) => !/\.mdx?$/i.test(p) && MIGRATION_PATH.test(p));
		if (risky) fail(`${filename} "${risky}" looks like a data or schema migration; declare "Irreversible Changes" as "Step <N> reverses Step <M>" so a revert can undo it`);
	} else {
		const reverses = [...irreversible.matchAll(/Step (\d+) reverses Step (\d+)/gi)].map((m) => [Number(m[1]), Number(m[2])]);
		if (!reverses.length) fail(`${filename} "Irreversible Changes" must be "${NONE}" or use "Step <N> reverses Step <M>"`);
		for (const [reverse, original] of reverses) {
			if (!stepNumbers.has(reverse) || !stepNumbers.has(original)) fail(`${filename} "Step ${reverse} reverses Step ${original}" names a step that does not exist`);
			if (reverse <= original) fail(`${filename} the reverse step (Step ${reverse}) must come after the step it reverses (Step ${original})`);
		}
	}

	validateOpenQuestions(sections["Open Questions & Assumptions"], filename, options.allowOpenQuestions);

	const check = fieldMap(parseFields(sections["Blast Radius Check"]));
	const fromThink = parseTier(need(check, "Tier from Think", "## Blast Radius Check", filename, { allowNone: false }), "Tier from Think", filename);
	const holds = need(check, "Still Holds", "## Blast Radius Check", filename, { allowNone: false });
	let effective = fromThink;
	if (!/^yes\b/i.test(holds)) {
		const raised = holds.match(/^raised to\s+(\w+)/i);
		if (!raised) fail(`${filename} Blast Radius Check "Still Holds" must be "Yes" or "Raised to <tier>"`);
		effective = parseTier(raised[1], "Raised tier", filename);
		if (TIERS.indexOf(effective) <= TIERS.indexOf(fromThink)) fail(`${filename} a raised tier must be higher than ${fromThink}`);
		need(check, "Reason", "## Blast Radius Check", filename, { allowNone: false });
		if (effective === "High" || effective === "Critical") {
			const rollback = need(check, "Rollback", "## Blast Radius Check", filename);
			if (NO_ANSWER.test(rollback)) fail(`${filename} raising the tier to ${effective} requires "- **Rollback:**" in the Blast Radius Check naming the rollback mechanism`);
		}
	}
	if (options.think) {
		if (options.think.tier !== fromThink) fail(`${filename} "Tier from Think" is ${fromThink} but think.md sets ${options.think.tier}`);
		if (effective === "Critical" && !options.think.decisionRequired) {
			fail(`${filename} raising the tier to Critical requires a decision record; update the Decision Record in think.md`);
		}
		for (const path of options.think.contextUpdates) {
			if (!touched.has(path)) fail(`${filename} Persistent Context update "${path}" from think.md is not covered by any implementation step`);
		}
	}

	const stage = options.stage ?? "draft";
	if (!STAGES.includes(stage)) fail(`stage "${stage}" must be one of: ${STAGES.join(", ")}`);
	const approvalFields = fieldMap(parseFields(sections.Approval));
	const approval = checkApproval(need(approvalFields, "Approved By", "## Approval", filename, { allowNone: false }), stage, [["Developer"], ["Developer", "Architect"]], "## Approval", filename);
	if (options.think && approval.status === "approved") {
		if (options.think.approval.status !== "approved") {
			fail(`${filename} is approved but think.md is not; the Plan reads decisions made in Think, so approve think.md first`);
		}
		const thinkDate = options.think.approval.approvals.map((a) => a.date).sort().at(-1);
		const early = approval.approvals.find((a) => a.date < thinkDate);
		if (early) fail(`${filename} approval date ${early.date} (${early.role}) is before the think.md approval date ${thinkDate}`);
	}

	return { title: h1[1].trim(), steps, criteria, tier: effective, inScope, approval };
}

function parseCriteria(body, filename) {
	const ids = [];
	for (const line of body.split("\n").filter((l) => l.trim())) {
		const m = line.match(/^- \*\*(AC-(\d+)):\*\*\s*(.+)$/);
		if (!m) fail(`${filename} "## Acceptance Criteria" lines must be formatted "- **AC-<N>:** Given ..., then ..." (found: "${line}")`);
		if (Number(m[2]) !== ids.length + 1) fail(`${filename} acceptance criteria must be sequential. Expected AC-${ids.length + 1}, found ${m[1]}`);
		if (!/^given\b/i.test(m[3]) || !/\bthen\b/i.test(m[3])) {
			fail(`${filename} ${m[1]} must be an observable true-or-false statement of the form "Given ..., then ..."`);
		}
		ids.push(m[1]);
	}
	if (ids.length < 3 || ids.length > 8) fail(`${filename} must have 3 to 8 acceptance criteria (found ${ids.length})`);
	return ids;
}

function validateOpenQuestions(body, filename, allowOpen) {
	if (body === NONE) return;
	const entries = parseFields(body);
	if (!entries.length) fail(`${filename} "## Open Questions & Assumptions" must be "${NONE}" or bullets starting "- **Question:**" or "- **Assumption:**"`);
	for (const [label, value] of entries) {
		const kind = label.toLowerCase();
		if (kind !== "question" && kind !== "assumption") fail(`${filename} Open Questions & Assumptions entry "${label}" must be "Question" or "Assumption"`);
		if (!value || isPlaceholder(value)) fail(`${filename} ${label} entry is empty`);
		if (kind === "question" && !allowOpen && !/\*\*Answer:\*\*\s*\S/.test(value)) {
			fail(`${filename} a question is still open; answer it with "**Answer:** ..." before Code starts: ${value.split("\n")[0]}`);
		}
	}
}

async function fileExists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

async function dirExists(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

function parseArgs(args) {
	const parsed = { think: null, plan: null, dir: null, stage: "draft", allowOpenQuestions: false, unknown: [] };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--think" && args[i + 1]) parsed.think = args[++i];
		else if (args[i] === "--plan" && args[i + 1]) parsed.plan = args[++i];
		else if (args[i] === "--dir" && args[i + 1]) parsed.dir = args[++i];
		else if (args[i] === "--stage" && args[i + 1]) parsed.stage = args[++i];
		else if (args[i] === "--allow-open-questions") parsed.allowOpenQuestions = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else parsed.unknown.push(args[i]);
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);

	if (!opts.help && opts.unknown.length) {
		console.error(`✗ Unknown or incomplete argument(s): ${opts.unknown.join(" ")}. Run with --help for usage.`);
		return 1;
	}
	if (!opts.help && !STAGES.includes(opts.stage)) {
		console.error(`✗ Unknown --stage "${opts.stage}": use one of ${STAGES.join(", ")}.`);
		return 1;
	}
	if (opts.help || (!opts.think && !opts.plan && !opts.dir)) {
		console.log(`Usage:
  node validate-specs.mjs --think <path/to/think.md> [--stage draft|approved]
  node validate-specs.mjs --plan <path/to/plan.md> [--stage draft|approved] [--allow-open-questions]
  node validate-specs.mjs --think <think.md> --plan <plan.md>   (also cross-checks the two files)
  node validate-specs.mjs --dir <specs-directory> [--stage draft|approved]

Stages: "draft" (default) requires "Approved By: Pending" in both files; "approved" requires the named Developer
and Architect approvals. The agent only ever validates drafts; people approve.
`);
		return opts.help ? 0 : 1;
	}

	let targetThink = opts.think;
	let targetPlan = opts.plan;

	if (opts.dir) {
		if (!(await dirExists(opts.dir))) {
			console.error(`Error: Directory not found: ${opts.dir}`);
			return 1;
		}
		const thinkInDir = join(opts.dir, "think.md");
		const planInDir = join(opts.dir, "plan.md");
		if (await fileExists(thinkInDir)) targetThink = thinkInDir;
		if (await fileExists(planInDir)) targetPlan = planInDir;
		if (!targetThink && !targetPlan) {
			console.error(`Error: Directory ${opts.dir} contains neither think.md nor plan.md`);
			return 1;
		}
		if (targetPlan && !targetThink) {
			console.error(`Error: Directory ${opts.dir} contains plan.md without think.md. plan.md must be derived from think.md.`);
			return 1;
		}
	}

	let validatedCount = 0;
	let think = null;

	if (targetThink) {
		try {
			think = validateThinkContent(await readFile(targetThink, "utf-8"), targetThink, { stage: opts.stage });
			console.log(`✓ [think.md] Validated: "${think.title}" (blast radius ${think.tier}, ${think.options.length} options, ${opts.stage}) (${targetThink})`);
			validatedCount++;
		} catch (err) {
			console.error(`✗ [think.md] Validation failed: ${err.message}`);
			return 1;
		}
	}

	if (targetPlan) {
		try {
			const result = validatePlanContent(await readFile(targetPlan, "utf-8"), targetPlan, { think, allowOpenQuestions: opts.allowOpenQuestions, stage: opts.stage });
			console.log(`✓ [plan.md] Validated: "${result.title}" with ${result.steps.length} atomic steps and ${result.criteria.length} acceptance criteria, ${opts.stage} (${targetPlan})`);
			validatedCount++;
		} catch (err) {
			console.error(`✗ [plan.md] Validation failed: ${err.message}`);
			return 1;
		}
	}

	console.log(`Successfully validated ${validatedCount} specification file(s).`);
	return 0;
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runValidator().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
