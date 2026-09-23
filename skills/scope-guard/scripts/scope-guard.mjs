#!/usr/bin/env node

/**
 * Scope Guard: Deterministic Blast-Radius and Churn Validator
 * 
 * Verifies that code modifications stay strictly within authorized boundaries,
 * avoiding accidental contamination of sensitive files (lockfiles, env configs)
 * and preventing unrequested mass refactoring (diff churn).
 */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export class ScopeGuardError extends Error {}

/**
 * Matches a relative file path against a pattern (glob, prefix, or exact match).
 */
export function matchPath(filePath, pattern) {
	const cleanFile = filePath.replace(/^\.\//, "").replace(/\\/g, "/");
	const cleanPattern = pattern.replace(/^\.\//, "").replace(/\\/g, "/");

	if (cleanFile === cleanPattern) return true;

	// Prefix matching if pattern ends with / or is a directory name without wildcards
	if (!cleanPattern.includes("*") && !cleanPattern.includes("?")) {
		if (cleanPattern.endsWith("/")) {
			return cleanFile.startsWith(cleanPattern);
		}
		if (cleanFile.startsWith(`${cleanPattern}/`)) {
			return true;
		}
	}

	// Glob matching
	const regexPattern = cleanPattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "___GLOBSTAR___")
		.replace(/\*/g, "[^/]*")
		.replace(/\?/g, "[^/]")
		.replace(/___GLOBSTAR___/g, ".*");

	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(cleanFile);
}

/**
 * Parses git diff --numstat output into structured file statistics.
 */
export function parseNumstat(output) {
	const results = [];
	if (!output || !output.trim()) return results;

	const lines = output.trim().split("\n");
	for (const line of lines) {
		const parts = line.split("\t");
		if (parts.length < 3) continue;

		const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
		const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
		let filePath = parts.slice(2).join("\t").trim();

		// Handle git rename syntax e.g. "path/{old => new}/file" or "old => new"
		if (filePath.includes(" => ")) {
			if (filePath.includes("{") && filePath.includes("}")) {
				filePath = filePath.replace(/\{[^{}]*=>\s*([^{}]*)\}/, "$1");
			} else {
				filePath = filePath.replace(/^.*?=>\s*/, "");
			}
		}

		results.push({
			file: filePath.replace(/^\.\//, "").replace(/\\/g, "/"),
			additions,
			deletions,
		});
	}
	return results;
}

/**
 * Evaluates file changes against allowed paths, forbidden paths, and churn limits.
 */
export function evaluateScope({
	files = [],
	diffStats = [],
	allowedPaths = [],
	forbiddenPaths = [],
	maxAdditions,
	maxDeletions,
}) {
	const violations = [];
	const allFiles = new Set([
		...files.map((f) => f.replace(/^\.\//, "").replace(/\\/g, "/")),
		...diffStats.map((s) => s.file),
	]);

	for (const file of allFiles) {
		// Check forbidden paths first (highest precedence)
		for (const pattern of forbiddenPaths) {
			if (matchPath(file, pattern)) {
				violations.push({
					type: "FORBIDDEN_PATH",
					file,
					pattern,
					message: `File "${file}" matches forbidden pattern "${pattern}"`,
				});
				break;
			}
		}

		// Check allowed paths if any are specified
		if (allowedPaths.length > 0) {
			const isAllowed = allowedPaths.some((pattern) => matchPath(file, pattern));
			if (!isAllowed) {
				violations.push({
					type: "OUT_OF_SCOPE",
					file,
					allowedPaths,
					message: `File "${file}" is outside allowed scope(s): ${allowedPaths.join(", ")}`,
				});
			}
		}
	}

	// Calculate churn
	let totalAdditions = 0;
	let totalDeletions = 0;
	for (const stat of diffStats) {
		totalAdditions += stat.additions;
		totalDeletions += stat.deletions;
	}

	if (typeof maxAdditions === "number" && totalAdditions > maxAdditions) {
		violations.push({
			type: "EXCESSIVE_ADDITIONS",
			additions: totalAdditions,
			limit: maxAdditions,
			message: `Diff churn limit exceeded: added ${totalAdditions} lines (max allowed: ${maxAdditions})`,
		});
	}

	if (typeof maxDeletions === "number" && totalDeletions > maxDeletions) {
		violations.push({
			type: "EXCESSIVE_DELETIONS",
			deletions: totalDeletions,
			limit: maxDeletions,
			message: `Diff churn limit exceeded: deleted ${totalDeletions} lines (max allowed: ${maxDeletions})`,
		});
	}

	return {
		ok: violations.length === 0,
		violations,
		summary: {
			filesChecked: allFiles.size,
			totalAdditions,
			totalDeletions,
		},
	};
}

/**
 * Inspects a live git working tree.
 */
export function inspectGit({ cwd = process.cwd(), stagedOnly = false } = {}) {
	try {
		const statusCmd = stagedOnly ? "git diff --name-only --cached" : "git status --porcelain";
		const statusOutput = execSync(statusCmd, { cwd, encoding: "utf8" });

		const files = [];
		for (const line of statusOutput.trim().split("\n")) {
			if (!line.trim()) continue;
			if (stagedOnly) {
				files.push(line.trim());
			} else {
				// Porcelain format: XY PATH (or XY "PATH" or XY PATH1 -> PATH2)
				const trimmed = line.slice(3).trim();
				if (trimmed.includes(" -> ")) {
					files.push(trimmed.split(" -> ")[1].trim().replace(/^"|"$/g, ""));
				} else {
					files.push(trimmed.replace(/^"|"$/g, ""));
				}
			}
		}

		const diffCmd = stagedOnly ? "git diff --cached --numstat" : "git diff HEAD --numstat";
		let diffOutput = "";
		try {
			diffOutput = execSync(diffCmd, { cwd, encoding: "utf8" });
		} catch {
			// HEAD might not exist in a brand new repository
			diffOutput = execSync("git diff --numstat", { cwd, encoding: "utf8" });
		}

		const diffStats = parseNumstat(diffOutput);
		return { files, diffStats };
	} catch (error) {
		throw new ScopeGuardError(`Failed to inspect git repository: ${error.message}`);
	}
}

/**
 * CLI Entrypoint
 */
export async function main(argv = process.argv.slice(2)) {
	const allowedPaths = [];
	const forbiddenPaths = [
		"*.lock",
		"*-lock.json",
		"pnpm-lock.yaml",
		"yarn.lock",
		".env*",
		"**/.env*",
	];
	let maxAdditions;
	let maxDeletions;
	let isJson = false;
	let useGit = false;
	const explicitFiles = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--allowed" || arg === "--scope") {
			allowedPaths.push(argv[++i]);
		} else if (arg === "--forbidden") {
			forbiddenPaths.push(argv[++i]);
		} else if (arg === "--max-additions") {
			maxAdditions = Number.parseInt(argv[++i], 10);
		} else if (arg === "--max-deletions") {
			maxDeletions = Number.parseInt(argv[++i], 10);
		} else if (arg === "--git") {
			useGit = true;
		} else if (arg === "--file") {
			explicitFiles.push(argv[++i]);
		} else if (arg === "--json") {
			isJson = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Usage: node scope-guard.mjs [options]

Deterministic blast-radius and churn guard.

Options:
  --scope, --allowed <glob>   Permitted file path pattern (repeatable)
  --forbidden <glob>          Forbidden file path pattern (repeatable)
  --max-additions <n>         Maximum total lines added allowed
  --max-deletions <n>         Maximum total lines deleted allowed
  --git                       Check current git status and diff
  --file <path>               Explicit file to check (repeatable)
  --json                      Emit output as JSON
  --help, -h                  Show this help message
`);
			return 0;
		}
	}

	let files = [...explicitFiles];
	let diffStats = [];

	if (useGit) {
		const gitResult = inspectGit();
		files = [...new Set([...files, ...gitResult.files])];
		diffStats = gitResult.diffStats;
	}

	const result = evaluateScope({
		files,
		diffStats,
		allowedPaths,
		forbiddenPaths,
		maxAdditions,
		maxDeletions,
	});

	if (isJson) {
		console.log(JSON.stringify(result, null, 2));
		return result.ok ? 0 : 1;
	}

	if (result.ok) {
		console.log(`[SCOPE-GUARD:PASS] All changes (${result.summary.filesChecked} files, +${result.summary.totalAdditions}/-${result.summary.totalDeletions}) are within scope.`);
		return 0;
	}

	console.error("[SCOPE-GUARD:FAIL] Blast-radius or churn violations detected:");
	for (const v of result.violations) {
		console.error(` - [${v.type}] ${v.message}`);
	}
	return 1;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
	main().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(`[SCOPE-GUARD:ERROR] ${err.message}`);
		process.exit(2);
	});
}
