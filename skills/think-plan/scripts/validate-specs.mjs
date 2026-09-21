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

const THINK_REQUIRED_H2 = [
	"Business Need & Outcome",
	"System Flow & Responsibilities",
	"Invariants & Guardrails",
	"Minimal Change Scope",
	"Ambiguities & Open Questions",
];

const PLAN_REQUIRED_H2 = [
	"Prerequisites & Context",
	"Implementation Checklist",
	"Done When",
];

const STEP_REQUIRED_FIELDS = [
	"Files",
	"Action",
	"Verification",
	"Bootable Check",
];

/**
 * Validates the contents of a think.md markdown file.
 * @param {string} rawMarkdown
 * @param {string} [filename="think.md"]
 */
export function validateThinkContent(rawMarkdown, filename = "think.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);

	const h1Match = markdown.match(/^# Think:\s+(.+)$/m);
	if (!h1Match || !h1Match[1].trim()) {
		fail(`${filename} must start with a level-one heading: "# Think: <Feature or Task Name>"`);
	}

	const h2Matches = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
	if (h2Matches.length !== THINK_REQUIRED_H2.length) {
		fail(
			`${filename} must contain exactly ${THINK_REQUIRED_H2.length} level-two headings: ${THINK_REQUIRED_H2.map((h) => `## ${h}`).join(", ")}`,
		);
	}

	for (let i = 0; i < THINK_REQUIRED_H2.length; i++) {
		if (h2Matches[i] !== THINK_REQUIRED_H2[i]) {
			fail(
				`${filename} heading #${i + 1} is "## ${h2Matches[i]}", expected "## ${THINK_REQUIRED_H2[i]}"`,
			);
		}
	}

	// Verify sections are not empty
	for (let i = 0; i < THINK_REQUIRED_H2.length; i++) {
		const heading = THINK_REQUIRED_H2[i];
		const nextHeading = THINK_REQUIRED_H2[i + 1];
		const startIdx = markdown.indexOf(`## ${heading}`);
		const endIdx = nextHeading ? markdown.indexOf(`## ${nextHeading}`) : markdown.length;
		const sectionContent = markdown.slice(startIdx + `## ${heading}`.length, endIdx).trim();
		if (!sectionContent) {
			fail(`${filename} has empty section for "## ${heading}"`);
		}
	}

	return { title: h1Match[1].trim() };
}

/**
 * Validates a single step block inside plan.md.
 * @param {string} stepBlock
 * @param {number} expectedStepNumber
 * @param {string} filename
 */
function validateStepBlock(stepBlock, expectedStepNumber, filename) {
	const lines = stepBlock.split("\n");
	const headingLine = lines.shift()?.trim();
	const headingMatch = headingLine?.match(/^### Step (\d+):\s+(.+)$/);
	if (!headingMatch) {
		fail(
			`${filename} step heading must match format: "### Step <N>: <Name>" (found: "${headingLine}")`,
		);
	}

	const stepNumber = parseInt(headingMatch[1], 10);
	if (stepNumber !== expectedStepNumber) {
		fail(
			`${filename} step numbers must be sequential. Expected Step ${expectedStepNumber}, found Step ${stepNumber}`,
		);
	}

	const fields = {};
	let currentField = null;
	let lastFieldIndex = -1;

	for (const line of lines) {
		const fieldMatch = line.match(/^- \*\*(Files|Action|Verification|Bootable Check):\*\*\s*(.*)$/);
		if (fieldMatch) {
			currentField = fieldMatch[1];
			const fieldIdx = STEP_REQUIRED_FIELDS.indexOf(currentField);
			if (fieldIdx <= lastFieldIndex) {
				fail(
					`${filename} in Step ${stepNumber}: fields are duplicated or out of order. Expected order: ${STEP_REQUIRED_FIELDS.join(", ")}`,
				);
			}
			lastFieldIndex = fieldIdx;
			fields[currentField] = fieldMatch[2].trim();
		} else if (line.trim() && currentField) {
			fields[currentField] += `\n${line.trim()}`;
		}
	}

	for (const field of STEP_REQUIRED_FIELDS) {
		if (!fields[field] || !fields[field].trim()) {
			fail(
				`${filename} in Step ${stepNumber}: missing or empty required field "- **${field}:**"`,
			);
		}
	}

	return {
		step: stepNumber,
		name: headingMatch[2].trim(),
		...fields,
	};
}

/**
 * Validates the contents of a plan.md markdown file.
 * @param {string} rawMarkdown
 * @param {string} [filename="plan.md"]
 */
export function validatePlanContent(rawMarkdown, filename = "plan.md") {
	const markdown = normalizeNewlines(rawMarkdown).trim();
	if (!markdown) fail(`${filename} is empty`);

	const h1Match = markdown.match(/^# Plan:\s+(.+)$/m);
	if (!h1Match || !h1Match[1].trim()) {
		fail(`${filename} must start with a level-one heading: "# Plan: <Feature or Task Name>"`);
	}

	const h2Matches = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
	if (h2Matches.length !== PLAN_REQUIRED_H2.length) {
		fail(
			`${filename} must contain exactly ${PLAN_REQUIRED_H2.length} level-two headings: ${PLAN_REQUIRED_H2.map((h) => `## ${h}`).join(", ")}`,
		);
	}

	for (let i = 0; i < PLAN_REQUIRED_H2.length; i++) {
		if (h2Matches[i] !== PLAN_REQUIRED_H2[i]) {
			fail(
				`${filename} heading #${i + 1} is "## ${h2Matches[i]}", expected "## ${PLAN_REQUIRED_H2[i]}"`,
			);
		}
	}

	// Verify sections are not empty
	for (let i = 0; i < PLAN_REQUIRED_H2.length; i++) {
		const heading = PLAN_REQUIRED_H2[i];
		const nextHeading = PLAN_REQUIRED_H2[i + 1];
		const startIdx = markdown.indexOf(`## ${heading}`);
		const endIdx = nextHeading ? markdown.indexOf(`## ${nextHeading}`) : markdown.length;
		const sectionContent = markdown.slice(startIdx + `## ${heading}`.length, endIdx).trim();
		if (!sectionContent) {
			fail(`${filename} has empty section for "## ${heading}"`);
		}
	}

	// Verify "## Prerequisites & Context" references think.md
	const prereqStart = markdown.indexOf("## Prerequisites & Context");
	const checklistStart = markdown.indexOf("## Implementation Checklist");
	const prereqContent = markdown.slice(prereqStart + "## Prerequisites & Context".length, checklistStart).trim();
	if (!/think\.md/i.test(prereqContent)) {
		fail(`${filename} "## Prerequisites & Context" must reference the think.md specification it is derived from`);
	}

	// Validate steps inside "## Implementation Checklist"
	const doneWhenStart = markdown.indexOf("## Done When");
	const checklistContent = markdown.slice(checklistStart + "## Implementation Checklist".length, doneWhenStart).trim();

	const stepBlocks = checklistContent
		.split(/\n(?=### Step \d+:)/)
		.map((b) => b.trim())
		.filter(Boolean);

	if (stepBlocks.length === 0) {
		fail(`${filename} must contain at least one step in "## Implementation Checklist" formatted as "### Step 1: <Name>"`);
	}

	const parsedSteps = stepBlocks.map((block, idx) => validateStepBlock(block, idx + 1, filename));

	return {
		title: h1Match[1].trim(),
		steps: parsedSteps,
	};
}

async function fileExists(path) {
	try {
		const s = await stat(path);
		return s.isFile();
	} catch {
		return false;
	}
}

async function dirExists(path) {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
}

function parseArgs(args) {
	const parsed = { think: null, plan: null, dir: null };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--think" && args[i + 1]) {
			parsed.think = args[++i];
		} else if (args[i] === "--plan" && args[i + 1]) {
			parsed.plan = args[++i];
		} else if (args[i] === "--dir" && args[i + 1]) {
			parsed.dir = args[++i];
		} else if (args[i] === "--help" || args[i] === "-h") {
			parsed.help = true;
		}
	}
	return parsed;
}

export async function runValidator(args = process.argv.slice(2)) {
	const opts = parseArgs(args);

	if (opts.help || (!opts.think && !opts.plan && !opts.dir)) {
		console.log(`Usage:
  node validate-specs.mjs --think <path/to/think.md>
  node validate-specs.mjs --plan <path/to/plan.md>
  node validate-specs.mjs --think <think.md> --plan <plan.md>
  node validate-specs.mjs --dir <specs-directory>
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

	if (targetThink) {
		try {
			const content = await readFile(targetThink, "utf-8");
			const result = validateThinkContent(content, targetThink);
			console.log(`✓ [think.md] Validated: "${result.title}" (${targetThink})`);
			validatedCount++;
		} catch (err) {
			console.error(`✗ [think.md] Validation failed: ${err.message}`);
			return 1;
		}
	}

	if (targetPlan) {
		try {
			const content = await readFile(targetPlan, "utf-8");
			const result = validatePlanContent(content, targetPlan);
			console.log(`✓ [plan.md] Validated: "${result.title}" with ${result.steps.length} atomic steps (${targetPlan})`);
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
