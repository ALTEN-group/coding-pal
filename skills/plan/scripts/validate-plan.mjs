#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	DOC_PATH,
	NONE,
	NO_ANSWER,
	STAGES,
	THINK_FENCE_INFO,
	TIERS,
	ValidationError,
	checkApproval,
	checkPath,
	dirExists,
	extractPaths,
	fail,
	fieldMap,
	fileExists,
	isPlaceholder,
	maskFences,
	need,
	normalizeNewlines,
	parseFields,
	parseTier,
	splitSections,
	validateThinkContent,
} from "../../think/scripts/validate-think.mjs";

export { STAGES, TIERS, ValidationError, validateThinkContent };

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

const STEP_REQUIRED_FIELDS = ["Files", "Action", "Verification", "Bootable Check", "Serves"];
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[a-z]+$/i;
const MIGRATION_PATH = /(migration|changelog|liquibase|\.sql$|(^|\/)db\/)/i;

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

function checkNoSourceCodeFences(markdown, filename) {
	for (const m of markdown.matchAll(/^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`~]*)/gm)) {
		if (!THINK_FENCE_INFO.has(m[1].toLowerCase())) fail(`${filename} must not contain source code; found a "${m[1]}" code block (code is written in the Code stage, not in Think or Plan)`);
	}
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

	const files = extractPaths(fields.get("files"));
	if (!files.length) fail(`${filename} in Step ${number}: "Files" must list explicit workspace-relative paths in backticks`);
	files.forEach((f) => checkPath(f, `Step ${number} file`, filename));
	const serves = [...fields.get("serves").matchAll(/\bAC-\d+\b/g)].map((s) => s[0]);
	if (!serves.length) fail(`${filename} in Step ${number}: "Serves" must reference at least one acceptance criterion such as AC-1`);

	return { step: number, name: m[2].trim(), files, serves };
}

function matchScopePath(filePath, pattern) {
	if (filePath === pattern) return true;
	if (!pattern.includes("*") && !pattern.includes("?")) {
		return pattern.endsWith("/") ? filePath.startsWith(pattern) : filePath.startsWith(`${pattern}/`);
	}
	const regexPattern = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "___GLOBSTAR___")
		.replace(/\*/g, "[^/]*")
		.replace(/\?/g, "[^/]")
		.replace(/___GLOBSTAR___/g, ".*");
	return new RegExp(`^${regexPattern}$`).test(filePath);
}

function pathInScope(path, scope) {
	return scope.some((s) => matchScopePath(path, s));
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
	checkNoSourceCodeFences(markdown, filename);

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
		if (![...touched].some((t) => matchScopePath(t, f))) {
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
		const isCode = (f) => !DOC_PATH.test(f) && !TEST_PATH.test(f);
		const firstCodeStep = steps.find((s) => s.files.some(isCode))?.step;
		for (const path of options.think.docUpdates) {
			const docStep = steps.find((s) => s.files.includes(path)).step;
			if (firstCodeStep && docStep <= firstCodeStep) {
				fail(`${filename} documentation "${path}" is written in Step ${docStep}, which is not after the first code step (Step ${firstCodeStep}); document the change after implementing it`);
			}
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
	if (opts.help || (!opts.plan && !opts.dir)) {
		console.log(`Usage:
  node validate-plan.mjs --plan <path/to/plan.md> [--think <path/to/think.md>] [--stage draft|approved] [--allow-open-questions]
  node validate-plan.mjs --dir <specs-directory> [--stage draft|approved] [--allow-open-questions]

Stages: "draft" (default) accepts Pending or explicit automated approval; "approved" requires
"Automated by <identity> on YYYY-MM-DD" or genuine named Developer (optionally Architect) approvals.
When --dir or --think is provided, think.md is also validated and cross-checked.
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
		if (!targetPlan) {
			console.error(`Error: Directory ${opts.dir} does not contain plan.md`);
			return 1;
		}
		if (!targetThink) {
			console.error(`Error: Directory ${opts.dir} contains plan.md without think.md. plan.md must be derived from think.md.`);
			return 1;
		}
	}

	let think = null;

	if (targetThink) {
		if (!(await fileExists(targetThink))) {
			console.error(`Error: File not found: ${targetThink}`);
			return 1;
		}
		try {
			think = validateThinkContent(await readFile(targetThink, "utf-8"), targetThink, { stage: opts.stage });
			console.log(`✓ [think.md] Validated: "${think.title}" (blast radius ${think.tier}, ${think.options.length} options, ${opts.stage}) (${targetThink})`);
		} catch (err) {
			console.error(`✗ [think.md] Validation failed: ${err.message}`);
			return 1;
		}
	}

	if (!(await fileExists(targetPlan))) {
		console.error(`Error: File not found: ${targetPlan}`);
		return 1;
	}

	try {
		const result = validatePlanContent(await readFile(targetPlan, "utf-8"), targetPlan, { think, allowOpenQuestions: opts.allowOpenQuestions, stage: opts.stage });
		console.log(`✓ [plan.md] Validated: "${result.title}" with ${result.steps.length} atomic steps and ${result.criteria.length} acceptance criteria, ${opts.stage} (${targetPlan})`);
		return 0;
	} catch (err) {
		console.error(`✗ [plan.md] Validation failed: ${err.message}`);
		return 1;
	}
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
