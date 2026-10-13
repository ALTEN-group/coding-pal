#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ForgeError, compareVersions, effectiveStatus, findAsset, isIsoDate, loadCatalog, parseArgs, parseSemver, resolveCatalogPath, todayUtc } from "./catalog-lib.mjs";
import { discover } from "./discover.mjs";

const FIELD = /^- \*\*([^*]+?):\*\*\s*(.*)$/;
const BINDING_LABEL = /^forge\/([a-z0-9]+(?:-[a-z0-9]+)*)@(\S+)$/;
const FENCE = /^\s*(```|~~~)/;

/** Splits markdown into level-2 sections, ignoring headings inside code fences. */
function splitSections(content) {
	const sections = new Map();
	let current = null;
	let fenced = false;
	for (const line of content.split(/\r?\n/)) {
		if (FENCE.test(line)) fenced = !fenced;
		const heading = !fenced && /^## (.+?)\s*$/.exec(line);
		if (heading) {
			current = [];
			sections.set(heading[1], current);
		} else if (current) current.push(line);
	}
	return sections;
}

/** Top-level `- **Name:** value` fields. Following non-field text lines continue the value. Fenced lines are never fields. */
function readFields(lines) {
	const fields = [];
	let fenced = false;
	for (const line of lines) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		const match = FIELD.exec(line);
		if (match) fields.push({ name: match[1].trim(), value: match[2].trim() });
		else if (fields.length && line.trim() && !/^\s*[-*] /.test(line) && !/^#{3,}/.test(line)) fields.at(-1).value += ` ${line.trim()}`;
	}
	return fields;
}

const fieldValue = (fields, name) => fields.find((f) => f.name.toLowerCase() === name.toLowerCase())?.value ?? "";
const isEmptyValue = (value) => value === "" || /^_?none\.?_?$/i.test(value);

/**
 * Extracts what the Forge checks need from a Think record.
 * @returns {{hasBindingsSection: boolean, bindings: object[], badLabels: string[], none: {reason: string}|null,
 *   problem: string, options: object[], selected: number|null, selectedOption: object|null, reasoning: string, customBuildReason: string}}
 */
export function parseThink(content) {
	const sections = splitSections(content);
	const bindingLines = sections.get("Forge Asset Bindings");
	const bindings = [];
	const badLabels = [];
	let none = null;
	for (const { name, value } of readFields(bindingLines ?? [])) {
		const match = BINDING_LABEL.exec(name);
		if (name.toLowerCase() === "none") none = { reason: value };
		else if (match) bindings.push({ label: name, id: match[1], version: match[2], how: value });
		else badLabels.push(name);
	}

	const options = [];
	let option = null;
	for (const line of sections.get("Options Considered") ?? []) {
		const heading = /^### Option (\d+):\s*(.*)$/.exec(line);
		if (heading) {
			option = { n: Number(heading[1]), name: heading[2].trim(), lines: [] };
			options.push(option);
		} else if (option) option.lines.push(line);
	}
	for (const o of options) {
		const fields = readFields(o.lines);
		o.approach = fieldValue(fields, "Approach");
		o.source = fieldValue(fields, "Source");
		delete o.lines;
	}

	const chosen = readFields(sections.get("Chosen Approach") ?? []);
	const selectedMatch = /^Option\s+(\d+)/i.exec(fieldValue(chosen, "Selected"));
	const selected = selectedMatch ? Number(selectedMatch[1]) : null;
	const customBuildReason = fieldValue(chosen, "Custom Build Reason");

	return {
		hasBindingsSection: bindingLines !== undefined,
		bindings,
		badLabels,
		none,
		problem: fieldValue(readFields(sections.get("Business Need & Outcome") ?? []), "Problem Statement"),
		options,
		selected,
		selectedOption: options.find((o) => o.n === selected) ?? null,
		reasoning: fieldValue(chosen, "Reasoning"),
		customBuildReason: isEmptyValue(customBuildReason) ? "" : customBuildReason,
	};
}

/** The `Action` and `New Code` text of each step of a plan, fence-aware. */
export function parsePlanSteps(content) {
	const steps = [];
	let step = null;
	let field = null;
	let fenced = false;
	for (const line of content.split(/\r?\n/)) {
		const stepHeading = !fenced && /^### Step (\d+):/.exec(line);
		if (stepHeading) {
			step = { n: Number(stepHeading[1]), text: "" };
			steps.push(step);
			field = null;
			continue;
		}
		if (!step) continue;
		if (!fenced && /^## /.test(line)) {
			step = null;
			continue;
		}
		const fieldMatch = !fenced && FIELD.exec(line);
		if (fieldMatch) field = fieldMatch[1].trim();
		if (FENCE.test(line)) fenced = !fenced;
		if (field === "Action" || field === "New Code") step.text += `${line}\n`;
	}
	return steps;
}

function mentions(text, asset) {
	const lower = text.toLowerCase();
	const needles = [asset.id, asset.name, ...(asset.artifacts ?? []).map((a) => a.ref)].filter(Boolean).map((s) => s.toLowerCase());
	return needles.some((needle) => lower.includes(needle));
}

/**
 * Checks Forge bindings of a Think record against the catalog.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function checkBindings(think, catalog, { today = todayUtc(), planSteps = null } = {}) {
	const errors = [];
	const warnings = [];
	const source = think.selectedOption?.source ?? "";

	if (!think.hasBindingsSection) errors.push("Missing ## Forge Asset Bindings section");
	for (const label of think.badLabels) errors.push(`Binding label "${label}" must be forge/<id>@<version> or None`);
	if (think.none && !think.none.reason) errors.push("The None binding needs a reason: - **None:** <reason>");
	if (think.none && think.bindings.length) errors.push("None cannot be combined with real Forge bindings");
	if (think.hasBindingsSection && !think.bindings.length && !think.none && !think.badLabels.length) {
		errors.push("State real bindings (forge/<id>@<version>) or - **None:** <reason>");
	}
	if ((source === "Forge reuse" || source === "Hybrid") && !think.bindings.length) {
		errors.push(`A ${source} selection needs at least one forge/<id>@<version> binding`);
	}

	const seen = new Set();
	for (const binding of think.bindings) {
		const { id, version, label } = binding;
		if (!binding.how) errors.push(`${label}: say how the asset is composed`);
		if (seen.has(id)) errors.push(`${label}: bound more than once`);
		seen.add(id);

		const asset = findAsset(catalog, id);
		if (!asset) {
			errors.push(`${label}: no asset "${id}" in the Forge catalog`);
			continue;
		}
		const status = effectiveStatus(asset, today);
		if (status === "removed") {
			errors.push(`${label}: ${id} was removed${asset.removalDate ? ` on ${asset.removalDate}` : ""}${asset.replacement ? `; bind ${asset.replacement} instead` : ""}`);
			continue;
		}
		if (status === "deprecated") {
			errors.push(`${label}: ${id} is deprecated (removal ${asset.removalDate ?? "unscheduled"}); bind ${asset.replacement ?? "its replacement"} instead`);
			continue;
		}
		if (!parseSemver(version)) {
			errors.push(`${label}: "${version}" is not a semantic version; the catalog has ${asset.version}`);
		} else {
			const order = compareVersions(version, asset.version);
			if (order > 0) errors.push(`${label}: version ${version} is newer than the catalog's ${asset.version}`);
			else if (order < 0) warnings.push(`${label}: stale binding, the catalog has ${asset.version}`);
		}
		if (asset.maturity !== "stable" && !new RegExp(`\\b${asset.maturity}\\b`, "i").test(think.reasoning)) {
			warnings.push(`${label}: ${id} is ${asset.maturity}; acknowledge that maturity in the Chosen Approach Reasoning`);
		}
		if (planSteps && !planSteps.some((step) => mentions(step.text, asset))) {
			warnings.push(`${label}: no plan step composes ${id} (no Action or New Code mentions it)`);
		}
	}

	if (source === "Custom build") {
		if (!think.customBuildReason) errors.push("Custom build needs a Custom Build Reason naming what was searched in the Forge");
		const matches = discover(catalog, `${think.problem} ${think.selectedOption.approach}`, { limit: 3, today }).candidates;
		if (matches.length) {
			const summary = matches.map((m) => `${m.id} (score ${m.score}; ${m.matchedTerms.join(", ")})`).join("; ");
			warnings.push(`Custom build selected, but the Forge matches: ${summary}. Challenge the Custom Build Reason against each.`);
		}
	}
	return { errors, warnings };
}

const USAGE = "Usage: node bindings-check.mjs --think <think.md> [--catalog <catalog.json>] [--plan <plan.md>] [--today YYYY-MM-DD]";

async function readText(path, label) {
	try {
		return await readFile(path, "utf-8");
	} catch {
		throw new ForgeError(`${label} not found or unreadable: ${path}`);
	}
}

export async function runBindingsCheck(args = process.argv.slice(2), env = process.env) {
	const opts = parseArgs(args, { values: ["--think", "--catalog", "--plan", "--today"] });
	if (opts.help) {
		console.log(`${USAGE}\nCatalog resolution: --catalog, then FORGE_CATALOG, then catalog.json in the skill folder.`);
		return 0;
	}
	const problem = opts.problems[0] ?? (!opts.think ? "--think is required" : null) ?? (opts.today !== undefined && !isIsoDate(opts.today) ? "--today must be an ISO date (YYYY-MM-DD)" : null);
	if (problem) {
		console.error(`✗ ${problem}\n${USAGE}`);
		return 1;
	}

	try {
		const catalog = await loadCatalog(resolveCatalogPath(opts.catalog, env));
		const think = parseThink(await readText(opts.think, "think.md"));
		const planSteps = opts.plan ? parsePlanSteps(await readText(opts.plan, "plan.md")) : null;
		const { errors, warnings } = checkBindings(think, catalog, { today: opts.today, planSteps });
		warnings.forEach((w) => console.warn(`⚠ [think.md] ${w}`));
		if (errors.length) {
			errors.forEach((e) => console.error(`✗ [think.md] ${e}`));
			return 1;
		}
		const summary = think.bindings.length ? `${think.bindings.length} binding(s)` : `no bindings (${think.none?.reason})`;
		console.log(`✓ [think.md] Forge bindings valid: ${summary} (${opts.think})`);
		return 0;
	} catch (err) {
		if (err instanceof ForgeError) {
			console.error(`✗ ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runBindingsCheck().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
