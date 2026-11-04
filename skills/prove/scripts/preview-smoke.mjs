#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export class SmokeError extends Error {}

const ROUTE_KEYS = new Set(["path", "status", "jsonPath", "equals", "maxMs"]);
export const DEFAULT_ROUTES = [{ path: "/health", status: 200 }];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Validates a routes document and applies the default status of 200. */
export function validateRoutes(doc) {
	if (!Array.isArray(doc) || doc.length === 0) throw new SmokeError("routes file must be a non-empty JSON array");
	return doc.map((route, i) => {
		const where = `route #${i + 1}`;
		if (!route || typeof route !== "object" || Array.isArray(route)) throw new SmokeError(`${where} must be an object`);
		for (const key of Object.keys(route)) if (!ROUTE_KEYS.has(key)) throw new SmokeError(`${where} has unknown key ${key}`);
		if (typeof route.path !== "string" || !route.path.startsWith("/")) throw new SmokeError(`${where} path must be a string starting with /`);
		if (route.status !== undefined && !(Number.isInteger(route.status) && route.status >= 100 && route.status <= 599)) throw new SmokeError(`${where} status must be an HTTP status code`);
		if (route.jsonPath !== undefined && (typeof route.jsonPath !== "string" || !route.jsonPath)) throw new SmokeError(`${where} jsonPath must be a non-empty string`);
		if (route.equals !== undefined && route.jsonPath === undefined) throw new SmokeError(`${where} equals needs jsonPath`);
		if (route.maxMs !== undefined && !(typeof route.maxMs === "number" && route.maxMs > 0)) throw new SmokeError(`${where} maxMs must be a positive number`);
		return { ...route, status: route.status ?? 200 };
	});
}

export async function loadRoutes(file) {
	if (!file) return DEFAULT_ROUTES;
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (err) {
		throw new SmokeError(`cannot read routes file ${file}: ${err.code ?? err.message}`);
	}
	try {
		return validateRoutes(JSON.parse(raw));
	} catch (err) {
		if (err instanceof SmokeError) throw err;
		throw new SmokeError(`routes file ${file} is not valid JSON: ${err.message}`);
	}
}

/** Reads `a.b`, `a[0].b` or `a.0.b` from a parsed JSON value. Returns undefined when missing. */
export function getJsonPath(value, path) {
	let current = value;
	for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
		if (current === null || typeof current !== "object" || !Object.hasOwn(current, part)) return undefined;
		current = current[part];
	}
	return current;
}

function sameValue(actual, expected) {
	return JSON.stringify(actual) === JSON.stringify(expected);
}

/** One attempt: returns { status, ms, text } or { error } when the app is not answering. */
async function attempt(url, timeoutMs, fetchImpl) {
	const start = performance.now();
	try {
		const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
		const text = await res.text();
		return { status: res.status, ms: Math.round(performance.now() - start), text };
	} catch (err) {
		return { error: err.name === "TimeoutError" ? `no response within ${timeoutMs} ms` : (err.cause?.code ?? err.message) };
	}
}

/** Retries only while the app is not answering (connection error, timeout, or 5xx the route does not expect). */
export async function probeRoute(baseUrl, route, { timeoutMs = 5000, retries = 3, retryDelayMs = 1000, fetchImpl = fetch } = {}) {
	const url = `${baseUrl.replace(/\/+$/, "")}${route.path}`;
	const expects5xx = route.status >= 500;
	let result;
	for (let tries = 0; tries <= retries; tries++) {
		result = await attempt(url, timeoutMs, fetchImpl);
		const notAnswering = result.error !== undefined || (result.status >= 500 && !expects5xx);
		if (!notAnswering || tries === retries) return { ...result, attempts: tries + 1 };
		await sleep(retryDelayMs);
	}
	return result;
}

/** Evaluates the assertions of one route once, against the final response. */
export function checkRoute(route, result) {
	const failures = [];
	if (result.error !== undefined) return [`app not answering: ${result.error}`];
	if (result.status !== route.status) failures.push(`expected status ${route.status}, got ${result.status}`);
	if (route.jsonPath !== undefined) {
		let body;
		try {
			body = JSON.parse(result.text);
		} catch {
			failures.push("body is not JSON");
		}
		if (body !== undefined) {
			const actual = getJsonPath(body, route.jsonPath);
			if (actual === undefined) failures.push(`${route.jsonPath} is missing from the response`);
			else if (route.equals !== undefined && !sameValue(actual, route.equals)) failures.push(`${route.jsonPath} expected ${JSON.stringify(route.equals)}, got ${JSON.stringify(actual)}`);
		}
	}
	if (route.maxMs !== undefined && result.ms > route.maxMs) failures.push(`took ${result.ms} ms, over the ${route.maxMs} ms limit`);
	return failures;
}

export async function runSmoke(baseUrl, routes, options = {}) {
	const results = [];
	for (const route of routes) {
		const probe = await probeRoute(baseUrl, route, options);
		const failures = checkRoute(route, probe);
		results.push({ route, probe, failures, ok: failures.length === 0 });
	}
	return results;
}

export function renderResults(results) {
	const lines = [];
	for (const { route, probe, failures, ok } of results) {
		const timing = probe.error === undefined ? ` ${probe.status} ${probe.ms} ms` : "";
		const retried = probe.attempts > 1 ? ` (${probe.attempts} attempts)` : "";
		lines.push(`${ok ? "PASS" : "FAIL"} GET ${route.path}${timing}${retried}`);
		for (const failure of failures) lines.push(`  - ${failure}`);
	}
	const passed = results.filter((r) => r.ok).length;
	lines.push(`${passed === results.length ? "PASS" : "FAIL"}: ${passed}/${results.length} routes passed`);
	return lines.join("\n");
}

function intOption(argv, i, min) {
	const value = argv[i + 1];
	if (value === undefined || !/^\d+$/.test(value) || Number(value) < min) throw new SmokeError(`${argv[i]} needs an integer >= ${min}`);
	return Number(value);
}

export function parseArgs(argv) {
	const opts = { url: null, routes: null, timeoutMs: 5000, retries: 3, retryDelayMs: 1000 };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--url" || arg === "--routes") {
			if (argv[i + 1] === undefined) throw new SmokeError(`${arg} needs a value`);
			opts[arg === "--url" ? "url" : "routes"] = argv[++i];
		} else if (arg === "--timeout-ms") opts.timeoutMs = intOption(argv, i++, 1);
		else if (arg === "--retries") opts.retries = intOption(argv, i++, 0);
		else if (arg === "--retry-delay-ms") opts.retryDelayMs = intOption(argv, i++, 0);
		else throw new SmokeError(`unknown argument ${arg}`);
	}
	if (!opts.url) throw new SmokeError("--url is required");
	let parsed;
	try {
		parsed = new URL(opts.url);
	} catch {
		throw new SmokeError(`--url is not a valid URL: ${opts.url}`);
	}
	if (!["http:", "https:"].includes(parsed.protocol)) throw new SmokeError("--url must be http or https");
	return opts;
}

export async function runPreviewSmoke(argv, { fetchImpl = fetch } = {}) {
	try {
		const opts = parseArgs(argv);
		const routes = await loadRoutes(opts.routes);
		const results = await runSmoke(opts.url, routes, { timeoutMs: opts.timeoutMs, retries: opts.retries, retryDelayMs: opts.retryDelayMs, fetchImpl });
		console.log(renderResults(results));
		return results.every((r) => r.ok) ? 0 : 1;
	} catch (err) {
		if (err instanceof SmokeError) {
			console.error(`preview-smoke: ${err.message}`);
			return 1;
		}
		throw err;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runPreviewSmoke(process.argv.slice(2)).then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
