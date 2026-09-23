#!/usr/bin/env node

/**
 * Secret Guard: Mechanically prevents hardcoded secrets and credentials from entering git diffs.
 * Scans added lines or target files for keys, private keys, and high-risk assignments.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const SECRET_RULES = [
	{
		id: "AWS_ACCESS_KEY",
		name: "AWS Access Key ID",
		regex: /AKIA[0-9A-Z]{16}/,
	},
	{
		id: "PRIVATE_KEY_BLOCK",
		name: "Cryptographic Private Key Block",
		regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/,
	},
	{
		id: "GITHUB_TOKEN",
		name: "GitHub Personal Access Token",
		regex: /ghp_[a-zA-Z0-9]{36}/,
	},
	{
		id: "SLACK_TOKEN",
		name: "Slack API Token",
		regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/,
	},
	{
		id: "HARDCODED_CREDENTIAL_ASSIGNMENT",
		name: "High-Entropy Credential Assignment",
		regex: /(?:api_?key|auth_?token|client_?secret|jwt_?secret|password)\s*[:=]\s*["']([a-zA-Z0-9_.\-]{16,})["']/i,
	},
];

export function parseArgs(argv) {
	const options = {
		useGit: false,
		files: [],
		text: null,
		json: false,
		cwd: process.cwd(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--git") {
			options.useGit = true;
		} else if (arg === "--file") {
			options.files.push(argv[++i]);
		} else if (arg === "--text") {
			options.text = argv[++i];
		} else if (arg === "--cwd") {
			options.cwd = resolve(argv[++i]);
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "-h" || arg === "--help") {
			options.help = true;
		}
	}

	return options;
}

export function maskSecret(str) {
	if (!str || str.length <= 6) return "******";
	return str.substring(0, 4) + "*".repeat(Math.max(4, str.length - 8)) + str.substring(str.length - 4);
}

export function scanLines(linesWithContext) {
	const violations = [];

	for (const { file, lineNum, content } of linesWithContext) {
		for (const rule of SECRET_RULES) {
			const match = content.match(rule.regex);
			if (match) {
				const secretSnippet = match[1] || match[0];
				violations.push({
					ruleId: rule.id,
					ruleName: rule.name,
					file,
					lineNum,
					maskedSnippet: maskSecret(secretSnippet),
					message: `Detected ${rule.name} in "${file}" at line ${lineNum}`,
				});
				break;
			}
		}
	}

	return violations;
}

export function scanGitDiff(cwd = process.cwd()) {
	const res = spawnSync("git diff -U0 HEAD", {
		shell: true,
		cwd,
		encoding: "utf-8",
	});

	if (res.status !== 0) {
		throw new Error(`git diff failed: ${res.stderr || "Unknown error"}`);
	}

	const lines = res.stdout.split("\n");
	const targets = [];
	let currentFile = "unknown";
	let currentLine = 0;

	for (const line of lines) {
		if (line.startsWith("+++ b/")) {
			currentFile = line.substring(6);
		} else if (line.startsWith("@@")) {
			const m = line.match(/\+([0-9]+)/);
			if (m) currentLine = parseInt(m[1], 10);
		} else if (line.startsWith("+") && !line.startsWith("+++")) {
			targets.push({
				file: currentFile,
				lineNum: currentLine++,
				content: line.substring(1),
			});
		}
	}

	return targets;
}

export function formatReport(result, json = false) {
	if (json) {
		return JSON.stringify(result, null, 2);
	}

	if (result.ok) {
		return `✔ Secret Guard Passed: ${result.summary.linesChecked} line(s) scanned, 0 secrets detected.`;
	}

	const lines = [];
	lines.push(`✖ Secret Guard Failed: ${result.violations.length} secret(s) detected!`);
	lines.push("----------------------------------------");
	for (const v of result.violations) {
		lines.push(`• [${v.ruleId}] ${v.message} (${v.maskedSnippet})`);
	}
	lines.push("----------------------------------------");
	lines.push("REMEDIATION: Replace hardcoded secret with an environment variable or test mock.");
	return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: secret-guard [options]

Options:
  --git         Scan lines added in git diff against HEAD
  --file <path> Scan a specific file (can be repeated)
  --text <str>  Scan a single raw string
  --json        Output structured JSON report
  --cwd <path>  Working directory
  -h, --help    Show this help message
`);
			return 0;
		}

		const targets = [];

		if (options.useGit) {
			targets.push(...scanGitDiff(options.cwd));
		}

		if (options.files.length > 0) {
			for (const f of options.files) {
				const abs = resolve(options.cwd, f);
				if (!existsSync(abs)) {
					throw new Error(`File not found: ${abs}`);
				}
				const content = readFileSync(abs, "utf-8");
				content.split("\n").forEach((line, idx) => {
					targets.push({ file: f, lineNum: idx + 1, content: line });
				});
			}
		}

		if (options.text !== null) {
			targets.push({ file: "<raw-text>", lineNum: 1, content: options.text });
		}

		if (targets.length === 0 && !options.useGit) {
			throw new Error("No scan targets specified. Use --git, --file, or --text.");
		}

		const violations = scanLines(targets);
		const result = {
			ok: violations.length === 0,
			violations,
			summary: {
				linesChecked: targets.length,
				violationCount: violations.length,
			},
		};

		const output = formatReport(result, options.json);

		if (result.ok) {
			console.log(output);
			return 0;
		} else {
			console.error(output);
			return 1;
		}
	} catch (err) {
		console.error(`Secret Guard Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
