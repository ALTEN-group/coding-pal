#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ForgeError, compareVersions, daysBetween, effectiveStatus, findAsset, isIsoDate, loadCatalog, parseArgs, parseSemver, resolveCatalogPath, todayUtc } from "./catalog-lib.mjs";
import { parseThink } from "./bindings-check.mjs";

/**
 * Computes the Forge health signals.
 * @param {object} catalog
 * @param {{issue: string, think: ReturnType<typeof parseThink>}[]} items work items with a think.md
 */
export function computeHealth(catalog, items, { staleDays = 180, today = todayUtc() } = {}) {
	const live = catalog.assets.filter((asset) => effectiveStatus(asset, today) !== "removed");
	const withBindings = items.filter((item) => item.think.bindings.length);
	const nonCurrent = [];
	const retired = [];
	const unknown = [];
	for (const item of items) {
		for (const { id, version, label } of item.think.bindings) {
			const asset = findAsset(catalog, id);
			if (!asset) {
				unknown.push({ issue: item.issue, label });
				continue;
			}
			const state = effectiveStatus(asset, today);
			if (state !== "active") retired.push({ issue: item.issue, label, status: state, replacement: asset.replacement ?? null });
			if (!parseSemver(version) || compareVersions(version, asset.version) !== 0) nonCurrent.push({ issue: item.issue, label, current: asset.version });
		}
	}
	return {
		workItems: items.length,
		bindingItems: withBindings.map((item) => item.issue),
		shareBinding: items.length ? withBindings.length / items.length : null,
		withoutOwner: live.filter((asset) => !asset.owner || !String(asset.owner).trim()).map((asset) => asset.id),
		stale: live
			.filter((asset) => isIsoDate(asset.releasedAt) && daysBetween(asset.releasedAt, today) > staleDays)
			.map((asset) => ({ id: asset.id, releasedAt: asset.releasedAt, ageDays: daysBetween(asset.releasedAt, today) })),
		nonCurrent,
		retired,
		unknown,
		emptyCustomReasons: items
			.filter((item) => item.think.selectedOption?.source === "Custom build" && !item.think.customBuildReason)
			.map((item) => item.issue),
		staleDays,
		today,
		assets: catalog.assets.length,
	};
}

const flag = (count) => (count ? "Warning" : "Healthy");

export function renderHealth(health, { catalogPath, specsDir }) {
	const share = health.shareBinding === null ? "n/a (no work items)" : `${health.bindingItems.length} of ${health.workItems} (${Math.round(health.shareBinding * 100)}%)`;
	const out = [
		"# Forge Health",
		"",
		`Date: ${health.today}. Catalog: \`${catalogPath}\` (${health.assets} asset(s)). Specs: \`${specsDir}\` (${health.workItems} work item(s) with think.md).`,
		"",
		"| Signal | Value | Status |",
		"|---|---|---|",
		`| Work items binding at least one Forge asset | ${share} | Track the trend: rising is healthy |`,
		`| Assets without an owner | ${health.withoutOwner.length} | ${flag(health.withoutOwner.length)} |`,
		`| Assets with a release older than ${health.staleDays} days | ${health.stale.length} | ${flag(health.stale.length)} |`,
		`| Bindings pinned to a non-current version | ${health.nonCurrent.length} | ${flag(health.nonCurrent.length)} |`,
		`| Bindings to deprecated or removed assets | ${health.retired.length} | ${flag(health.retired.length)} |`,
		`| Bindings to assets missing from the catalog | ${health.unknown.length} | ${flag(health.unknown.length)} |`,
		`| Custom builds without a Custom Build Reason | ${health.emptyCustomReasons.length} | ${flag(health.emptyCustomReasons.length)} |`,
		"",
	];
	const section = (title, rows) => {
		out.push(`## ${title}`, "");
		out.push(...(rows.length ? rows.map((row) => `- ${row}`) : ["_None._"]), "");
	};
	section("Assets without an owner", health.withoutOwner);
	section(`Stale assets (more than ${health.staleDays} days since release)`, health.stale.map((a) => `${a.id}: released ${a.releasedAt}, ${a.ageDays} days ago`));
	section("Bindings pinned to non-current versions", health.nonCurrent.map((b) => `${b.issue}: ${b.label} (catalog has ${b.current})`));
	section("Bindings to deprecated or removed assets", health.retired.map((b) => `${b.issue}: ${b.label} is ${b.status}${b.replacement ? `, use ${b.replacement}` : ""}`));
	section("Bindings to assets missing from the catalog", health.unknown.map((b) => `${b.issue}: ${b.label}`));
	section("Custom builds without a Custom Build Reason", health.emptyCustomReasons);
	out.push("Duplicate logic that a Forge asset already covers is not measured here: run `discover.mjs` on the custom builds and review the matches.", "");
	return out.join("\n");
}

async function loadWorkItems(specsDir) {
	let entries;
	try {
		entries = (await readdir(specsDir)).filter((name) => /^issue-\d+$/.test(name)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
	} catch {
		throw new ForgeError(`Specs directory not found: ${specsDir}`);
	}
	const items = [];
	for (const name of entries) {
		const file = join(specsDir, name, "think.md");
		try {
			if (!(await stat(file)).isFile()) continue;
		} catch {
			continue;
		}
		items.push({ issue: name, think: parseThink(await readFile(file, "utf-8")) });
	}
	return items;
}

const USAGE = "Usage: node forge-health.mjs --specs <specs dir> [--catalog <catalog.json>] [--stale-days 180] [--today YYYY-MM-DD] [--strict]";

export async function runHealth(args = process.argv.slice(2), env = process.env) {
	const opts = parseArgs(args, { values: ["--catalog", "--specs", "--stale-days", "--today"], booleans: ["--strict"] });
	if (opts.help) {
		console.log(`${USAGE}\n--strict exits 1 when any warning signal is raised.`);
		return 0;
	}
	const problem =
		opts.problems[0] ??
		(!opts.specs ? "--specs is required" : null) ??
		(opts.staleDays !== undefined && !/^[1-9]\d*$/.test(opts.staleDays) ? "--stale-days must be a positive integer" : null) ??
		(opts.today !== undefined && !isIsoDate(opts.today) ? "--today must be an ISO date (YYYY-MM-DD)" : null);
	if (problem) {
		console.error(`✗ ${problem}\n${USAGE}`);
		return 1;
	}

	try {
		const catalogPath = resolveCatalogPath(opts.catalog, env);
		const catalog = await loadCatalog(catalogPath);
		const items = await loadWorkItems(opts.specs);
		const health = computeHealth(catalog, items, { staleDays: opts.staleDays ? Number(opts.staleDays) : 180, today: opts.today });
		process.stdout.write(renderHealth(health, { catalogPath, specsDir: opts.specs }));
		const warnings = health.withoutOwner.length + health.stale.length + health.nonCurrent.length + health.retired.length + health.unknown.length + health.emptyCustomReasons.length;
		return opts.strict && warnings ? 1 : 0;
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
	runHealth().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
