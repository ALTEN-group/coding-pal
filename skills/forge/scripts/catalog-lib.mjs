import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export class ForgeError extends Error {
	constructor(message) {
		super(message);
		this.name = "ForgeError";
	}
}

export const CATALOG_ENV = "FORGE_CATALOG";

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export function bundledCatalogPath() {
	return fileURLToPath(new URL("../catalog.json", import.meta.url));
}

/** Resolution order: --catalog, then FORGE_CATALOG, then catalog.json in the skill folder. */
export function resolveCatalogPath(explicit = null, env = process.env) {
	return explicit || env[CATALOG_ENV] || bundledCatalogPath();
}

export async function loadCatalog(path) {
	let raw;
	try {
		raw = await readFile(path, "utf-8");
	} catch {
		throw new ForgeError(`Catalog not found or unreadable: ${path}`);
	}
	let catalog;
	try {
		catalog = JSON.parse(raw);
	} catch (err) {
		throw new ForgeError(`Catalog is not valid JSON (${path}): ${err.message}`);
	}
	if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.assets)) {
		throw new ForgeError(`Catalog must be an object with an "assets" array (${path})`);
	}
	return catalog;
}

export function isIsoDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function todayUtc() {
	return new Date().toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function parseSemver(version) {
	const match = typeof version === "string" ? SEMVER.exec(version) : null;
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ? match[4].split(".") : [] };
}

/** Semver precedence: negative when a < b, 0 when equal, positive when a > b. Build metadata is ignored. */
export function compareVersions(a, b) {
	const x = parseSemver(a);
	const y = parseSemver(b);
	if (!x || !y) throw new ForgeError(`Not a semantic version: ${!x ? a : b}`);
	for (const key of ["major", "minor", "patch"]) {
		if (x[key] !== y[key]) return x[key] - y[key];
	}
	if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		if (p === undefined) return -1;
		if (q === undefined) return 1;
		if (p === q) continue;
		const pNum = /^\d+$/.test(p);
		const qNum = /^\d+$/.test(q);
		if (pNum && qNum) return Number(p) - Number(q);
		if (pNum !== qNum) return pNum ? -1 : 1;
		return p < q ? -1 : 1;
	}
	return 0;
}

/** A removalDate in the past makes an asset removed, whatever its declared status. */
export function effectiveStatus(asset, today = todayUtc()) {
	if (asset.status === "removed") return "removed";
	if (isIsoDate(asset.removalDate) && asset.removalDate <= today) return "removed";
	return asset.status;
}

export function findAsset(catalog, id) {
	return catalog.assets.find((asset) => asset?.id === id) ?? null;
}

const camel = (flag) => flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Minimal flag parser: `values` take an argument, `booleans` do not. Reports unknown and incomplete flags. */
export function parseArgs(args, { values = [], booleans = [] } = {}) {
	const parsed = { help: false, problems: [] };
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--help" || flag === "-h") parsed.help = true;
		else if (booleans.includes(flag)) parsed[camel(flag)] = true;
		else if (values.includes(flag)) {
			if (args[i + 1] === undefined) parsed.problems.push(`${flag} needs a value`);
			else parsed[camel(flag)] = args[++i];
		} else parsed.problems.push(`Unknown argument: ${flag}`);
	}
	return parsed;
}
