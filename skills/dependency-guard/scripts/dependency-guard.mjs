#!/usr/bin/env node

/**
 * Dependency Guard: Mechanically prevents unauthorized, bloated, or banned dependencies.
 * Inspects package.json changes against git HEAD or enforces banned package lists.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_BANNED_PACKAGES = ["moment", "request", "left-pad"];

export function parseArgs(argv) {
	const options = {
		manifest: "package.json",
		useGit: false,
		allow: new Set(),
		banned: new Set(DEFAULT_BANNED_PACKAGES),
		json: false,
		cwd: process.cwd(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--manifest") {
			options.manifest = argv[++i];
		} else if (arg === "--git") {
			options.useGit = true;
		} else if (arg === "--allow") {
			const raw = argv[++i] || "";
			raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((pkg) => options.allow.add(pkg));
		} else if (arg === "--banned") {
			const raw = argv[++i] || "";
			raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((pkg) => options.banned.add(pkg));
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "--cwd") {
			options.cwd = resolve(argv[++i]);
		} else if (arg === "-h" || arg === "--help") {
			options.help = true;
		}
	}

	return options;
}

export function extractDeps(manifestObj) {
	const deps = new Map();
	if (!manifestObj || typeof manifestObj !== "object") return deps;

	const groups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
	for (const group of groups) {
		const section = manifestObj[group];
		if (section && typeof section === "object") {
			for (const [pkg, version] of Object.entries(section)) {
				deps.set(pkg, { group, version });
			}
		}
	}
	return deps;
}

export function evaluateDependencies({ currentManifest, baselineManifest = null, allowed = new Set(), banned = new Set() }) {
	const violations = [];
	const currentDeps = extractDeps(currentManifest);
	const baselineDeps = baselineManifest ? extractDeps(baselineManifest) : new Map();

	// 1. Check for banned packages
	for (const [pkg, info] of currentDeps.entries()) {
		if (banned.has(pkg)) {
			violations.push({
				type: "BANNED_DEPENDENCY_DETECTED",
				package: pkg,
				group: info.group,
				message: `Package "${pkg}" in ${info.group} is forbidden by policy.`,
			});
		}
	}

	// 2. Check for loose versions
	for (const [pkg, info] of currentDeps.entries()) {
		if (info.version === "*" || info.version === "latest") {
			violations.push({
				type: "LOOSE_VERSION_SPECIFIED",
				package: pkg,
				group: info.group,
				version: info.version,
				message: `Package "${pkg}" uses forbidden loose version "${info.version}". Use a specific semver range.`,
			});
		}
	}

	// 3. Check for newly introduced dependencies against baseline
	if (baselineManifest) {
		for (const [pkg, info] of currentDeps.entries()) {
			if (!baselineDeps.has(pkg)) {
				if (!allowed.has(pkg)) {
					violations.push({
						type: "UNAUTHORIZED_NEW_DEPENDENCY",
						package: pkg,
						group: info.group,
						version: info.version,
						message: `Unauthorized new package "${pkg}" added to ${info.group}. Agent is not permitted to add packages without explicit approval.`,
					});
				}
			}
		}
	}

	return {
		ok: violations.length === 0,
		violations,
		summary: {
			totalDependencies: currentDeps.size,
			newDependencies: baselineManifest ? Array.from(currentDeps.keys()).filter((k) => !baselineDeps.has(k)).length : 0,
			violationCount: violations.length,
		},
	};
}

export function formatReport(result, json = false) {
	if (json) {
		return JSON.stringify(result, null, 2);
	}

	if (result.ok) {
		return `✔ Dependency Guard Passed: ${result.summary.totalDependencies} dependencies checked, zero policy violations.`;
	}

	const lines = [];
	lines.push(`✖ Dependency Guard Failed: ${result.violations.length} violation(s) detected.`);
	lines.push("----------------------------------------");
	for (const v of result.violations) {
		lines.push(`• [${v.type}] ${v.message}`);
	}
	return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: dependency-guard [options]

Options:
  --manifest <path>   Path to package.json (default: package.json)
  --git               Compare against git HEAD baseline
  --allow <pkg1,pkg2> Comma-separated list of explicitly permitted new packages
  --banned <pkg1,pkg2> Comma-separated list of forbidden packages
  --json              Output structured JSON report
  --cwd <path>        Working directory
  -h, --help          Show this help message
`);
			return 0;
		}

		const manifestPath = resolve(options.cwd, options.manifest);
		if (!existsSync(manifestPath)) {
			throw new Error(`Manifest file not found: ${manifestPath}`);
		}

		const currentManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		let baselineManifest = null;

		if (options.useGit) {
			const res = spawnSync(`git show HEAD:${options.manifest}`, {
				shell: true,
				cwd: options.cwd,
				encoding: "utf-8",
			});
			if (res.status === 0 && res.stdout.trim()) {
				try {
					baselineManifest = JSON.parse(res.stdout);
				} catch {
					// HEAD manifest was unparseable or missing
				}
			}
		}

		const result = evaluateDependencies({
			currentManifest,
			baselineManifest,
			allowed: options.allow,
			banned: options.banned,
		});

		const output = formatReport(result, options.json);

		if (result.ok) {
			console.log(output);
			return 0;
		} else {
			console.error(output);
			return 1;
		}
	} catch (err) {
		console.error(`Dependency Guard Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
