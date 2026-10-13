#!/usr/bin/env node

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export class ValidationError extends Error {}

function fail(message) {
	throw new ValidationError(message);
}

export const STAGES = ["meet", "triage", "think", "plan", "code", "prove", "release", "learn"];
export const TIERS = ["Low", "Medium", "High", "Critical"];
export const VERDICTS = ["validated", "invalidated", "inconclusive"];

const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SLUG = /^[a-z][a-z0-9-]{0,59}$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;

/** Field types: bool, int (>= 0), posint (>= 1), number (>= 0), unit (0..1), percent (0..100), id, slug, time, or an array of allowed values. */
export const EVENT_TYPES = {
	"meeting.ended": { required: {}, optional: {} },
	"meeting.transcribed": { required: {}, optional: {} },
	"issue.ranked": { required: {}, optional: { meeting: "id" } },
	"issue.created": { required: {}, optional: { meeting: "id" } },
	"code.first_run": { required: { green: "bool" }, optional: {} },
	"code.fix_loop": { required: { count: "int" }, optional: {} },
	"pr.opened": { required: {}, optional: {} },
	"ci.first_run": { required: { green: "bool" }, optional: {} },
	"pr.human_edit": { required: {}, optional: {} },
	"pr.validated": { required: { tier: TIERS }, optional: { ci_green_at: "time" } },
	"pr.merged": { required: {}, optional: {} },
	"pr.reworked": { required: {}, optional: {} },
	"release.production": { required: { percent: "percent" }, optional: {} },
	"release.rollback": { required: {}, optional: {} },
	"incident.opened": { required: {}, optional: { change: "id" } },
	"incident.mitigated": { required: {}, optional: {} },
	"defect.production": { required: { escaped: "bool" }, optional: {} },
	"hypothesis.closed": { required: { verdict: VERDICTS }, optional: {} },
	"feature.deleted": { required: {}, optional: {} },
	"evidence.first_signal": { required: {}, optional: {} },
	"ai.cost": { required: { usd: "number", stage: STAGES, change: "id" }, optional: {} },
	"stage.assisted": { required: { stage: STAGES, share: "unit" }, optional: {} },
	"context.session": { required: { hit: "bool" }, optional: {} },
	"pr.authorship": {
		required: { ai_lines: "int", human_lines: "int" },
		optional: {},
		refine: (e) => (e.ai_lines + e.human_lines > 0 ? null : "at least one of ai_lines and human_lines must be positive"),
	},
	"usecase.run": {
		required: { usecase: "slug", minutes: "number", iterations: "posint", usd: "number", human_intervention: "bool", first_pass: "bool" },
		optional: {},
	},
};

export function validTimestamp(value) {
	const m = typeof value === "string" ? value.match(TIMESTAMP) : null;
	if (!m) return false;
	const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
	const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && h < 24 && mi < 60 && s < 60;
}

function checkValue(name, spec, value) {
	if (Array.isArray(spec)) {
		if (!spec.includes(value)) fail(`field "${name}" must be one of: ${spec.join(", ")}`);
	} else if (spec === "bool") {
		if (typeof value !== "boolean") fail(`field "${name}" must be true or false`);
	} else if (spec === "int") {
		if (!Number.isInteger(value) || value < 0) fail(`field "${name}" must be a non-negative integer`);
	} else if (spec === "posint") {
		if (!Number.isInteger(value) || value < 1) fail(`field "${name}" must be an integer of at least 1`);
	} else if (spec === "number") {
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`field "${name}" must be a non-negative number`);
	} else if (spec === "unit") {
		if (typeof value !== "number" || !(value >= 0 && value <= 1)) fail(`field "${name}" must be a number from 0 to 1`);
	} else if (spec === "percent") {
		if (typeof value !== "number" || !(value >= 0 && value <= 100)) fail(`field "${name}" must be a number from 0 to 100`);
	} else if (spec === "id") {
		if (typeof value !== "string" || !ID.test(value)) fail(`field "${name}" must be a lowercase id such as issue-42`);
	} else if (spec === "slug") {
		if (typeof value !== "string" || !SLUG.test(value)) fail(`field "${name}" must be a lowercase slug such as automated-test-creation`);
	} else if (spec === "time") {
		if (!validTimestamp(value)) fail(`field "${name}" must be an ISO 8601 UTC timestamp such as 2026-10-13T09:30:00Z`);
	}
}

/**
 * Validates one event object and returns it with a stable key order (t, type, id, then schema fields).
 * @param {unknown} event
 */
export function validateEvent(event) {
	if (!event || typeof event !== "object" || Array.isArray(event)) fail("event must be a JSON object");
	if (!validTimestamp(event.t)) fail(`"t" must be an ISO 8601 UTC timestamp such as 2026-10-13T09:30:00Z, found ${JSON.stringify(event.t)}`);
	const schema = EVENT_TYPES[event.type];
	if (!schema) fail(`unknown event type ${JSON.stringify(event.type)}; use one of: ${Object.keys(EVENT_TYPES).join(", ")}`);
	if (typeof event.id !== "string" || !ID.test(event.id)) fail(`"id" must be a lowercase work item id such as issue-42, found ${JSON.stringify(event.id)}`);
	const known = { ...schema.required, ...schema.optional };
	for (const key of Object.keys(event)) {
		if (!["t", "type", "id"].includes(key) && !(key in known)) fail(`unknown field "${key}" for ${event.type}; allowed: ${Object.keys(known).join(", ") || "none"}`);
	}
	const out = { t: event.t, type: event.type, id: event.id };
	for (const [name, spec] of Object.entries(schema.required)) {
		if (!(name in event)) fail(`${event.type} requires field "${name}"`);
		checkValue(name, spec, event[name]);
		out[name] = event[name];
	}
	for (const [name, spec] of Object.entries(schema.optional)) {
		if (!(name in event)) continue;
		checkValue(name, spec, event[name]);
		out[name] = event[name];
	}
	const problem = schema.refine?.(out);
	if (problem) fail(`${event.type}: ${problem}`);
	return out;
}

/** Converts a `--field k=v` string to a typed value using the event schema. */
export function coerceField(type, name, text) {
	const schema = EVENT_TYPES[type];
	if (!schema) fail(`unknown event type ${JSON.stringify(type)}; use one of: ${Object.keys(EVENT_TYPES).join(", ")}`);
	const spec = { ...schema.required, ...schema.optional }[name];
	if (spec === undefined) fail(`unknown field "${name}" for ${type}; allowed: ${Object.keys({ ...schema.required, ...schema.optional }).join(", ") || "none"}`);
	if (spec === "bool") {
		if (text !== "true" && text !== "false") fail(`field "${name}" must be true or false`);
		return text === "true";
	}
	if (["int", "posint", "number", "unit", "percent"].includes(spec)) {
		if (!/^-?\d+(\.\d+)?$/.test(text)) fail(`field "${name}" must be a number, found "${text}"`);
		return Number(text);
	}
	return text;
}

export function buildEvent({ type, id, t, fields = [] }, now = new Date()) {
	const event = { t: t ?? now.toISOString().replace(/\.\d{3}Z$/, "Z"), type, id };
	for (const pair of fields) {
		const i = pair.indexOf("=");
		if (i < 1) fail(`--field must be formatted key=value, found "${pair}"`);
		const name = pair.slice(0, i);
		if (name in event) fail(`field "${name}" is set twice`);
		event[name] = coerceField(type, name, pair.slice(i + 1));
	}
	return validateEvent(event);
}

function parseArgs(args) {
	const parsed = { log: null, type: null, id: null, t: null, fields: [], problems: [] };
	const values = { "--log": "log", "--type": "type", "--id": "id", "--t": "t" };
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--help" || flag === "-h") parsed.help = true;
		else if (!(flag in values) && flag !== "--field") parsed.problems.push(`Unknown argument: ${flag}`);
		else if (args[i + 1] === undefined || args[i + 1] === "") parsed.problems.push(`${flag} needs a value`);
		else if (flag === "--field") parsed.fields.push(args[++i]);
		else parsed[values[flag]] = args[++i];
	}
	return parsed;
}

export async function runEmit(args = process.argv.slice(2), now = new Date()) {
	const opts = parseArgs(args);
	if (!opts.help && opts.problems.length) {
		console.error(`✗ Emit failed: ${opts.problems[0]}`);
		return 1;
	}
	if (opts.help || !opts.log || !opts.type || !opts.id) {
		console.log(`Usage:
  node emit-event.mjs --log metrics/events.jsonl --type <event.type> --id <issue-42> [--t 2026-10-13T09:30:00Z] [--field key=value ...]
Event types: ${Object.keys(EVENT_TYPES).join(", ")}
Validates the event shape, then appends one JSON line. Timestamp defaults to now (UTC).
`);
		return opts.help ? 0 : 1;
	}
	try {
		const event = buildEvent(opts, now);
		await mkdir(dirname(opts.log), { recursive: true });
		let prefix = "";
		try {
			const existing = await readFile(opts.log, "utf-8");
			if (existing && !existing.endsWith("\n")) prefix = "\n";
		} catch (err) {
			if (err.code !== "ENOENT") throw err;
		}
		await appendFile(opts.log, `${prefix}${JSON.stringify(event)}\n`);
		console.log(`✓ [events] Appended ${event.type} for ${event.id} (${opts.log})`);
		return 0;
	} catch (err) {
		console.error(`✗ Emit failed: ${err instanceof ValidationError ? err.message : err.stack}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runEmit().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
