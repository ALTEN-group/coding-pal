#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { ForgeError, effectiveStatus, isIsoDate, loadCatalog, parseArgs, parseSemver, resolveCatalogPath, todayUtc } from "./catalog-lib.mjs";

export const KINDS = ["shared-service", "library", "template", "contract"];
export const MATURITIES = ["alpha", "beta", "stable"];
export const STATUSES = ["active", "deprecated", "removed"];
export const ARTIFACT_TYPES = ["docker-image", "npm-package", "pypi-package", "maven-package", "nuget-package", "git-repository", "openapi-spec"];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_FIELDS = [
	"id", "name", "kind", "summary", "capabilities", "keywords", "owner", "version", "maturity", "status", "releasedAt",
	"interface", "artifacts", "docs", "repository", "license", "tests", "composesWith", "replacement", "removalDate",
];
const INTERFACE_FIELDS = ["type", "docs", "integrationGuide", "frontendGuide", "contract"];

const isText = (value) => typeof value === "string" && value.trim() !== "";
const isHttps = (value) => {
	try {
		return isText(value) && new URL(value).protocol === "https:";
	} catch {
		return false;
	}
};
const textList = (value) => Array.isArray(value) && value.length > 0 && value.every(isText);

function validateAsset(asset, label, ids, byId, today, errors, warnings) {
	const err = (message) => errors.push(`${label}: ${message}`);
	const warn = (message) => warnings.push(`${label}: ${message}`);

	for (const key of Object.keys(asset)) {
		if (!ASSET_FIELDS.includes(key)) err(`unknown field "${key}"`);
	}
	if (!isText(asset.name)) err("name is required");
	if (!KINDS.includes(asset.kind)) err(`kind must be one of ${KINDS.join(", ")}`);
	if (!isText(asset.summary)) err("summary is required");
	if (!textList(asset.capabilities)) err("capabilities must be a non-empty list of text");
	if (!textList(asset.keywords)) err("keywords must be a non-empty list of text");
	if (!MATURITIES.includes(asset.maturity)) err(`maturity must be one of ${MATURITIES.join(", ")}`);
	if (!STATUSES.includes(asset.status)) err(`status must be one of ${STATUSES.join(", ")}`);

	const semver = parseSemver(asset.version);
	if (!semver) err(`version "${asset.version}" is not a semantic version (for example 1.2.0 or 0.1.0-alpha.9)`);
	else if (asset.maturity === "stable" && (semver.major < 1 || semver.pre.length)) {
		err(`maturity stable needs a release at 1.0.0 or above without a prerelease tag, found ${asset.version}`);
	}
	if (!isIsoDate(asset.releasedAt)) err("releasedAt must be an ISO date (YYYY-MM-DD)");
	else if (asset.releasedAt > today) err(`releasedAt ${asset.releasedAt} is in the future`);

	for (const field of ["docs", "repository"]) {
		if (!isHttps(asset[field])) err(`${field} must be an https URL`);
	}
	if (!isText(asset.license)) err("license is required");

	const iface = asset.interface;
	if (!iface || typeof iface !== "object" || Array.isArray(iface)) {
		err("interface is required (type, docs, contract)");
	} else {
		for (const key of Object.keys(iface)) {
			if (!INTERFACE_FIELDS.includes(key)) err(`unknown interface field "${key}"`);
		}
		if (!isText(iface.type)) err("interface.type is required");
		if (!isHttps(iface.docs)) err("interface.docs must be an https URL");
		if (!isText(iface.contract)) err("interface.contract is required: name where the versioned contract lives");
		for (const key of ["integrationGuide", "frontendGuide"]) {
			if (iface[key] !== undefined && !isHttps(iface[key])) err(`interface.${key} must be an https URL`);
		}
		if (iface.integrationGuide === undefined) warn("interface.integrationGuide is missing: consumers lack an integration path");
	}

	if (!Array.isArray(asset.artifacts) || asset.artifacts.length === 0) {
		err("artifacts must list at least one consumable artifact");
	} else {
		for (const artifact of asset.artifacts) {
			if (!ARTIFACT_TYPES.includes(artifact?.type)) err(`artifact type must be one of ${ARTIFACT_TYPES.join(", ")}`);
			else if (!isText(artifact.ref)) err(`artifact ${artifact.type} needs a ref`);
		}
	}

	const tests = asset.tests;
	if (!tests || typeof tests !== "object" || (!isText(tests.ci) && !isText(tests.coverage))) {
		err("tests must name a CI workflow or a coverage source");
	} else if (isText(tests.ci) && !isHttps(tests.ci)) {
		err("tests.ci must be an https URL");
	}

	if (!isText(asset.owner)) err("owner is required: every asset has an accountable owner");

	if (!Array.isArray(asset.composesWith) || !asset.composesWith.every(isText)) {
		err("composesWith must be a list of asset ids (empty when none)");
	} else {
		for (const other of asset.composesWith) {
			if (other === asset.id) err("composesWith must not list the asset itself");
			else if (!ids.has(other)) err(`composesWith references unknown asset "${other}"`);
			else if (asset.status === "active" && effectiveStatus(byId.get(other), today) !== "active") {
				warn(`composesWith "${other}" is ${effectiveStatus(byId.get(other), today)}`);
			}
		}
	}

	const hasReplacement = asset.replacement !== null && asset.replacement !== undefined;
	const hasRemoval = asset.removalDate !== null && asset.removalDate !== undefined;
	if (hasRemoval && !isIsoDate(asset.removalDate)) err("removalDate must be an ISO date (YYYY-MM-DD) or null");
	if (hasReplacement && !isText(asset.replacement)) err("replacement must be an asset id or null");

	if (asset.status === "active") {
		if (hasReplacement || hasRemoval) err("an active asset has no replacement or removalDate; set status deprecated first");
	} else if (asset.status === "deprecated") {
		if (!hasReplacement) err("deprecated needs a replacement asset id");
		else if (asset.replacement === asset.id) err("replacement must not be the asset itself");
		else if (!ids.has(asset.replacement)) err(`replacement references unknown asset "${asset.replacement}"`);
		else if (effectiveStatus(byId.get(asset.replacement), today) !== "active") err(`replacement "${asset.replacement}" is not active`);
		if (!hasRemoval) err("deprecated needs a removalDate");
		else if (isIsoDate(asset.removalDate)) {
			if (asset.removalDate <= today) err(`removalDate ${asset.removalDate} has passed; set status removed`);
			if (isIsoDate(asset.releasedAt) && asset.removalDate <= asset.releasedAt) err("removalDate must be after releasedAt");
		}
	} else if (asset.status === "removed") {
		if (!hasRemoval) err("removed needs a removalDate");
		else if (isIsoDate(asset.removalDate) && asset.removalDate > today) err(`removalDate ${asset.removalDate} is in the future; keep status deprecated until then`);
		if (hasReplacement && isText(asset.replacement) && !ids.has(asset.replacement)) err(`replacement references unknown asset "${asset.replacement}"`);
	}
}

/**
 * Checks the certified-before-listed rules.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateCatalog(catalog, { today = todayUtc() } = {}) {
	const errors = [];
	const warnings = [];
	if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
		return { errors: ["catalog must be a JSON object"], warnings };
	}
	if (catalog.version !== 1) errors.push(`catalog: version must be 1, found ${JSON.stringify(catalog.version)}`);
	if (!Array.isArray(catalog.assets)) {
		errors.push('catalog: "assets" must be an array');
		return { errors, warnings };
	}

	const ids = new Set();
	const byId = new Map();
	catalog.assets.forEach((asset, index) => {
		const id = asset?.id;
		if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
			errors.push(`assets[${index}]: must be an object`);
		} else if (!isText(id) || !ID.test(id)) {
			errors.push(`assets[${index}]: id must be lowercase letters, digits, and hyphens`);
		} else if (ids.has(id)) {
			errors.push(`${id}: duplicate id`);
		} else {
			ids.add(id);
			byId.set(id, asset);
		}
	});

	catalog.assets.forEach((asset, index) => {
		if (!asset || typeof asset !== "object" || Array.isArray(asset) || byId.get(asset.id) !== asset) return;
		validateAsset(asset, asset.id ?? `assets[${index}]`, ids, byId, today, errors, warnings);
	});
	return { errors, warnings };
}

const USAGE = "Usage: node validate-forge.mjs [--catalog <catalog.json>] [--today YYYY-MM-DD]";

export async function runValidator(args = process.argv.slice(2), env = process.env) {
	const opts = parseArgs(args, { values: ["--catalog", "--today"] });
	if (opts.help) {
		console.log(`${USAGE}\nCatalog resolution: --catalog, then FORGE_CATALOG, then catalog.json in the skill folder.`);
		return 0;
	}
	if (opts.problems.length) {
		console.error(`✗ ${opts.problems[0]}\n${USAGE}`);
		return 1;
	}
	if (opts.today !== undefined && !isIsoDate(opts.today)) {
		console.error("✗ --today must be an ISO date (YYYY-MM-DD)");
		return 1;
	}

	try {
		const path = resolveCatalogPath(opts.catalog, env);
		const catalog = await loadCatalog(path);
		const { errors, warnings } = validateCatalog(catalog, { today: opts.today });
		warnings.forEach((w) => console.warn(`⚠ [forge catalog] ${w}`));
		if (errors.length) {
			errors.forEach((e) => console.error(`✗ [forge catalog] ${e}`));
			return 1;
		}
		console.log(`✓ [forge catalog] ${catalog.assets.length} asset(s) certified and valid (${path})`);
		return 0;
	} catch (err) {
		if (err instanceof ForgeError) {
			console.error(`✗ [forge catalog] ${err.message}`);
			return 1;
		}
		throw err;
	}
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
