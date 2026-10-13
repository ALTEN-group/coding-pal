#!/usr/bin/env node

import { access, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const ASSESSMENT_H2 = [
	"Scope & Principles",
	"Source Inventory",
	"Target Mapping",
	"Application Change Register",
	"Risks",
	"Ambiguities & Open Questions",
];
export const PLAN_H2 = [
	"Prerequisites & Context",
	"Waves",
	"Data Migration",
	"Connectivity & Identity",
	"Validation",
	"Rollback",
	"Decommission",
	"Open Questions & Assumptions",
];

export const BUDGETS = ["none", "config-only", "minimal-code"];
export const COMPONENT_TYPES = ["Compute", "Database", "Storage", "Queue", "Network", "Identity", "Secret", "Scheduler", "Integration", "Observability"];
export const STRATEGIES = ["Rehost", "Replatform", "Relocate", "Retain", "Retire", "Refactor"];
export const MIGRATED = ["Rehost", "Replatform", "Relocate", "Refactor"];
export const IMPACTS = ["None", "Config", "Build", "Code"];
export const LEVELS = ["Low", "Medium", "High"];
export const SYNC_MODES = ["Bulk", "Continuous", "Final Delta"];
const STATEFUL = ["Database", "Storage"];
const ALLOWED_CHANGES = { none: [], "config-only": ["Config"], "minimal-code": ["Config", "Build", "Code"] };
const NONE = "_None._";
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
const SECRET_VALUE = /\b(?:password|pwd|secret|token|api[_-]?key)\s*=\s*["']?(?![<${])[^\s|`"']{6,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}/i;

const ASSESSMENT_COLUMNS = {
	"Source Inventory": ["ID", "Component", "Type", "Runtime", "Data", "Depends On", "Evidence"],
	"Target Mapping": ["Component", "Strategy", "Target Service", "Application Impact", "Rationale"],
	"Application Change Register": ["ID", "Component", "Type", "Change", "Why Not Infrastructure-Side", "Owner"],
	Risks: ["ID", "Risk", "Likelihood", "Impact", "Mitigation"],
};

const normalize = (value) => value.replace(/\r\n?/g, "\n");
const isPlaceholder = (value) => !value || PLACEHOLDER.test(value.trim());
const idList = (value) => (value.trim() === "-" ? [] : value.split(",").map((v) => v.trim()).filter(Boolean));

function scanHeadings(markdown) {
	const headings = [];
	let offset = 0;
	let inFence = false;
	for (const line of markdown.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
		const m = !inFence && /^(#{1,3}) (.+?)\s*$/.exec(line);
		if (m) headings.push({ level: m[1].length, text: m[2], start: offset, end: offset + line.length });
		offset += line.length + 1;
	}
	return headings;
}

function sectionBodies(markdown, headings) {
	const h2 = headings.filter((h) => h.level === 2);
	return h2.map((h, i) => ({ name: h.text, body: markdown.slice(h.end, i + 1 < h2.length ? h2[i + 1].start : markdown.length).trim(), start: h.start }));
}

function prepare(markdown, filename, kind) {
	if (!markdown || !markdown.trim()) fail(`${filename} is empty`);
	const text = normalize(markdown);
	const headings = scanHeadings(text);
	const h1 = headings.filter((h) => h.level === 1);
	const match = h1.length === 1 && new RegExp(`^Migration ${kind}: (.+)$`).exec(h1[0].text);
	if (!match) fail(`${filename} must have exactly one level-one heading "# Migration ${kind}: <name>"`);
	if (isPlaceholder(match[1])) fail(`${filename} level-one heading needs a real migration name`);
	if (SECRET_VALUE.test(text)) fail(`${filename} appears to contain a secret value; record the secret's name and location instead`);
	return { text, headings, name: match[1].trim() };
}

function fixedSections(sections, expected, filename) {
	if (sections.length !== expected.length) {
		fail(`${filename} must contain exactly ${expected.length} level-two headings: ${expected.map((h) => `## ${h}`).join(", ")}`);
	}
	const out = {};
	expected.forEach((name, i) => {
		if (sections[i].name !== name) fail(`${filename} heading ${i + 1} must be "## ${name}" (found "## ${sections[i].name}")`);
		out[name] = sections[i].body;
	});
	return out;
}

function parseFields(body) {
	const fields = new Map();
	let current = null;
	for (const line of body.split("\n")) {
		const m = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
		if (m) {
			current = m[1].trim().toLowerCase();
			if (fields.has(current)) fail(`field "${m[1].trim()}" is declared twice; each field must appear once`);
			fields.set(current, m[2].trim());
		} else if (current && /^\s{2,}\S/.test(line)) {
			fields.set(current, `${fields.get(current)} ${line.trim()}`.trim());
		} else {
			current = null;
		}
	}
	return fields;
}

function requireField(fields, label, where, filename, { allowNone = true } = {}) {
	const value = fields.get(label.toLowerCase());
	if (value === undefined) fail(`${filename} ${where} is missing the "- **${label}:**" field`);
	if (value === "" || isPlaceholder(value)) fail(`${filename} ${where} field "${label}" is empty or a placeholder`);
	if (value === NONE && !allowNone) fail(`${filename} ${where} field "${label}" must not be "${NONE}"`);
	return value;
}

function parseTable(body, columns, sectionName, filename, { allowNone = false, minRows = 1 } = {}) {
	if (allowNone && body.split("\n").some((l) => l.trim() === NONE) && !body.includes("|")) return [];
	const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
	if (lines.length < 2 + minRows) {
		fail(`${filename} "## ${sectionName}" must contain a Markdown table with a header, a separator, and at least ${minRows} row(s)${allowNone ? ` (or ${NONE})` : ""}`);
	}
	const cells = (line) => line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	const header = cells(lines[0]);
	if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
		fail(`${filename} "## ${sectionName}" table columns must be exactly: ${columns.join(" | ")}`);
	}
	if (!cells(lines[1]).every((c) => /^:?-{3,}:?$/.test(c))) fail(`${filename} "## ${sectionName}" table is missing its separator row`);
	return lines.slice(2).map((line) => {
		const row = cells(line);
		if (row.length !== columns.length) fail(`${filename} "## ${sectionName}" row has ${row.length} cells, expected ${columns.length}: ${line}`);
		const record = {};
		columns.forEach((c, i) => {
			if (row[i] === "" || isPlaceholder(row[i])) fail(`${filename} "## ${sectionName}" column "${c}" is empty or a placeholder: ${line}`);
			record[c] = row[i].replace(/`/g, "");
		});
		return record;
	});
}

function oneOf(value, allowed, label, where, filename) {
	if (!allowed.includes(value)) fail(`${filename} ${where} ${label} must be one of ${allowed.join(", ")} (found "${value}")`);
}

function uniqueIds(rows, key, pattern, label, filename) {
	const seen = new Set();
	for (const row of rows) {
		if (!pattern.test(row[key])) fail(`${filename} ${label} ID "${row[key]}" must match ${pattern}`);
		if (seen.has(row[key])) fail(`${filename} ${label} ID "${row[key]}" is declared twice`);
		seen.add(row[key]);
	}
	return seen;
}

function checkOpenList(body, sectionName, filename, { allowOpen = true } = {}) {
	const items = body.split("\n").filter((l) => /^\s*[-*] /.test(l));
	const none = body.split("\n").some((l) => l.trim() === NONE);
	if (!none && items.length === 0) fail(`${filename} "## ${sectionName}" must be a bulleted list or ${NONE}`);
	if (items.length && !allowOpen) fail(`${filename} "## ${sectionName}" still has ${items.length} open item(s); resolve them or pass --allow-open-questions for a draft`);
	return items.length;
}

export function parseDuration(value) {
	const m = /^(\d+)\s*(m|h|d)$/.exec(String(value).trim());
	return m ? Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2]] : null;
}

export function validateAssessmentContent(markdown, filename = "assessment.md") {
	const { text, headings, name } = prepare(markdown, filename, "Assessment");
	const body = fixedSections(sectionBodies(text, headings), ASSESSMENT_H2, filename);

	const scopeFields = parseFields(body["Scope & Principles"]);
	const where = '"## Scope & Principles"';
	for (const label of ["Source", "Target", "Driver"]) requireField(scopeFields, label, where, filename, { allowNone: false });
	requireField(scopeFields, "Out of Scope", where, filename);
	const budget = requireField(scopeFields, "Change Budget", where, filename, { allowNone: false });
	oneOf(budget, BUDGETS, "Change Budget", where, filename);

	const inventory = parseTable(body["Source Inventory"], ASSESSMENT_COLUMNS["Source Inventory"], "Source Inventory", filename);
	const ids = uniqueIds(inventory, "ID", /^S-\d+$/, "component", filename);
	const byId = new Map(inventory.map((c) => [c.ID, c]));
	for (const c of inventory) {
		oneOf(c.Type, COMPONENT_TYPES, `component ${c.ID} Type`, '"## Source Inventory"', filename);
		const deps = idList(c["Depends On"]);
		for (const dep of deps) {
			if (!ids.has(dep)) fail(`${filename} component ${c.ID} depends on unknown component "${dep}"`);
			if (dep === c.ID) fail(`${filename} component ${c.ID} cannot depend on itself`);
		}
		c.deps = deps;
	}

	const mapping = parseTable(body["Target Mapping"], ASSESSMENT_COLUMNS["Target Mapping"], "Target Mapping", filename);
	const mapped = new Set();
	for (const m of mapping) {
		if (!ids.has(m.Component)) fail(`${filename} Target Mapping references unknown component "${m.Component}"`);
		if (mapped.has(m.Component)) fail(`${filename} Target Mapping lists component ${m.Component} more than once`);
		mapped.add(m.Component);
		oneOf(m.Strategy, STRATEGIES, `component ${m.Component} Strategy`, '"## Target Mapping"', filename);
		oneOf(m["Application Impact"], IMPACTS, `component ${m.Component} Application Impact`, '"## Target Mapping"', filename);
		if (["Retain", "Retire"].includes(m.Strategy) && m["Application Impact"] !== "None") {
			fail(`${filename} component ${m.Component} is ${m.Strategy} and must have Application Impact None`);
		}
		if (m.Strategy === "Refactor" && !/decision|ADR|DR-\d+/i.test(m.Rationale)) {
			fail(`${filename} component ${m.Component} is Refactor; its Rationale must name the drafted decision record`);
		}
		if (m.Strategy !== "Retire" && m["Target Service"] === "-") fail(`${filename} component ${m.Component} needs a concrete Target Service`);
	}
	for (const id of ids) if (!mapped.has(id)) fail(`${filename} Target Mapping is missing inventory component ${id}`);

	const changes = parseTable(body["Application Change Register"], ASSESSMENT_COLUMNS["Application Change Register"], "Application Change Register", filename, { allowNone: true });
	uniqueIds(changes, "ID", /^C-\d+$/, "change", filename);
	const allowed = ALLOWED_CHANGES[budget];
	const rank = { None: 0, Config: 1, Build: 2, Code: 3 };
	const highest = new Map();
	for (const ch of changes) {
		oneOf(ch.Type, ["Config", "Build", "Code"], `change ${ch.ID} Type`, '"## Application Change Register"', filename);
		if (!ids.has(ch.Component)) fail(`${filename} change ${ch.ID} references unknown component "${ch.Component}"`);
		if (!allowed.includes(ch.Type)) fail(`${filename} change ${ch.ID} is ${ch.Type} but the Change Budget is ${budget}`);
		if (!highest.has(ch.Component) || rank[ch.Type] > rank[highest.get(ch.Component)]) highest.set(ch.Component, ch.Type);
	}
	for (const m of mapping) {
		const declared = m["Application Impact"];
		const actual = highest.get(m.Component) ?? "None";
		if (declared !== actual) {
			fail(`${filename} component ${m.Component} declares Application Impact ${declared} but the change register shows ${actual}`);
		}
		if (!allowed.includes(declared) && declared !== "None") fail(`${filename} component ${m.Component} has impact ${declared}, which the Change Budget ${budget} forbids`);
	}

	const risks = parseTable(body.Risks, ASSESSMENT_COLUMNS.Risks, "Risks", filename);
	uniqueIds(risks, "ID", /^R-\d+$/, "risk", filename);
	for (const r of risks) {
		oneOf(r.Likelihood, LEVELS, `risk ${r.ID} Likelihood`, '"## Risks"', filename);
		oneOf(r.Impact, LEVELS, `risk ${r.ID} Impact`, '"## Risks"', filename);
	}

	const openItems = checkOpenList(body["Ambiguities & Open Questions"], "Ambiguities & Open Questions", filename);
	return { name, budget, inventory, byId, mapping, changes, risks, openItems };
}

export function validatePlanContent(markdown, filename = "migration-plan.md", { assessment, allowOpenQuestions = false } = {}) {
	const { text, headings, name } = prepare(markdown, filename, "Plan");
	const body = fixedSections(sectionBodies(text, headings), PLAN_H2, filename);

	const context = parseFields(body["Prerequisites & Context"]);
	const assessmentRef = requireField(context, "Assessment", '"## Prerequisites & Context"', filename, { allowNone: false });

	const waveRows = parseTable(body.Waves, ["Wave", "Components", "Depends On", "Cutover Window", "Downtime Budget"], "Waves", filename);
	const waveOf = new Map();
	const waves = waveRows.map((row, i) => {
		if (row.Wave !== String(i + 1)) fail(`${filename} Waves must be numbered consecutively from 1 (row ${i + 1} is "${row.Wave}")`);
		const components = idList(row.Components);
		if (components.length === 0) fail(`${filename} wave ${row.Wave} has no components`);
		for (const id of components) {
			if (waveOf.has(id)) fail(`${filename} component ${id} appears in more than one wave`);
			waveOf.set(id, i + 1);
		}
		const dependsOn = idList(row["Depends On"]).map(Number);
		for (const d of dependsOn) if (!Number.isInteger(d) || d < 1 || d >= i + 1) fail(`${filename} wave ${row.Wave} may depend only on lower wave numbers (found "${d}")`);
		if (parseDuration(row["Downtime Budget"]) === null) fail(`${filename} wave ${row.Wave} Downtime Budget must be a duration such as 0m, 30m, 4h (found "${row["Downtime Budget"]}")`);
		return { number: i + 1, components, dependsOn, window: row["Cutover Window"], downtime: row["Downtime Budget"] };
	});

	const data = parseTable(body["Data Migration"], ["Component", "Method", "Sync", "Integrity Check"], "Data Migration", filename, { allowNone: true });
	const dataIds = new Set();
	for (const d of data) {
		if (dataIds.has(d.Component)) fail(`${filename} Data Migration lists component ${d.Component} more than once`);
		dataIds.add(d.Component);
		oneOf(d.Sync, SYNC_MODES, `component ${d.Component} Sync`, '"## Data Migration"', filename);
		if (!waveOf.has(d.Component)) fail(`${filename} Data Migration component ${d.Component} is not in any wave`);
	}

	const connectivity = parseFields(body["Connectivity & Identity"]);
	for (const label of ["Network", "DNS Cutover", "Identity", "Secrets", "Certificates"]) {
		requireField(connectivity, label, '"## Connectivity & Identity"', filename, { allowNone: false });
	}

	const checks = parseTable(body.Validation, ["ID", "Check", "Wave", "Success Criterion"], "Validation", filename);
	uniqueIds(checks, "ID", /^V-\d+$/, "check", filename);
	for (const c of checks) if (!waves.some((w) => String(w.number) === c.Wave)) fail(`${filename} check ${c.ID} references unknown wave "${c.Wave}"`);
	for (const w of waves) if (!checks.some((c) => c.Wave === String(w.number))) fail(`${filename} wave ${w.number} has no validation check`);

	const rollbackBody = body.Rollback;
	const rollbackRows = parseTable(rollbackBody, ["Wave", "Trigger", "Rollback Action", "Data Reconciliation"], "Rollback", filename);
	for (const w of waves) {
		const n = rollbackRows.filter((r) => r.Wave === String(w.number)).length;
		if (n !== 1) fail(`${filename} wave ${w.number} must have exactly one Rollback row (found ${n})`);
	}
	for (const r of rollbackRows) if (!waves.some((w) => String(w.number) === r.Wave)) fail(`${filename} Rollback references unknown wave "${r.Wave}"`);
	const pointOfNoReturn = requireField(parseFields(rollbackBody), "Point of No Return", '"## Rollback"', filename);

	const decommission = parseTable(body.Decommission, ["Component", "Condition"], "Decommission", filename, { allowNone: true });
	const decommissioned = new Set(decommission.map((d) => d.Component));

	const openItems = checkOpenList(body["Open Questions & Assumptions"], "Open Questions & Assumptions", filename, { allowOpen: allowOpenQuestions });

	if (assessment) {
		const migrated = assessment.mapping.filter((m) => MIGRATED.includes(m.Strategy)).map((m) => m.Component);
		for (const id of waveOf.keys()) {
			if (!assessment.byId.has(id)) fail(`${filename} wave component ${id} is not in the assessment inventory`);
			if (!migrated.includes(id)) fail(`${filename} component ${id} is not migrated (Retain or Retire) and must not be in a wave`);
		}
		for (const id of migrated) if (!waveOf.has(id)) fail(`${filename} migrated component ${id} is missing from the waves`);
		for (const id of migrated) {
			for (const dep of assessment.byId.get(id).deps) {
				if (waveOf.has(dep) && waveOf.get(dep) > waveOf.get(id)) fail(`${filename} component ${id} (wave ${waveOf.get(id)}) depends on ${dep} which moves later (wave ${waveOf.get(dep)})`);
			}
		}
		const stateful = migrated.filter((id) => STATEFUL.includes(assessment.byId.get(id).Type));
		for (const id of stateful) if (!dataIds.has(id)) fail(`${filename} Data Migration is missing stateful component ${id}`);
		for (const id of dataIds) if (!stateful.includes(id)) fail(`${filename} Data Migration lists ${id}, which is not a migrated Database or Storage component`);
		for (const m of assessment.mapping) {
			if (m.Strategy === "Retire" && !decommissioned.has(m.Component)) fail(`${filename} Decommission is missing retired component ${m.Component}`);
		}
	}

	return { name, assessmentRef, waves, data, checks, rollback: rollbackRows, pointOfNoReturn, decommission, openItems };
}

export function validateRunbookContent(markdown, filename = "runbook.md", { plan } = {}) {
	const { text, headings, name } = prepare(markdown, filename, "Runbook");
	const sections = sectionBodies(text, headings);
	if (sections.length < 4) fail(`${filename} needs "## Prerequisites & Context", "## Go/No-Go Criteria", at least one "## Wave <n>: <title>", and "## Post-Cutover"`);
	if (sections[0].name !== "Prerequisites & Context") fail(`${filename} heading 1 must be "## Prerequisites & Context"`);
	if (sections[1].name !== "Go/No-Go Criteria") fail(`${filename} heading 2 must be "## Go/No-Go Criteria"`);
	if (sections.at(-1).name !== "Post-Cutover") fail(`${filename} last heading must be "## Post-Cutover"`);

	const planRef = requireField(parseFields(sections[0].body), "Plan", '"## Prerequisites & Context"', filename, { allowNone: false });
	const gates = sections[1].body.split("\n").filter((l) => /^- \[ \] \S/.test(l.trim()));
	if (gates.length < 3) fail(`${filename} "## Go/No-Go Criteria" needs at least 3 checklist items "- [ ] ..." (found ${gates.length})`);

	const post = parseFields(sections.at(-1).body);
	for (const label of ["Hypercare", "Handover"]) requireField(post, label, '"## Post-Cutover"', filename, { allowNone: false });

	const waveSections = sections.slice(2, -1);
	const waves = waveSections.map((s, i) => {
		const m = /^Wave (\d+): (.+)$/.exec(s.name);
		if (!m) fail(`${filename} heading "## ${s.name}" must be "## Wave <n>: <title>"`);
		if (Number(m[1]) !== i + 1) fail(`${filename} wave sections must be numbered consecutively from 1 (found "## ${s.name}" at position ${i + 1})`);
		const stepHeadings = s.body.split("\n").map((l) => /^### (.+)$/.exec(l)).filter(Boolean);
		if (stepHeadings.length === 0) fail(`${filename} "## ${s.name}" has no "### Step ${m[1]}.1: <title>" steps`);
		const parts = s.body.split(/^### /m).slice(1);
		const steps = parts.map((part, j) => {
			const [title, ...rest] = part.split("\n");
			const sm = /^Step (\d+)\.(\d+): (.+)$/.exec(title.trim());
			if (!sm || Number(sm[1]) !== i + 1 || Number(sm[2]) !== j + 1) fail(`${filename} step heading "### ${title.trim()}" must be "### Step ${i + 1}.${j + 1}: <title>"`);
			const fields = parseFields(rest.join("\n"));
			const where = `step ${i + 1}.${j + 1}`;
			for (const label of ["Owner", "Action", "Verification", "Duration"]) requireField(fields, label, where, filename, { allowNone: false });
			const rollback = requireField(fields, "Rollback", where, filename);
			if (rollback === NONE && plan && /^none$/i.test(plan.pointOfNoReturn.trim())) {
				fail(`${filename} ${where} has no Rollback, but the plan declares no Point of No Return`);
			}
			if (parseDuration(fields.get("duration")) === null) fail(`${filename} ${where} Duration must be a duration such as 5m, 1h (found "${fields.get("duration")}")`);
			return { id: `${i + 1}.${j + 1}`, text: `${fields.get("action")} ${fields.get("verification")}` };
		});
		return { number: i + 1, title: m[2].trim(), steps };
	});
	if (waves.length === 0) fail(`${filename} needs at least one "## Wave <n>: <title>" section`);

	if (plan) {
		if (waves.length !== plan.waves.length) fail(`${filename} has ${waves.length} wave section(s) but the plan defines ${plan.waves.length}`);
		for (const pw of plan.waves) {
			const stepText = waves[pw.number - 1].steps.map((s) => s.text).join(" ");
			for (const id of pw.components) if (!stepText.includes(id)) fail(`${filename} wave ${pw.number} never addresses component ${id} in a step Action or Verification`);
			for (const check of plan.checks.filter((c) => c.Wave === String(pw.number))) {
				if (!stepText.includes(check.ID)) fail(`${filename} wave ${pw.number} never runs validation check ${check.ID}`);
			}
		}
	}
	return { name, planRef, waves, gates: gates.length };
}

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

function parseArgs(argv) {
	const opts = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h" || arg === "--help") opts.help = true;
		else if (arg === "--allow-open-questions") opts.allowOpenQuestions = true;
		else if (["--dir", "--assessment", "--plan", "--runbook"].includes(arg) && argv[i + 1]) opts[arg.slice(2)] = argv[++i];
		else opts.bad = arg;
	}
	return opts;
}

const USAGE = `Usage:
  node validate-migration.mjs --dir <docs/migration/name> [--allow-open-questions]
  node validate-migration.mjs --assessment <assessment.md> [--plan <migration-plan.md>] [--runbook <runbook.md>]
Options:
  --dir <dir>             Validate assessment.md (required) plus migration-plan.md and runbook.md when present, and cross-check them
  --assessment <file>     Validate one assessment
  --plan <file>           Validate one plan; cross-checked against --assessment when given
  --runbook <file>        Validate one runbook; cross-checked against --plan when given
  --allow-open-questions  Accept open questions in the plan (draft plans)`;

export async function runValidator(argv = process.argv.slice(2)) {
	const opts = parseArgs(argv);
	if (opts.help || opts.bad || (!opts.dir && !opts.assessment && !opts.plan && !opts.runbook)) {
		if (opts.bad) console.error(`Unknown or incomplete argument: ${opts.bad}`);
		console.error(USAGE);
		return opts.help ? 0 : 1;
	}

	let { assessment: assessmentPath, plan: planPath, runbook: runbookPath } = opts;
	if (opts.dir) {
		if (!(await isDirectory(opts.dir))) {
			console.error(`Error: Directory not found: ${opts.dir}`);
			return 1;
		}
		assessmentPath = join(opts.dir, "assessment.md");
		if (!(await exists(assessmentPath))) {
			console.error(`Error: Directory ${opts.dir} does not contain assessment.md`);
			return 1;
		}
		if (await exists(join(opts.dir, "migration-plan.md"))) planPath = join(opts.dir, "migration-plan.md");
		if (await exists(join(opts.dir, "runbook.md"))) runbookPath = join(opts.dir, "runbook.md");
	}

	const label = (path) => path.split(/[\\/]/).pop();
	let current = "migration";
	try {
		let assessment;
		let plan;
		if (assessmentPath) {
			current = assessmentPath;
			assessment = validateAssessmentContent(await readFile(assessmentPath, "utf-8"), assessmentPath);
			console.log(`✓ [${label(assessmentPath)}] Validated: "${assessment.name}" (${assessment.inventory.length} component(s), ${assessment.changes.length} application change(s), budget ${assessment.budget}) (${assessmentPath})`);
		}
		if (planPath) {
			current = planPath;
			plan = validatePlanContent(await readFile(planPath, "utf-8"), planPath, { assessment, allowOpenQuestions: opts.allowOpenQuestions });
			if (assessmentPath && resolve(dirname(planPath), plan.assessmentRef) !== resolve(assessmentPath)) {
				fail(`${planPath} Assessment reference "${plan.assessmentRef}" does not resolve to ${assessmentPath}`);
			}
			console.log(`✓ [${label(planPath)}] Validated: "${plan.name}" (${plan.waves.length} wave(s), ${plan.checks.length} check(s)) (${planPath})`);
		}
		if (runbookPath) {
			current = runbookPath;
			const runbook = validateRunbookContent(await readFile(runbookPath, "utf-8"), runbookPath, { plan });
			if (planPath && resolve(dirname(runbookPath), runbook.planRef) !== resolve(planPath)) {
				fail(`${runbookPath} Plan reference "${runbook.planRef}" does not resolve to ${planPath}`);
			}
			const steps = runbook.waves.reduce((n, w) => n + w.steps.length, 0);
			console.log(`✓ [${label(runbookPath)}] Validated: "${runbook.name}" (${runbook.waves.length} wave(s), ${steps} step(s)) (${runbookPath})`);
		}
		return 0;
	} catch (err) {
		console.error(`✗ [${label(current)}] ${err instanceof ValidationError ? "Validation failed: " : ""}${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runValidator()
		.then((code) => {
			if (code !== 0) process.exit(code);
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
