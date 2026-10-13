#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const TIERS = ["Low", "Medium", "High", "Critical"];
export const ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];
export const PR_SECTIONS = ["Links", "Acceptance Criteria Traceability", "Dependencies", "Blast Radius", "Human Validation"];
export const QUESTIONS = ["Client Intent", "Behavioral Experience", "Safety & Blast Radius"];
export const DEFAULT_MAX_FIX_LOOP = 5;

const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_A_PERSON = /\b(ai|bot|agent|copilot|assistant|claude|gpt|llm|automation|pipeline|gemini|chatgpt|openai|anthropic|dependabot|renovate|github-actions)\b|\[bot\]/i;
const CONFIRMATION = new RegExp(`^Confirmed by (.+?) \\(([^()]+)\\) on (\\S+)$`);
const JOINT = new RegExp(`^Confirmed by (.+?) \\(([^()]+)\\) and (.+?) \\(([^()]+)\\) on (\\S+)$`);
const ROLLBACK_VALIDATED = /^(.+) by ([^;()]+?) \(([^()]+)\) on (\S+); ([^;()]+?) \(([^()]+)\) on (\S+)$/;
const APPROVED_BY = /^([^;()]+) \(Developer\) on (\d{4}-\d{2}-\d{2})(?:; ([^;()]+) \(Architect\) on (\d{4}-\d{2}-\d{2}))?$/;
const APPROVAL_MESSAGE = "plan is not approved by a Developer; Code starts only from an approved plan";

const USAGE = `Usage: node validate-pr.mjs --body <pr.md> --dir specs/issue-<n> --stage code|prove
         [--added-deps "pkg-a,pkg-b"] [--root <workspace>] [--pr-date YYYY-MM-DD] [--max-fix-loop 5]
`;

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

export function planSha256(plan) {
	return createHash("sha256").update(normalizeNewlines(plan)).digest("hex");
}

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

/** Splits level-two sections; with `required` the headings must match it exactly and in order. */
function splitSections(markdown, filename, required = null) {
	const masked = maskFences(markdown, filename);
	const matches = [...masked.matchAll(/^## (.+)$/gm)];
	const names = matches.map((m) => m[1].trim());
	if (required) {
		if (names.length !== required.length || names.some((n, i) => n !== required[i])) {
			fail(`${filename} must contain exactly these level-two headings, in order: ${required.map((h) => `## ${h}`).join(", ")}`);
		}
	}
	const sections = {};
	matches.forEach((m, i) => {
		const start = m.index + m[0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		sections[names[i]] = markdown.slice(start, end).trim();
	});
	return sections;
}

/** Parses "- **Label:** value" fields; continuation lines belong to the previous field, lines before the first field are returned as stray. */
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

function fieldMap(body, where, filename) {
	const { entries } = parseFields(body);
	const map = new Map();
	for (const [label, value] of entries) {
		if (map.has(label)) fail(`${filename} ${where} repeats the field "${label}"`);
		map.set(label, value);
	}
	return map;
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

function parseTier(value, label, filename) {
	const tier = TIERS.find((t) => t.toLowerCase() === value.split(/[\s.,;:(]/)[0].toLowerCase());
	if (!tier) fail(`${filename} ${label} must start with one of: ${TIERS.join(", ")}`);
	return tier;
}

const squash = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** Reads the Blast Radius tier and Rollback from think.md. */
export function readThink(thinkText) {
	const section = splitSections(normalizeNewlines(thinkText), "think.md")["Blast Radius"];
	if (section === undefined) fail('think.md has no "## Blast Radius" section');
	const fields = fieldMap(section, '"## Blast Radius"', "think.md");
	if (!fields.get("Tier")) fail('think.md "## Blast Radius" has no Tier');
	return { tier: parseTier(fields.get("Tier"), "think.md Tier", "think.md"), rollback: fields.get("Rollback") ?? NONE };
}

/** Reads the acceptance criteria and the effective blast radius tier (Think's, or the raised one) from plan.md. */
export function readPlan(planText) {
	const sections = splitSections(normalizeNewlines(planText), "plan.md");
	if (sections["Acceptance Criteria"] === undefined) fail('plan.md has no "## Acceptance Criteria" section');
	const criteria = [...sections["Acceptance Criteria"].matchAll(/^- \*\*(AC-\d+):\*\*/gm)].map((m) => m[1]);
	if (!criteria.length) fail("plan.md lists no acceptance criteria");
	if (sections["Blast Radius Check"] === undefined) fail('plan.md has no "## Blast Radius Check" section');
	const check = fieldMap(sections["Blast Radius Check"], '"## Blast Radius Check"', "plan.md");
	const fromThink = parseTier(check.get("Tier from Think") ?? "", "plan.md Tier from Think", "plan.md");
	const raised = (check.get("Still Holds") ?? "").match(/^raised to\s+(\w+)/i);
	const tier = raised ? parseTier(raised[1], "plan.md raised tier", "plan.md") : fromThink;
	return { criteria, tier };
}

function checkLinks(section, ctx, issue) {
	const fields = fieldMap(section, "## Links", "pr");
	const closes = fields.get("Closes");
	if (!closes) fail('pr "## Links" is missing the "- **Closes:**" field');
	const closed = closes.match(/^#(\d+)$/);
	if (!closed) fail(`pr "Closes" must be "#<issue number>" (found: "${closes}")`);
	if (issue && closed[1] !== issue) fail(`pr "Closes" is #${closed[1]} but the work item is issue ${issue}`);
	for (const [label, file] of [["Plan", "plan.md"], ["Think", "think.md"]]) {
		const value = fields.get(label);
		if (!value) fail(`pr "## Links" is missing the "- **${label}:**" field`);
		const m = value.match(/^`([^`\n]+)`$/);
		if (!m) fail(`pr "${label}" must be a workspace-relative path in backticks (found: "${value}")`);
		const path = m[1].replace(/^\.\//, "");
		if (path.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(path) || /\s/.test(path)) {
			fail(`pr "${label}" path "${path}" must be a workspace-relative path without spaces or ".."`);
		}
		if (!ctx.linkExists(path)) fail(`pr "${label}" link "${path}" does not resolve to an existing file`);
		if (!ctx.linkIsWorkItemFile(path, file)) fail(`pr "${label}" link "${path}" is not the ${file} of this work item`);
	}
}

function checkTraceability(section, criteria) {
	const rows = parseTable(section, ["Criterion", "Test", "Status"], "## Acceptance Criteria Traceability", "pr");
	const seen = new Set();
	for (const [criterion, test, status] of rows) {
		if (!criteria.includes(criterion)) fail(`pr traceability row "${criterion}" is not an acceptance criterion in plan.md`);
		if (seen.has(criterion)) fail(`pr traceability lists ${criterion} more than once`);
		seen.add(criterion);
		if (isPlaceholder(test)) fail(`pr traceability row ${criterion} has no test`);
		if (status !== "Passing") fail(`pr traceability row ${criterion} has status "${status}"; every criterion must be "Passing"`);
	}
	const missing = criteria.filter((c) => !seen.has(c));
	if (missing.length) fail(`pr traceability is missing acceptance criteria: ${missing.join(", ")}`);
	return rows.length;
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkDependencies(section, planText, addedDeps) {
	const declared = [];
	if (section !== NONE) {
		const { entries, stray } = parseFields(section);
		if (!entries.length || stray.length) fail(`pr "## Dependencies" must be "${NONE}" or bullets "- **<package>:** <why, with its security and licence evaluation>"`);
		for (const [name, reason] of entries) {
			if (isPlaceholder(reason)) fail(`pr dependency "${name}" has no reason`);
			if (declared.includes(name)) fail(`pr "## Dependencies" lists "${name}" more than once`);
			declared.push(name);
		}
	}
	const inPlan = (name) => new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`).test(planText);
	for (const name of addedDeps) {
		if (!declared.includes(name)) fail(`dependency "${name}" was added but is not declared in "## Dependencies"`);
	}
	for (const name of declared) {
		if (!inPlan(name)) fail(`dependency "${name}" is declared in the pull request but does not appear in plan.md; dependencies are bounded by the plan`);
	}
	return declared.length;
}

function checkBlastRadius(section, think, plan) {
	const fields = fieldMap(section, "## Blast Radius", "pr");
	const tierValue = fields.get("Tier");
	if (!tierValue) fail('pr "## Blast Radius" is missing the "- **Tier:**" field');
	const tier = parseTier(tierValue, "pr Tier", "pr");
	const effective = TIERS.indexOf(plan.tier) > TIERS.indexOf(think.tier) ? plan.tier : think.tier;
	if (tier !== effective) fail(`pr Tier is ${tier} but the effective tier from think.md and plan.md is ${effective}`);
	const rollback = fields.get("Rollback");
	if (rollback === undefined || !rollback) fail('pr "## Blast Radius" is missing the "- **Rollback:**" field');
	if (tier === "High" || tier === "Critical") {
		if (rollback === NONE || isPlaceholder(rollback)) fail(`pr Rollback is required for ${tier}`);
		if (think.rollback === NONE) fail(`think.md has no Rollback mechanism for a ${tier} change; the Architect must record one in think.md`);
		if (!squash(rollback).includes(squash(think.rollback))) fail("pr Rollback must contain the rollback mechanism recorded in think.md");
	}
	return { tier, rollback };
}

function requiredFields(tier) {
	const fields = [...QUESTIONS];
	if (tier === "High" || tier === "Critical") fields.push("Rollback Validated");
	if (tier === "Critical") fields.push("Joint Sign-off", "Staged Rollout");
	return fields;
}

function checkDate(value, label, recordDate) {
	if (!isRealDate(value)) fail(`${label} date "${value}" must be a real date formatted YYYY-MM-DD`);
	if (recordDate && value < recordDate) fail(`${label} is dated ${value}, before the pull request record date ${recordDate}`);
}

function isRealDate(value) {
	return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/**
 * Code starts only from an approved plan: plan.md "## Approval" -> "Approved By" names a person as Developer
 * (`<name> (Developer) on YYYY-MM-DD`, optionally `; <name> (Architect) on YYYY-MM-DD`). Same rule as code-loop.
 */
function checkPlanApproval(planText) {
	const lines = normalizeNewlines(planText).split("\n");
	const masked = maskFences(normalizeNewlines(planText), "plan.md").split("\n");
	const start = masked.findIndex((line) => /^## Approval\s*$/.test(line));
	const notApproved = (reason) => fail(`${APPROVAL_MESSAGE} (${reason})`);
	if (start === -1) notApproved('plan.md has no "## Approval" section');
	let end = masked.findIndex((line, i) => i > start && /^## /.test(line));
	if (end === -1) end = lines.length;
	const field = masked.slice(start + 1, end).map((line) => line.match(/^- \*\*Approved By:\*\*\s*(.*)$/)).find(Boolean);
	if (!field) notApproved('plan.md "## Approval" has no "- **Approved By:**" field');
	const value = field[1].trim();
	const m = value.match(APPROVED_BY);
	if (!m) notApproved(`"${value}" is not "<name> (Developer) on YYYY-MM-DD"`);
	const people = [[m[1].trim(), m[2]], ...(m[3] ? [[m[3].trim(), m[4]]] : [])];
	for (const [name, date] of people) {
		if (name.length < 2 || isPlaceholder(name) || /^x$/i.test(name) || NOT_A_PERSON.test(name)) notApproved(`approver "${name}" is a placeholder or an AI, not a person`);
		if (!isRealDate(date)) notApproved(`approval date ${date} is not a valid date`);
	}
	if (people.length === 2 && squash(people[0][0]) === squash(people[1][0])) notApproved("the Developer and the Architect must be two different people");
}

function checkPerson(name, label) {
	if (name.length < 2 || isPlaceholder(name) || NOT_A_PERSON.test(name)) fail(`${label} must name a person, not an agent or a placeholder (found: "${name}")`);
}

function checkRole(role, allowed, label) {
	if (!ROLES.includes(role)) fail(`${label} role "${role}" must be one of: ${ROLES.join(", ")}`);
	if (!allowed.includes(role)) fail(`${label} cannot be confirmed by role ${role} at this blast radius; allowed: ${allowed.join(", ")}`);
}

function parseConfirmation(value, label, recordDate, allowedRoles) {
	if (/^pending\b/i.test(value)) fail(`pr Human Validation "${label}" is still Pending`);
	const m = value.match(CONFIRMATION);
	if (!m) fail(`pr Human Validation "${label}" must be "Confirmed by <name> (<role>) on YYYY-MM-DD" (found: "${value}")`);
	checkPerson(m[1], `"${label}"`);
	checkRole(m[2], allowedRoles, `"${label}"`);
	checkDate(m[3], `"${label}"`, recordDate);
	return { name: m[1], role: m[2] };
}

function checkTierValidators(tier, fields, think, recordDate) {
	if (tier === "Low" && QUESTIONS.every((q) => fields.get(q) === "Auto-merge")) return;
	const allowed = { Low: ["Developer"], Medium: ["Developer"], High: ["Developer", "Architect"], Critical: ["Developer", "Architect", "Product Owner"] }[tier];
	const confirmed = QUESTIONS.map((q) => parseConfirmation(fields.get(q), q, recordDate, allowed));

	if (tier === "High") {
		const developers = new Set(confirmed.filter((c) => c.role === "Developer").map((c) => squash(c.name)));
		const architects = new Set(confirmed.filter((c) => c.role === "Architect").map((c) => squash(c.name)));
		if (!developers.size || !architects.size) fail("High blast radius needs dual validation: at least one answer confirmed by a Developer and one by an Architect");
		if ([...developers].every((d) => architects.has(d))) fail("High blast radius needs two different people: the Developer and the Architect must not be the same person");
	}
	if (tier === "High" || tier === "Critical") {
		const value = fields.get("Rollback Validated");
		if (/^pending\b/i.test(value)) fail('pr Human Validation "Rollback Validated" is still Pending');
		const m = value.match(ROLLBACK_VALIDATED);
		if (!m) fail('pr Human Validation "Rollback Validated" must be "<mechanism> by <name> (DevOps) on YYYY-MM-DD; <name> (Product Owner) on YYYY-MM-DD"');
		const [, mechanismText, devopsName, devopsRole, devopsDate, ownerName, ownerRole, ownerDate] = m;
		if (devopsRole !== "DevOps") fail(`pr "Rollback Validated" must be validated first by a DevOps person (found role "${devopsRole}")`);
		if (ownerRole !== "Product Owner") fail(`pr "Rollback Validated" must also be validated by a Product Owner (found role "${ownerRole}")`);
		checkPerson(devopsName, '"Rollback Validated"');
		checkPerson(ownerName, '"Rollback Validated"');
		if (squash(devopsName) === squash(ownerName)) fail('pr "Rollback Validated" needs two different people: the DevOps person and the Product Owner');
		checkDate(devopsDate, '"Rollback Validated"', recordDate);
		checkDate(ownerDate, '"Rollback Validated"', recordDate);
		const mechanism = squash(mechanismText);
		const recorded = squash(think.rollback);
		if (!mechanism.includes(recorded) && !recorded.includes(mechanism)) fail("pr Rollback Validated must name the rollback mechanism recorded in think.md");
	}
	if (tier === "Critical") {
		const value = fields.get("Joint Sign-off");
		if (/^pending\b/i.test(value)) fail('pr Human Validation "Joint Sign-off" is still Pending');
		const m = value.match(JOINT);
		if (!m) fail('pr Human Validation "Joint Sign-off" must be "Confirmed by <name> (Architect) and <name> (Product Owner) on YYYY-MM-DD"');
		const people = [[m[1], m[2]], [m[3], m[4]]];
		people.forEach(([name]) => checkPerson(name, '"Joint Sign-off"'));
		if (people.map((p) => p[1]).sort().join() !== "Architect,Product Owner") {
			fail('pr "Joint Sign-off" must name one Architect and one Product Owner');
		}
		if (people[0][0].toLowerCase().replace(/\s+/g, " ") === people[1][0].toLowerCase().replace(/\s+/g, " ")) fail('pr "Joint Sign-off" needs two different people');
		checkDate(m[5], '"Joint Sign-off"', recordDate);
		const rollout = fields.get("Staged Rollout");
		if (/^pending\b/i.test(rollout) || isPlaceholder(rollout)) fail('pr Human Validation "Staged Rollout" needs a reference to the staged rollout plan');
	}
}

function checkHumanValidation(section, stage, tier, think, recordDate) {
	if (/line[\s-]*by[\s-]*line/i.test(section)) {
		fail("pr Human Validation must not claim line-by-line review: governance bans it as a gate; validate intent, behaviour and safety instead");
	}
	const { entries, stray } = parseFields(section);
	if (stray.length) fail(`pr "## Human Validation" holds only its fields; found other text: "${stray[0]}"`);
	const fields = new Map();
	for (const [label, value] of entries) {
		if (fields.has(label)) fail(`pr Human Validation repeats the field "${label}"`);
		fields.set(label, value);
	}
	const required = requiredFields(tier);
	for (const label of required) {
		if (!fields.get(label)) fail(`pr Human Validation is missing the "- **${label}:**" field for blast radius ${tier}`);
	}
	for (const label of fields.keys()) {
		if (!required.includes(label)) fail(`pr Human Validation field "${label}" is not used at blast radius ${tier}`);
	}
	if (stage === "code") {
		for (const label of required) {
			if (fields.get(label) !== "Pending") fail(`pr Human Validation "${label}" must be Pending at the code stage: only a person validates, in Prove`);
		}
		return;
	}
	checkTierValidators(tier, fields, think, recordDate);
}

function checkProgress(progress, planText, maxFixLoop) {
	if (!progress) fail("progress.json not found; Code records every step with code-loop");
	const stepCount = [...maskFences(normalizeNewlines(planText), "plan.md").matchAll(/^### Step \d+:/gm)].length;
	if (progress.planSha256 !== planSha256(planText)) fail("plan changed after Code started; the Developer must re-approve");
	const entries = Object.entries(progress.steps ?? {});
	if (entries.length !== stepCount) fail(`progress.json tracks ${entries.length} steps but plan.md has ${stepCount}`);
	if (!Array.from({ length: stepCount }, (_, i) => String(i + 1)).every((n) => n in progress.steps)) fail(`progress.json steps must have exactly the keys 1 to ${stepCount}`);
	if (entries.some(([, s]) => !Number.isInteger(s?.attempts) || s.attempts < 0)) fail("progress.json step attempts must be non-negative integers");
	const open = entries.filter(([, s]) => s.status !== "done").map(([n]) => n);
	if (open.length) fail(`not all plan steps are done (open: Step ${open.join(", Step ")}); finish them with code-loop`);
	const unverified = entries.filter(([, s]) => typeof s.verifiedAt !== "string" || !s.verifiedAt).map(([n]) => n);
	if (unverified.length) fail(`progress.json has no verifiedAt for Step ${unverified.join(", Step ")}`);
	const sum = entries.reduce((total, [, s]) => total + (Number.isInteger(s.attempts) ? s.attempts : 0), 0);
	const loop = progress.fixLoop ?? {};
	if (!Number.isInteger(loop.attempts) || loop.attempts < 0 || !Number.isInteger(loop.limit) || loop.limit < 1) fail("progress.json fixLoop needs a non-negative integer attempts and a limit of at least 1");
	if (loop.attempts !== sum) fail(`progress.json fixLoop.attempts (${loop.attempts}) does not match the step attempts (${sum})`);
	if (loop.limit > maxFixLoop) fail(`progress.json fixLoop.limit is ${loop.limit}; the fix-loop limit is ${maxFixLoop} per work item`);
	if (loop.attempts > loop.limit) fail(`fix-loop attempts (${loop.attempts}) exceed the limit (${loop.limit}); the Developer steps in`);
	return loop;
}

function latestVerification(progress) {
	const dates = Object.values(progress?.steps ?? {}).map((s) => s.verifiedAt).filter((v) => typeof v === "string").map((v) => v.slice(0, 10));
	return dates.sort().at(-1) ?? null;
}

/**
 * Validates a pull request body against the pr-record contract.
 * @param {string} rawBody
 * @param {object} ctx stage, planText, thinkText, progress, addedDeps, prDate, issue, maxFixLoop, linkExists, linkIsWorkItemFile
 */
export function validatePrContent(rawBody, ctx) {
	if (!["code", "prove"].includes(ctx.stage)) fail('--stage must be "code" or "prove"');
	const body = normalizeNewlines(rawBody).replace(/<!--[\s\S]*?-->/g, "");
	if (!body.trim()) fail("pull request body is empty");
	const sections = splitSections(body, "pr", PR_SECTIONS);
	for (const name of PR_SECTIONS) if (!sections[name]) fail(`pr "## ${name}" is empty`);

	const plan = readPlan(ctx.planText);
	const think = readThink(ctx.thinkText);
	checkLinks(sections.Links, ctx, ctx.issue);
	const traced = checkTraceability(sections["Acceptance Criteria Traceability"], plan.criteria);
	const deps = checkDependencies(sections.Dependencies, normalizeNewlines(ctx.planText), ctx.addedDeps ?? []);
	const { tier } = checkBlastRadius(sections["Blast Radius"], think, plan);

	let fixLoop = null;
	let recordDate = ctx.prDate ?? null;
	if (recordDate && !DATE.test(recordDate)) fail("--pr-date must be formatted YYYY-MM-DD");
	if (ctx.stage === "code") {
		checkPlanApproval(ctx.planText);
		fixLoop = checkProgress(ctx.progress, ctx.planText, ctx.maxFixLoop ?? DEFAULT_MAX_FIX_LOOP);
	} else {
		recordDate ??= latestVerification(ctx.progress);
		if (!recordDate) fail("cannot determine the pull request record date; pass --pr-date YYYY-MM-DD or keep progress.json in the work item");
	}
	checkHumanValidation(sections["Human Validation"], ctx.stage, tier, think, ctx.stage === "prove" ? recordDate : null);
	return { stage: ctx.stage, tier, criteria: traced, dependencies: deps, fixLoop, recordDate };
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
	const opts = { body: null, dir: null, stage: null, addedDeps: "", root: process.cwd(), prDate: null, maxFixLoop: DEFAULT_MAX_FIX_LOOP, help: false };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--body" && args[i + 1]) opts.body = args[++i];
		else if (args[i] === "--dir" && args[i + 1]) opts.dir = args[++i];
		else if (args[i] === "--stage" && args[i + 1]) opts.stage = args[++i];
		else if (args[i] === "--added-deps" && args[i + 1] !== undefined) opts.addedDeps = args[++i];
		else if (args[i] === "--root" && args[i + 1]) opts.root = args[++i];
		else if (args[i] === "--pr-date" && args[i + 1]) opts.prDate = args[++i];
		else if (args[i] === "--max-fix-loop" && args[i + 1]) opts.maxFixLoop = Number(args[++i]);
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
	if (!opts.body || !opts.dir || !opts.stage || !Number.isInteger(opts.maxFixLoop) || opts.maxFixLoop < 1) {
		console.error(USAGE);
		return 1;
	}
	if (opts.maxFixLoop > DEFAULT_MAX_FIX_LOOP) {
		console.error(`✗ --max-fix-loop can only lower the fix-loop limit of ${DEFAULT_MAX_FIX_LOOP} per work item, never raise it`);
		return 1;
	}

	try {
		const body = readOptional(opts.body);
		if (body === null) fail(`pull request body not found: ${opts.body}`);
		const planPath = join(opts.dir, "plan.md");
		const thinkPath = join(opts.dir, "think.md");
		const planText = readOptional(planPath);
		const thinkText = readOptional(thinkPath);
		if (planText === null) fail(`plan.md not found in ${opts.dir}`);
		if (thinkText === null) fail(`think.md not found in ${opts.dir}`);
		let progress = null;
		const progressText = readOptional(join(opts.dir, "progress.json"));
		if (progressText !== null) {
			try {
				progress = JSON.parse(progressText);
			} catch {
				fail("progress.json is not valid JSON");
			}
		}
		const issue = basename(resolve(opts.dir)).match(/^issue-(\d+)$/)?.[1] ?? null;
		const ctx = {
			stage: opts.stage,
			planText,
			thinkText,
			progress,
			addedDeps: opts.addedDeps.split(",").map((d) => d.trim()).filter(Boolean),
			prDate: opts.prDate,
			issue,
			maxFixLoop: opts.maxFixLoop,
			linkExists: (path) => fileIsReadable(resolve(opts.root, path)),
			linkIsWorkItemFile: (path, file) => resolve(opts.root, path) === resolve(opts.dir, file),
		};
		const result = validatePrContent(body, ctx);
		const extra = result.stage === "code" ? `, fix loop ${result.fixLoop.attempts}/${result.fixLoop.limit}` : `, record date ${result.recordDate}`;
		console.log(`✓ [pr] Validated (${result.stage} stage): blast radius ${result.tier}, ${result.criteria} criteria traced, ${result.dependencies} declared dependencies${extra}`);
		return 0;
	} catch (err) {
		console.error(`✗ [pr] Validation failed: ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	const code = runValidator();
	if (code !== 0) process.exit(code);
}
