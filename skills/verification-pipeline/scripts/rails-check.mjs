#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export class RailsError extends Error {}

export const DEFAULT_CONFIG = {
	controlScripts: [
		"control-guard.mjs",
		"secret-guard.mjs",
		"dependency-guard.mjs",
		"scope-guard.mjs",
		"verify-criteria.mjs",
		"mutation-bar.mjs",
		"contract-compat.mjs",
		"security-gate.mjs",
		"preview-smoke.mjs",
	],
	remediateReferences: ["control-guard.mjs", "workflow_run", "fix-loop:"],
	agents: ["code.agent.md", "gate-fix.agent.md"],
	skills: [
		"code-loop",
		"pr-record",
		"criteria-verify",
		"mutation-bar",
		"contract-compat",
		"security-gate",
		"control-guard",
		"preview-smoke",
		"task-gate",
		"scope-guard",
		"secret-guard",
		"dependency-guard",
	],
};

const FILES = {
	verify: ".github/workflows/verify.yml",
	remediate: ".github/workflows/remediate.yml",
	prTemplate: ".github/pull_request_template.md",
	apm: "apm.yml",
};

export function resolveConfig(raw = {}) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RailsError("config must be a JSON object");
	for (const key of Object.keys(raw)) {
		if (!(key in DEFAULT_CONFIG)) throw new RailsError(`unknown config key ${key}`);
		if (!Array.isArray(raw[key]) || raw[key].some((v) => typeof v !== "string" || !v.trim())) {
			throw new RailsError(`config ${key} must be an array of non-empty strings`);
		}
	}
	return { ...DEFAULT_CONFIG, ...raw };
}

/** Drops full-line and trailing YAML comments, so a commented-out control does not count as present. */
export function stripYamlComments(text) {
	return text
		.split("\n")
		.filter((line) => !line.trim().startsWith("#"))
		.map((line) => line.replace(/\s#.*$/, ""))
		.join("\n");
}

function mentions(text, token) {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

async function readIfExists(root, rel) {
	const file = join(root, rel);
	return existsSync(file) ? readFile(file, "utf8") : null;
}

/** Checks a project root for the Platform Rails. Returns the list of missing items. */
export async function checkRails(root, config = DEFAULT_CONFIG) {
	const missing = [];
	const add = (category, item, detail) => missing.push({ category, item, detail });

	const verify = await readIfExists(root, FILES.verify);
	if (verify === null) add("file", FILES.verify, "the verification pipeline is missing");
	else {
		const active = stripYamlComments(verify);
		for (const script of config.controlScripts) {
			if (!active.includes(script)) add("control", script, `${FILES.verify} does not run it`);
		}
	}

	const remediate = await readIfExists(root, FILES.remediate);
	if (remediate === null) add("file", FILES.remediate, "the auto-remediation workflow is missing");
	else {
		const active = stripYamlComments(remediate);
		for (const token of config.remediateReferences) {
			if (!active.includes(token)) add("remediation", token, `${FILES.remediate} does not reference it`);
		}
	}

	if (!existsSync(join(root, FILES.prTemplate))) add("file", FILES.prTemplate, "the pull request template is missing");

	const apm = await readIfExists(root, FILES.apm);
	if (apm === null) add("file", FILES.apm, "the project does not declare its Persistent Context");
	else {
		const active = stripYamlComments(apm);
		for (const agent of config.agents) if (!mentions(active, agent)) add("apm-agent", agent, `${FILES.apm} does not list it`);
		for (const skill of config.skills) if (!mentions(active, skill)) add("apm-skill", skill, `${FILES.apm} does not list it`);
	}

	for (const skill of config.skills) {
		if (!existsSync(join(root, ".agents", "skills", skill, "SKILL.md"))) add("installed-skill", skill, `.agents/skills/${skill}/SKILL.md is not installed`);
	}
	return missing;
}

export function renderResult(missing) {
	const lines = missing.map((m) => `MISSING ${m.category} ${m.item}: ${m.detail}`);
	lines.push(missing.length === 0 ? "PASS: the Platform Rails are in place" : `FAIL: ${missing.length} item(s) missing`);
	return lines.join("\n");
}

export function parseArgs(argv) {
	const opts = { root: null, config: null, json: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--root" || arg === "--config") {
			if (argv[i + 1] === undefined) throw new RailsError(`${arg} needs a value`);
			opts[arg.slice(2)] = argv[++i];
		} else if (arg === "--json") opts.json = true;
		else throw new RailsError(`unknown argument ${arg}`);
	}
	if (!opts.root) throw new RailsError("--root is required");
	return opts;
}

export async function runRailsCheck(argv) {
	try {
		const opts = parseArgs(argv);
		const root = resolve(opts.root);
		if (!existsSync(root)) throw new RailsError(`root ${opts.root} does not exist`);
		let config = DEFAULT_CONFIG;
		if (opts.config) {
			let raw;
			try {
				raw = await readFile(opts.config, "utf8");
			} catch (err) {
				throw new RailsError(`cannot read config ${opts.config}: ${err.code ?? err.message}`);
			}
			try {
				config = resolveConfig(JSON.parse(raw));
			} catch (err) {
				if (err instanceof RailsError) throw err;
				throw new RailsError(`config ${opts.config} is not valid JSON: ${err.message}`);
			}
		}
		const missing = await checkRails(root, config);
		if (opts.json) console.log(JSON.stringify({ ok: missing.length === 0, missing }, null, 2));
		else console.log(renderResult(missing));
		return missing.length === 0 ? 0 : 1;
	} catch (err) {
		if (err instanceof RailsError) {
			console.error(`rails-check: ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runRailsCheck(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
