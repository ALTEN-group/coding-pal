#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class CompatError extends Error {
	constructor(message) {
		super(message);
		this.name = "CompatError";
	}
}

export const HUMAN_ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const LOWER_BOUNDS = ["minimum", "exclusiveMinimum", "minLength", "minItems", "minProperties"];
const UPPER_BOUNDS = ["maximum", "exclusiveMaximum", "maxLength", "maxItems", "maxProperties"];
const MAX_DEPTH = 50;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function parseDocument(text, label) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new CompatError(`${label} is not valid JSON (${err.message}); YAML is not supported, convert it to JSON first`);
	}
}

export function documentKind(doc, label = "document") {
	if (!isObject(doc)) throw new CompatError(`${label} must be a JSON object`);
	if ("swagger" in doc) throw new CompatError(`${label} is Swagger 2.0; only OpenAPI 3.x and JSON Schema are supported`);
	if ("openapi" in doc) {
		if (typeof doc.openapi !== "string" || !doc.openapi.startsWith("3.")) throw new CompatError(`${label} has unsupported openapi version "${doc.openapi}"; only 3.x is supported`);
		return "openapi";
	}
	return "schema";
}

function pointer(doc, ref) {
	if (ref === "#") return doc;
	if (!ref.startsWith("#/")) throw new CompatError(`unsupported $ref "${ref}": only local "#/..." references are resolved`);
	let node = doc;
	for (const raw of ref.slice(2).split("/")) {
		let key;
		try {
			key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
		} catch {
			throw new CompatError(`malformed $ref "${ref}"`);
		}
		if ((!isObject(node) && !Array.isArray(node)) || !(key in node)) throw new CompatError(`unresolvable $ref "${ref}"`);
		node = node[key];
	}
	return node;
}

export function deref(doc, node) {
	let current = node;
	for (let i = 0; isObject(current) && typeof current.$ref === "string"; i++) {
		if (i > MAX_DEPTH) throw new CompatError(`$ref chain too deep at "${node.$ref}"`);
		current = pointer(doc, current.$ref);
	}
	return current;
}

/** Resolves $ref and merges allOf members into one schema view. */
function flatten(doc, schema, depth = 0) {
	const s = deref(doc, schema);
	if (!isObject(s) || !Array.isArray(s.allOf)) return s;
	if (depth > MAX_DEPTH) throw new CompatError("allOf nesting too deep (cyclic $ref?)");
	const { allOf, ...own } = s;
	const merged = {};
	for (const part of [...allOf.map((p) => flatten(doc, p, depth + 1)), own]) {
		if (!isObject(part)) continue;
		for (const [key, value] of Object.entries(part)) {
			if (key === "properties") merged.properties = { ...merged.properties, ...value };
			else if (key === "required") merged.required = [...new Set([...(merged.required ?? []), ...value])];
			else merged[key] = value;
		}
	}
	return merged;
}

function typeSet(schema) {
	if (schema.type === undefined) return null;
	const set = new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
	if (schema.nullable === true) set.add("null");
	return set;
}

const describe = (site, loc, what) => `${[site.label, loc].filter(Boolean).join(" ")}${site.label || loc ? ": " : ""}${what}`;
const covers = (set, type) => set.has(type) || (type === "integer" && set.has("number"));
const show = (set) => [...set].sort().join("|");

class Comparison {
	constructor(baseDoc, headDoc) {
		this.baseDoc = baseDoc;
		this.headDoc = headDoc;
		this.changes = [];
		this.keys = new Set();
	}

	add(kind, at, what) {
		const key = `${kind}|${at}|${what}`;
		if (this.keys.has(key)) return;
		this.keys.add(key);
		this.changes.push({ kind, at, what });
	}

	breaking(at, what) {
		this.add("BREAKING", at, what);
	}

	compatible(at, what) {
		this.add("compatible", at, what);
	}

	/**
	 * @param {"request"|"response"} role request: the server consumes it; response: clients consume it
	 * @param {{at: string, label: string}} site
	 */
	schema(rawBase, rawHead, role, site, loc = "", seen = new Map()) {
		const b0 = deref(this.baseDoc, rawBase);
		const h0 = deref(this.headDoc, rawHead);
		if (!isObject(b0) || !isObject(h0)) return;
		if (seen.get(b0)?.has(h0)) return;
		seen.set(b0, (seen.get(b0) ?? new Set()).add(h0));
		const b = flatten(this.baseDoc, b0);
		const h = flatten(this.headDoc, h0);
		const request = role === "request";
		const say = (kind, what) => this.add(kind, site.at, describe(site, loc, what));

		if (!this.types(b, h, request, say)) return;
		this.enums(b, h, request, say);
		this.properties(b, h, role, site, loc, seen);

		if (request) {
			if (b.additionalProperties !== false && h.additionalProperties === false) say("BREAKING", "additionalProperties set to false");
			this.bounds(b, h, say);
		}
		if (isObject(b.additionalProperties) && isObject(h.additionalProperties)) this.schema(b.additionalProperties, h.additionalProperties, role, site, `${loc}{*}`, seen);
		if (isObject(b.items) && isObject(h.items)) this.schema(b.items, h.items, role, site, `${loc}[]`, seen);
		for (const keyword of ["oneOf", "anyOf"]) this.variants(b, h, keyword, role, site, loc, seen, say);
	}

	/** Returns false when the type changed in a way that makes deeper comparison pointless. */
	types(b, h, request, say) {
		const bt = typeSet(b);
		const ht = typeSet(h);
		if (!bt && !ht) return true;
		if (!bt) {
			say(request ? "BREAKING" : "compatible", `type constraint added (${show(ht)})`);
			return true;
		}
		if (!ht) {
			say(request ? "compatible" : "BREAKING", `type constraint removed (was ${show(bt)})`);
			return true;
		}
		const lost = request ? [...bt].filter((t) => !covers(ht, t)) : [...ht].filter((t) => !covers(bt, t));
		if (lost.length) {
			say("BREAKING", `type changed ${show(bt)} -> ${show(ht)}`);
			return false;
		}
		if (!same([...bt].sort(), [...ht].sort())) say("compatible", `type ${request ? "widened" : "narrowed"} ${show(bt)} -> ${show(ht)}`);
		return true;
	}

	enums(b, h, request, say) {
		// Request: the server must keep accepting every old value. Response: clients must not meet a value they never saw.
		const lostKind = request ? "BREAKING" : "compatible";
		const gainedKind = request ? "compatible" : "BREAKING";
		if (b.enum && h.enum) {
			for (const value of b.enum) if (!h.enum.some((v) => same(v, value))) say(lostKind, `enum value ${JSON.stringify(value)} removed`);
			for (const value of h.enum) if (!b.enum.some((v) => same(v, value))) say(gainedKind, `enum value ${JSON.stringify(value)} added`);
		} else if (h.enum) {
			say(lostKind, "enum constraint added");
		} else if (b.enum) {
			say(gainedKind, "enum constraint removed");
		}
	}

	properties(b, h, role, site, loc, seen) {
		const request = role === "request";
		const bp = isObject(b.properties) ? b.properties : {};
		const hp = isObject(h.properties) ? h.properties : {};
		const bReq = new Set(b.required ?? []);
		const hReq = new Set(h.required ?? []);
		const names = [...new Set([...Object.keys(bp), ...Object.keys(hp), ...bReq, ...hReq])];
		for (const name of names) {
			const at = loc ? `${loc}.${name}` : name;
			const inBase = name in bp || bReq.has(name);
			const inHead = name in hp || hReq.has(name);
			const say = (kind, what) => this.add(kind, site.at, describe(site, at, what));
			if (inBase && !inHead) {
				if (!request) say("BREAKING", "property removed");
				else if (h.additionalProperties === false) say("BREAKING", "property removed and additional properties are rejected");
				else say("compatible", "property removed (ignored by the server)");
			} else if (!inBase && inHead) {
				if (!request) say("compatible", "property added");
				else if (hReq.has(name)) say("BREAKING", "new required property");
				else say("compatible", "new optional property");
			} else {
				if (name in bp && name in hp) this.schema(bp[name], hp[name], role, site, at, seen);
				if (request && !bReq.has(name) && hReq.has(name)) say("BREAKING", "property is now required");
				else if (request && bReq.has(name) && !hReq.has(name)) say("compatible", "property is no longer required");
				else if (!request && bReq.has(name) && !hReq.has(name)) say("BREAKING", "property is no longer guaranteed (now optional)");
				else if (!request && !bReq.has(name) && hReq.has(name)) say("compatible", "property is now always present");
			}
		}
	}

	bounds(b, h, say) {
		for (const key of [...LOWER_BOUNDS, ...UPPER_BOUNDS]) {
			const lower = LOWER_BOUNDS.includes(key);
			const bv = typeof b[key] === "number" ? b[key] : undefined;
			const hv = typeof h[key] === "number" ? h[key] : undefined;
			if (bv === hv) continue;
			const tighter = hv !== undefined && (bv === undefined || (lower ? hv > bv : hv < bv));
			const word = bv === undefined ? "added" : hv === undefined ? "removed" : tighter ? "tightened" : "relaxed";
			say(tighter ? "BREAKING" : "compatible", `${key} ${word}`);
		}
		for (const key of ["pattern", "format"]) {
			if (b[key] === h[key]) continue;
			const word = b[key] === undefined ? "added" : h[key] === undefined ? "removed" : "changed";
			say(h[key] !== undefined ? "BREAKING" : "compatible", `${key} ${word}`);
		}
	}

	variants(b, h, keyword, role, site, loc, seen, say) {
		const bv = b[keyword];
		const hv = h[keyword];
		if (!bv && !hv) return;
		if (!Array.isArray(bv) || !Array.isArray(hv)) {
			say("BREAKING", `${keyword} ${bv ? "removed" : "added"}`);
			return;
		}
		const request = role === "request";
		for (let i = 0; i < Math.min(bv.length, hv.length); i++) this.schema(bv[i], hv[i], role, site, `${loc}<${keyword}[${i}]>`, seen);
		if (hv.length < bv.length) say(request ? "BREAKING" : "compatible", `${keyword} variant removed`);
		if (hv.length > bv.length) say(request ? "compatible" : "BREAKING", `${keyword} variant added`);
	}

	compareDocuments(kind) {
		if (kind === "openapi") this.openapi();
		else for (const role of ["request", "response"]) this.schema(this.baseDoc, this.headDoc, role, { at: "schema", label: "" });
		const rank = { BREAKING: 0, compatible: 1 };
		const breakingKeys = new Set(this.changes.filter((c) => c.kind === "BREAKING").map((c) => `${c.at}|${c.what}`));
		return this.changes
			.filter((change) => change.kind === "BREAKING" || !breakingKeys.has(`${change.at}|${change.what}`))
			.map((change, index) => ({ change, index }))
			.sort((x, y) => rank[x.change.kind] - rank[y.change.kind] || x.index - y.index)
			.map((x) => x.change);
	}

	openapi() {
		const bp = isObject(this.baseDoc.paths) ? this.baseDoc.paths : {};
		const hp = isObject(this.headDoc.paths) ? this.headDoc.paths : {};
		for (const path of Object.keys(bp)) {
			if (!(path in hp)) {
				this.breaking(path, "path removed");
				continue;
			}
			const bi = deref(this.baseDoc, bp[path]) ?? {};
			const hi = deref(this.headDoc, hp[path]) ?? {};
			for (const method of METHODS) {
				const at = `${method.toUpperCase()}:${path}`;
				if (bi[method] && !hi[method]) this.breaking(at, "operation removed");
				else if (!bi[method] && hi[method]) this.compatible(at, "operation added");
				else if (bi[method] && hi[method]) this.operation(at, bi, hi, bi[method], hi[method]);
			}
		}
		for (const path of Object.keys(hp)) {
			if (path in bp) continue;
			const hi = deref(this.headDoc, hp[path]) ?? {};
			const methods = METHODS.filter((m) => hi[m]);
			if (!methods.length) this.compatible(path, "path added");
			for (const method of methods) this.compatible(`${method.toUpperCase()}:${path}`, "operation added");
		}
	}

	operation(at, bItem, hItem, bOp, hOp) {
		this.parameters(at, this.parametersOf(this.baseDoc, bItem, bOp), this.parametersOf(this.headDoc, hItem, hOp));
		this.requestBody(at, bOp, hOp);
		this.responses(at, bOp, hOp);
		this.security(at, bOp, hOp);
	}

	parametersOf(doc, item, op) {
		const map = new Map();
		for (const raw of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
			const p = deref(doc, raw);
			if (!isObject(p) || typeof p.name !== "string") continue;
			map.set(`${p.in}:${p.name}`, { ...p, required: p.required === true || p.in === "path" });
		}
		return map;
	}

	parameters(at, base, head) {
		const goneBase = [];
		for (const [key, bp] of base) {
			const hp = head.get(key);
			if (!hp) {
				goneBase.push([key, bp]);
				continue;
			}
			if (!bp.required && hp.required) this.breaking(at, `parameter ${key} made required`);
			else if (bp.required && !hp.required) this.compatible(at, `parameter ${key} no longer required`);
			if (bp.schema && hp.schema) this.schema(bp.schema, hp.schema, "request", { at, label: `parameter ${key}` });
		}
		const newHead = [...head].filter(([key]) => !base.has(key));
		for (const [key, bp] of goneBase) {
			const moved = newHead.findIndex(([, hp]) => hp.name === bp.name);
			if (moved >= 0) {
				this.breaking(at, `parameter ${bp.name} location changed from ${bp.in} to ${newHead[moved][1].in}`);
				newHead.splice(moved, 1);
			} else {
				this.compatible(at, `parameter ${key} removed (ignored by the server)`);
			}
		}
		for (const [key, hp] of newHead) {
			if (hp.required) this.breaking(at, `new required parameter ${key}`);
			else this.compatible(at, `new optional parameter ${key}`);
		}
	}

	requestBody(at, bOp, hOp) {
		const bb = bOp.requestBody ? deref(this.baseDoc, bOp.requestBody) : null;
		const hb = hOp.requestBody ? deref(this.headDoc, hOp.requestBody) : null;
		if (!bb && !hb) return;
		if (!bb) {
			if (hb.required === true) this.breaking(at, "new required request body");
			else this.compatible(at, "request body added");
			return;
		}
		if (!hb) {
			this.compatible(at, "request body removed");
			return;
		}
		if (bb.required !== true && hb.required === true) this.breaking(at, "request body is now required");
		this.content(at, bb.content, hb.content, "request", "request body");
	}

	content(at, bContent, hContent, role, label) {
		const bc = isObject(bContent) ? bContent : {};
		const hc = isObject(hContent) ? hContent : {};
		for (const mediaType of Object.keys(bc)) {
			if (!(mediaType in hc)) {
				this.breaking(at, `${label} media type ${mediaType} removed`);
				continue;
			}
			const bs = bc[mediaType]?.schema;
			const hs = hc[mediaType]?.schema;
			const site = { at, label: `${label} ${mediaType}` };
			if (bs && hs) this.schema(bs, hs, role, site);
			else if (bs && !hs) this.add(role === "request" ? "compatible" : "BREAKING", at, describe(site, "", "schema removed"));
			else if (!bs && hs) this.add(role === "request" ? "BREAKING" : "compatible", at, describe(site, "", "schema added"));
		}
		for (const mediaType of Object.keys(hc)) if (!(mediaType in bc)) this.compatible(at, `${label} media type ${mediaType} added`);
	}

	responses(at, bOp, hOp) {
		const br = isObject(bOp.responses) ? bOp.responses : {};
		const hr = isObject(hOp.responses) ? hOp.responses : {};
		for (const status of Object.keys(br)) {
			if (!(status in hr)) {
				this.breaking(at, `response ${status} removed`);
				continue;
			}
			const b = deref(this.baseDoc, br[status]) ?? {};
			const h = deref(this.headDoc, hr[status]) ?? {};
			this.content(at, b.content, h.content, "response", `response ${status}`);
			const bh = isObject(b.headers) ? b.headers : {};
			const hh = isObject(h.headers) ? h.headers : {};
			for (const name of Object.keys(bh)) if (!(name in hh)) this.breaking(at, `response ${status} header ${name} removed`);
			for (const name of Object.keys(hh)) if (!(name in bh)) this.compatible(at, `response ${status} header ${name} added`);
		}
		for (const status of Object.keys(hr)) if (!(status in br)) this.compatible(at, `response ${status} added`);
	}

	security(at, bOp, hOp) {
		const base = bOp.security ?? this.baseDoc.security ?? [];
		const head = hOp.security ?? this.headDoc.security ?? [];
		const open = (list) => list.length === 0 || list.some((r) => Object.keys(r).length === 0);
		if (open(base)) {
			if (!open(head)) this.breaking(at, "security requirement added");
			return;
		}
		if (open(head)) return;
		for (const alt of base) {
			const covered = head.some((h) => Object.entries(h).every(([name, scopes]) => name in alt && (scopes ?? []).every((s) => (alt[name] ?? []).includes(s))));
			if (!covered) this.breaking(at, `security requirement changed: clients authenticating with ${Object.keys(alt).join("+")} are no longer accepted`);
		}
	}
}

export function compareContracts(baseDoc, headDoc) {
	const baseKind = documentKind(baseDoc, "base");
	const headKind = documentKind(headDoc, "head");
	if (baseKind !== headKind) throw new CompatError(`base is ${baseKind} but head is ${headKind}; compare two documents of the same kind`);
	const changes = new Comparison(baseDoc, headDoc).compareDocuments(baseKind);
	return { kind: baseKind, changes, breaking: changes.filter((c) => c.kind === "BREAKING") };
}

export const formatChange = (c) => `${c.kind} ${c.at} ${c.what}`;

const field = (name) => new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*)?${name}(?::\\*\\*|\\*\\*:|:)\\s*(.*?)\\s*$`, "im");
const NOT_A_PERSON = /\b(ai|bot|agent|copilot|assistant|claude|gpt|llm|automation|pipeline)\b|\[bot\]|[<>]/i;
const SIGNATURE = /^Signed by\s+(.+?)\s+\(([^()]+)\)\s+on\s+(\d{4}-\d{2}-\d{2})$/;

/** An accepted decision record signed by a named Architect is the only way to release a breaking public contract. */
export function checkDecisionRecord(text) {
	const status = text.match(field("Status"))?.[1] || text.match(/^##\s+Status\s*\n+\s*(\S.*?)\s*$/im)?.[1];
	if (!status) return { ok: false, reason: "decision record has no Status line" };
	if (status.replace(/[*_`]/g, "").split(/[\s.,;:(]/)[0].toLowerCase() !== "accepted") return { ok: false, reason: `decision record Status is "${status}", not Accepted` };
	const signature = (text.match(field("Signature"))?.[1] ?? "").replace(/\*\*/g, "");
	const automated = signature.match(/^Automated by ([^;()\n]+) on (\d{4}-\d{2}-\d{2})$/);
	if (automated) {
		const name = automated[1].trim();
		const day = new Date(`${automated[2]}T00:00:00Z`);
		if (name.length < 2 || /^(tbd|x|<[^>]*>)$/i.test(name)) return { ok: false, reason: "automated decision requires an identity" };
		if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== automated[2]) return { ok: false, reason: "automated decision date is not a real date" };
		const deciders = text.match(field("Deciders"))?.[1] ?? "";
		if (!deciders.split(",").some((entry) => entry.trim().toLowerCase() === `${name} (Automation)`.toLowerCase())) return { ok: false, reason: "automated signature must match an Automation entry in Deciders" };
		return { ok: true, reason: "" };
	}
	const unsigned = (why) => ({ ok: false, reason: `decision record is Accepted but not signed by a named Architect ("Signature: Signed by <name> (Architect) on YYYY-MM-DD"): ${why}` });
	const m = signature.match(SIGNATURE);
	if (!m) return unsigned("the Signature line does not match");
	const [, name, role, date] = m;
	if (role !== "Architect") return unsigned(`the role is "${role}"; a breaking public contract is an Architect decision`);
	if (name.length < 2 || NOT_A_PERSON.test(name)) return unsigned(`"${name}" is not a person`);
	const day = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return unsigned(`"${date}" is not a real date`);
	return { ok: true, reason: "" };
}

const USAGE = "Usage: node contract-compat.mjs --base <old.json> --head <new.json> [--allow-breaking <decision-record.md>]";

function parseArgs(args) {
	const parsed = { base: null, head: null, allow: null };
	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === "--base" && next) parsed.base = args[++i];
		else if (args[i] === "--head" && next) parsed.head = args[++i];
		else if (args[i] === "--allow-breaking" && next) parsed.allow = args[++i];
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else throw new CompatError(`unknown or incomplete argument "${args[i]}"`);
	}
	return parsed;
}

async function readText(path, label) {
	try {
		return await readFile(path, "utf-8");
	} catch {
		throw new CompatError(`${label} not found: ${path}`);
	}
}

export async function runContractCompat(args = process.argv.slice(2)) {
	try {
		const opts = parseArgs(args);
		if (opts.help) {
			console.log(`${USAGE}\nJSON only (OpenAPI 3.x or JSON Schema). A breaking change needs --allow-breaking with an Accepted, signed decision record.`);
			return 0;
		}
		if (!opts.base || !opts.head) {
			console.error(USAGE);
			return 1;
		}
		const base = parseDocument(await readText(opts.base, "base"), opts.base);
		const head = parseDocument(await readText(opts.head, "head"), opts.head);
		const { kind, changes, breaking } = compareContracts(base, head);
		for (const change of changes) console.log(formatChange(change));
		const compatible = changes.length - breaking.length;

		if (!breaking.length) {
			console.error(`✓ [contract-compat] No breaking changes in ${kind} contract (${compatible} compatible)`);
			return 0;
		}
		if (!opts.allow) {
			console.error(`✗ [contract-compat] ${breaking.length} breaking change(s); a breaking public contract is Critical and needs an Accepted decision record (--allow-breaking)`);
			return 1;
		}
		const verdict = checkDecisionRecord(await readText(opts.allow, "decision record"));
		if (!verdict.ok) {
			console.error(`✗ [contract-compat] ${breaking.length} breaking change(s) and ${verdict.reason} (${opts.allow})`);
			return 1;
		}
		console.error(`✓ [contract-compat] ${breaking.length} breaking change(s) allowed by ${opts.allow}`);
		return 0;
	} catch (err) {
		console.error(`✗ [contract-compat] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runContractCompat().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
