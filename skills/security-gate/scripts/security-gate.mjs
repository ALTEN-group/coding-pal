#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class GateError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AI_WORDS = new Set(["copilot", "claude", "gpt", "chatgpt", "gemini", "llm", "bot", "agent", "ai", "assistant", "codex", "openai", "anthropic", "dependabot", "renovate", "renovatebot"]);
const NOT_A_PERSON = new Set(["x", "tbd", "tba", "todo", "unknown", "anonymous", "nobody", "someone", "none", "team", "user", "human", "person", "name", "me", "you", "admin", "system"]);
const PLACEHOLDER = /^(tbd|n\/a|\.\.\.|<[^>]*>)$/i;
export const ROLES = ["Product Owner", "Developer", "Architect", "DevOps", "QA and maintainer"];
const SECURITY_SEVERITY_ERROR = 7.0;
const SARIF_LEVELS = new Set(["error", "warning", "note", "none"]);

function isValidDate(value) {
	if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function todayIso(now = new Date()) {
	return now.toISOString().slice(0, 10);
}

async function readJson(file, what) {
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (err) {
		throw new GateError(`cannot read ${what} ${file}: ${err.code ?? err.message}`);
	}
	try {
		return JSON.parse(raw);
	} catch (err) {
		throw new GateError(`${what} ${file} is not valid JSON: ${err.message}`);
	}
}

/** Resolves the effective SARIF level of a result: result level, then rule default, then SARIF's default `warning`. An unknown level counts as `error`. */
function resultLevel(result, rule) {
	const level = result.level ?? rule?.defaultConfiguration?.level ?? "warning";
	const normalized = typeof level === "string" ? level.toLowerCase() : "";
	return SARIF_LEVELS.has(normalized) ? normalized : "error";
}

function securitySeverity(result, rule) {
	const raw = result.properties?.["security-severity"] ?? rule?.properties?.["security-severity"];
	const value = typeof raw === "string" ? Number.parseFloat(raw) : raw;
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Extracts normalized findings from a SARIF 2.1.0 document. */
export function parseSarif(doc, file = "sarif") {
	if (!doc || typeof doc !== "object" || !Array.isArray(doc.runs)) {
		throw new GateError(`${file} is not a SARIF document (missing runs[])`);
	}
	if (doc.runs.length === 0) throw new GateError(`${file} has no runs: no scanner output to check`);
	const findings = [];
	for (const run of doc.runs) {
		if (run?.invocations?.some?.((inv) => inv?.executionSuccessful === false)) {
			throw new GateError(`${file} reports a scanner run that did not complete (executionSuccessful: false)`);
		}
		const tool = run.tool?.driver?.name ?? "unknown-tool";
		const rules = new Map();
		for (const rule of run.tool?.driver?.rules ?? []) rules.set(rule.id, rule);
		for (const result of run.results ?? []) {
			const rule = rules.get(result.ruleId) ?? (Number.isInteger(result.ruleIndex) ? run.tool?.driver?.rules?.[result.ruleIndex] : undefined);
			const ruleId = result.ruleId ?? rule?.id ?? "unknown-rule";
			const physical = result.locations?.[0]?.physicalLocation;
			const level = resultLevel(result, rule);
			const score = securitySeverity(result, rule);
			findings.push({
				source: "sarif",
				tool,
				id: ruleId,
				path: physical?.artifactLocation?.uri?.replace(/^file:\/\//, "") ?? null,
				line: physical?.region?.startLine ?? null,
				message: (result.message?.text ?? "").split("\n")[0].trim(),
				level,
				severity: score !== null && score >= SECURITY_SEVERITY_ERROR ? "error" : level,
				score,
			});
		}
	}
	return findings;
}

/** Extracts normalized findings from Conftest/OPA JSON output. */
export function parseConftest(doc, file = "conftest") {
	if (!Array.isArray(doc)) throw new GateError(`${file} is not Conftest JSON (expected an array)`);
	const findings = [];
	for (const entry of doc) {
		if (!entry || typeof entry !== "object") throw new GateError(`${file} has a non-object entry`);
		for (const [kind, severity] of [["failures", "error"], ["warnings", "warning"]]) {
			for (const item of entry[kind] ?? []) {
				const msg = typeof item === "string" ? item : item?.msg;
				if (typeof msg !== "string" || !msg) throw new GateError(`${file} has a ${kind} entry without msg`);
				findings.push({
					source: "conftest",
					tool: "conftest",
					id: msg,
					path: entry.filename ?? null,
					line: null,
					message: msg,
					level: severity,
					severity,
					score: null,
				});
			}
		}
	}
	return findings;
}

/** Parses an SPDX expression into a tree: { op: "AND"|"OR", items } or { id }. */
export function parseLicenseExpression(expression) {
	const tokens = expression.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
	let pos = 0;
	function parseOr() {
		const items = [parseAnd()];
		while (tokens[pos]?.toUpperCase() === "OR") {
			pos++;
			items.push(parseAnd());
		}
		return items.length === 1 ? items[0] : { op: "OR", items };
	}
	function parseAnd() {
		const items = [parseAtom()];
		while (tokens[pos]?.toUpperCase() === "AND") {
			pos++;
			items.push(parseAtom());
		}
		return items.length === 1 ? items[0] : { op: "AND", items };
	}
	function parseAtom() {
		const token = tokens[pos++];
		if (token === undefined) throw new GateError(`invalid license expression "${expression}"`);
		if (token === "(") {
			const inner = parseOr();
			if (tokens[pos++] !== ")") throw new GateError(`invalid license expression "${expression}"`);
			return inner;
		}
		if (token === ")" || ["AND", "OR"].includes(token.toUpperCase())) throw new GateError(`invalid license expression "${expression}"`);
		if (tokens[pos]?.toUpperCase() === "WITH") pos += 2;
		return { id: token };
	}
	const tree = parseOr();
	if (pos < tokens.length) throw new GateError(`invalid license expression "${expression}"`);
	return tree;
}

function normalizeLicenseList(list) {
	return new Set((list ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** An SPDX `X+` is `X-or-later`; the deny side also matches the base id `X`. */
function licenseKeys(id, { base = false } = {}) {
	const key = id.toLowerCase();
	if (!key.endsWith("+") || key.length < 2) return [key];
	const stem = key.slice(0, -1);
	return base ? [key, `${stem}-or-later`, stem] : [key, `${stem}-or-later`];
}

function listHas(list, id, options) {
	if (list.size === 0) return false;
	const entries = new Set([...list].flatMap((entry) => licenseKeys(entry)));
	return licenseKeys(id, options).some((key) => entries.has(key));
}

/** True when the license (id, name, or SPDX expression) is allowed and not denied. */
export function licenseAcceptable(license, { allow = new Set(), deny = new Set() } = {}) {
	let tree;
	try {
		tree = parseLicenseExpression(license);
	} catch {
		tree = { id: license };
	}
	const check = (node) => {
		if (node.id !== undefined) {
			if (listHas(deny, node.id, { base: true })) return false;
			return allow.size === 0 || listHas(allow, node.id);
		}
		return node.op === "OR" ? node.items.some(check) : node.items.every(check);
	};
	return check(tree);
}

function componentLabel(component) {
	const name = component.group ? `${component.group}/${component.name}` : component.name;
	return component.version ? `${name}@${component.version}` : name;
}

function componentLicenses(component) {
	const out = [];
	for (const entry of component.licenses ?? []) {
		if (entry.expression) out.push(entry.expression);
		else if (entry.license?.id) out.push(entry.license.id);
		else if (entry.license?.name) out.push(entry.license.name);
	}
	return out;
}

function* walkComponents(components) {
	for (const component of components ?? []) {
		yield component;
		yield* walkComponents(component.components);
	}
}

/** Checks every CycloneDX component license against the allow and deny lists. */
export function parseSbom(doc, { allow = [], deny = [] } = {}, file = "sbom") {
	if (!doc || typeof doc !== "object" || !Array.isArray(doc.components)) {
		throw new GateError(`${file} is not a CycloneDX SBOM (missing components[])`);
	}
	const lists = { allow: normalizeLicenseList(allow), deny: normalizeLicenseList(deny) };
	const findings = [];
	for (const component of walkComponents(doc.components)) {
		if (!component?.name) continue;
		const label = componentLabel(component);
		const licenses = componentLicenses(component);
		if (licenses.length === 0) {
			findings.push({ source: "license", tool: "sbom", id: "unknown-license", alias: component.name, path: label, line: null, message: `${label} declares no license`, level: "error", severity: "error", score: null });
			continue;
		}
		for (const license of licenses) {
			if (!licenseAcceptable(license, lists)) {
				const denied = [...lists.deny].some((d) => license.toLowerCase().includes(d)) || !licenseAcceptable(license, { deny: lists.deny });
				findings.push({
					source: "license",
					tool: "sbom",
					id: license,
					alias: component.name,
					path: label,
					line: null,
					message: `${label} uses ${license}, ${denied ? "which is denied" : "which is not in the allow list"}`,
					level: "error",
					severity: "error",
					score: null,
				});
			}
		}
	}
	return findings;
}

function globMatches(path, pattern) {
	const re = pattern
		.replace(/[.+^${}()|[\]\\?]/g, "\\$&")
		.replace(/\*\*/g, "\0")
		.replace(/\*/g, "[^/]*")
		.replace(/\0/g, ".*");
	return new RegExp(`^${re}$`).test(path);
}

/** Why a name cannot be a named person, or null. A bare role, a placeholder, or an AI is never a person. */
function notAPerson(name) {
	if (!/\p{L}/u.test(name)) return "it has no letters";
	if (/[<>[\]{}]/.test(name) && !/\[bot\]/i.test(name)) return "it is a placeholder";
	const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
	if (words.some((w) => AI_WORDS.has(w.replace(/\d+$/, ""))) || /github[- ]actions/i.test(name)) return "it looks like an AI";
	const plain = words.join(" ").replace(/^the /, "");
	if (ROLES.some((r) => r.toLowerCase() === plain) || NOT_A_PERSON.has(plain) || PLACEHOLDER.test(name.trim())) return "it is a role or a placeholder, not a person's name";
	return null;
}

/** Returns the problem with an `approvedBy` value formatted "<name> (<role>)", or null when it is a named person with a role. */
export function approverProblem(text) {
	const m = text.trim().match(/^(.+?) \((.+)\)$/);
	if (!m) return `approvedBy must be formatted "<name> (<role>)", found "${text.trim()}"`;
	const name = m[1].trim().replace(/\s+/g, " ");
	const role = m[2].trim();
	if (!ROLES.includes(role)) return `approvedBy role "${role}" must be one of: ${ROLES.join(", ")}`;
	const reason = notAPerson(name);
	if (reason) return `approvedBy "${name}" is not a named person (${reason}): AI proposes, humans decide`;
	return null;
}

/** Validates a parsed waivers document. Returns { waivers, errors }. */
export function validateWaivers(doc, today) {
	const errors = [];
	const waivers = [];
	if (!Array.isArray(doc)) return { waivers, errors: ["waivers file must be a JSON array"] };
	doc.forEach((w, i) => {
		const where = `waiver #${i + 1}${w && typeof w.id === "string" ? ` (${w.id})` : ""}`;
		if (!w || typeof w !== "object") {
			errors.push(`${where} is not an object`);
			return;
		}
		const problems = [];
		for (const key of ["id", "reason", "approvedBy", "expires"]) {
			if (typeof w[key] !== "string" || !w[key].trim()) problems.push(`missing ${key}`);
		}
		if (typeof w.path !== "undefined" && typeof w.path !== "string") problems.push("path must be a string");
		if (typeof w.expires === "string" && w.expires.trim() && !isValidDate(w.expires)) problems.push("expires must be a valid YYYY-MM-DD date");
		if (typeof w.approvedBy === "string" && w.approvedBy.trim()) {
			const problem = approverProblem(w.approvedBy);
			if (problem) problems.push(problem);
		}
		if (problems.length > 0) {
			errors.push(`invalid ${where}: ${problems.join(", ")}`);
			return;
		}
		if (w.expires < today) {
			errors.push(`expired ${where}: expired on ${w.expires}`);
			return;
		}
		waivers.push(w);
	});
	return { waivers, errors };
}

function findWaiver(finding, waivers) {
	return waivers.find((w) => {
		if (w.id !== finding.id && w.id !== finding.alias) return false;
		if (!w.path) return true;
		return finding.path !== null && globMatches(finding.path, w.path);
	});
}

/** Splits findings into failing, waived, and below the severity bar. */
export function evaluate(findings, { minSeverity = "error", waivers = [] } = {}) {
	const failing = [];
	const waived = [];
	const belowBar = [];
	const used = new Set();
	for (const finding of findings) {
		const counts = finding.severity === "error" || (minSeverity === "warning" && finding.severity === "warning");
		if (!counts) {
			belowBar.push(finding);
			continue;
		}
		const waiver = findWaiver(finding, waivers);
		if (waiver) {
			used.add(waiver);
			waived.push({ ...finding, waiver });
		} else {
			failing.push(finding);
		}
	}
	return { failing, waived, belowBar, unusedWaivers: waivers.filter((w) => !used.has(w)) };
}

function where(f) {
	if (!f.path) return "";
	return f.line ? `${f.path}:${f.line}` : f.path;
}

export function renderReport(result, waiverErrors) {
	const lines = [];
	for (const f of result.failing) lines.push(`FAIL ${f.source} ${f.id}${where(f) ? ` ${where(f)}` : ""} - ${f.message}`);
	for (const f of result.waived) {
		lines.push(`WAIVED ${f.source} ${f.id}${where(f) ? ` ${where(f)}` : ""} - approved by ${f.waiver.approvedBy}, expires ${f.waiver.expires}: ${f.waiver.reason}`);
	}
	for (const e of waiverErrors) lines.push(`WAIVER-ERROR ${e}`);
	for (const w of result.unusedWaivers) lines.push(`NOTE unused waiver ${w.id}: remove it when the finding is gone`);
	const verdict = result.failing.length === 0 && waiverErrors.length === 0 ? "PASS" : "FAIL";
	lines.push(`${verdict}: ${result.failing.length} failing, ${result.waived.length} waived, ${result.belowBar.length} below the severity bar, ${waiverErrors.length} waiver error(s)`);
	return lines.join("\n");
}

export function parseArgs(argv) {
	const opts = { sarif: [], conftest: [], sbom: [], allow: [], deny: [], minSeverity: "error", waivers: null, today: null, json: false };
	const needValue = (i) => {
		if (argv[i + 1] === undefined) throw new GateError(`${argv[i]} needs a value`);
		return argv[i + 1];
	};
	const csv = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--sarif") opts.sarif.push(needValue(i++));
		else if (arg === "--conftest") opts.conftest.push(needValue(i++));
		else if (arg === "--sbom") opts.sbom.push(needValue(i++));
		else if (arg === "--allow-licenses") opts.allow.push(...csv(needValue(i++)));
		else if (arg === "--deny-licenses") opts.deny.push(...csv(needValue(i++)));
		else if (arg === "--min-severity") opts.minSeverity = needValue(i++);
		else if (arg === "--waivers") opts.waivers = needValue(i++);
		else if (arg === "--today") opts.today = needValue(i++);
		else if (arg === "--json") opts.json = true;
		else throw new GateError(`unknown argument ${arg}`);
	}
	if (!["error", "warning"].includes(opts.minSeverity)) throw new GateError("--min-severity must be error or warning");
	if (opts.today !== null && !isValidDate(opts.today)) throw new GateError("--today must be a valid YYYY-MM-DD date");
	if (opts.sarif.length + opts.conftest.length + opts.sbom.length === 0) {
		throw new GateError("nothing to check: pass at least one of --sarif, --conftest, --sbom");
	}
	if (opts.sbom.length > 0 && opts.allow.length === 0 && opts.deny.length === 0) {
		throw new GateError("--sbom needs --allow-licenses or --deny-licenses");
	}
	return opts;
}

export async function runSecurityGate(argv) {
	try {
		const opts = parseArgs(argv);
		const today = opts.today ?? todayIso();
		const findings = [];
		const parseFile = (parser, doc, file) => {
			try {
				return parser(doc, file);
			} catch (err) {
				if (err instanceof GateError || !(err instanceof TypeError)) throw err;
				throw new GateError(`${file} is malformed: ${err.message}`);
			}
		};
		for (const file of opts.sarif) findings.push(...parseFile(parseSarif, await readJson(file, "SARIF file"), file));
		for (const file of opts.conftest) findings.push(...parseFile(parseConftest, await readJson(file, "Conftest file"), file));
		for (const file of opts.sbom) findings.push(...parseFile((doc, f) => parseSbom(doc, { allow: opts.allow, deny: opts.deny }, f), await readJson(file, "SBOM"), file));
		let waivers = [];
		let waiverErrors = [];
		if (opts.waivers) {
			({ waivers, errors: waiverErrors } = validateWaivers(await readJson(opts.waivers, "waivers file"), today));
		}
		const result = evaluate(findings, { minSeverity: opts.minSeverity, waivers });
		const ok = result.failing.length === 0 && waiverErrors.length === 0;
		if (opts.json) {
			console.log(JSON.stringify({ ok, failing: result.failing, waived: result.waived, belowBar: result.belowBar.length, waiverErrors }, null, 2));
		} else {
			console.log(renderReport(result, waiverErrors));
		}
		return ok ? 0 : 1;
	} catch (err) {
		if (err instanceof GateError) {
			console.error(`security-gate: ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runSecurityGate(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
