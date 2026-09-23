#!/usr/bin/env node

/**
 * Task Gate: Executable completion verification pipeline with structured diagnostics.
 * Evaluates configured stages (lint, types, narrowest tests, contracts) in sequence.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function parseArgs(argv) {
	const options = {
		config: null,
		stages: [],
		failFast: true,
		json: false,
		cwd: process.cwd(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--config") {
			options.config = argv[++i];
		} else if (arg === "--stage") {
			const raw = argv[++i];
			if (!raw || !raw.includes(":")) {
				throw new Error('Invalid --stage format. Expected "name:command"');
			}
			const colonIdx = raw.indexOf(":");
			options.stages.push({
				name: raw.substring(0, colonIdx).trim(),
				command: raw.substring(colonIdx + 1).trim(),
			});
		} else if (arg === "--fail-fast") {
			options.failFast = true;
		} else if (arg === "--no-fail-fast") {
			options.failFast = false;
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

export function loadConfig(configPath, cwd = process.cwd()) {
	const absolutePath = resolve(cwd, configPath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Gate configuration file not found: ${absolutePath}`);
	}
	const content = readFileSync(absolutePath, "utf-8");
	const parsed = JSON.parse(content);
	if (!Array.isArray(parsed.stages)) {
		throw new Error('Gate configuration must contain an array of "stages"');
	}
	return parsed;
}

export function extractSnippet(output, maxLines = 10) {
	if (!output) return "";
	const lines = output.trim().split("\n");
	if (lines.length <= maxLines) return lines.join("\n");
	return lines.slice(-maxLines).join("\n");
}

export function executeStage(stage, cwd = process.cwd()) {
	const startTime = Date.now();
	const res = spawnSync(stage.command, {
		shell: true,
		cwd,
		encoding: "utf-8",
		env: process.env,
	});
	const durationMs = Date.now() - startTime;
	const exitCode = res.status ?? (res.error ? 1 : 0);
	const stdout = res.stdout || "";
	const stderr = res.stderr || "";

	const passed = exitCode === 0;
	const output = stderr.trim() ? stderr : stdout;

	return {
		name: stage.name,
		command: stage.command,
		passed,
		exitCode,
		durationMs,
		stdout,
		stderr,
		errorSnippet: passed ? null : extractSnippet(output, 8),
	};
}

export function runGate(config, cwd = process.cwd()) {
	const name = config.name || "task-gate";
	const failFast = config.failFast !== false;
	const results = [];
	let failedStage = null;
	const overallStart = Date.now();

	for (const stage of config.stages) {
		const res = executeStage(stage, cwd);
		results.push({
			name: res.name,
			command: res.command,
			status: res.passed ? "passed" : "failed",
			exitCode: res.exitCode,
			durationMs: res.durationMs,
			errorSnippet: res.errorSnippet,
		});

		if (!res.passed) {
			failedStage = {
				name: res.name,
				command: res.command,
				exitCode: res.exitCode,
				errorSnippet: res.errorSnippet,
			};
			if (failFast) break;
		}
	}

	const overallDuration = Date.now() - overallStart;
	const ok = failedStage === null;

	return {
		ok,
		name,
		durationMs: overallDuration,
		failedStage,
		stages: results,
	};
}

export function formatReport(result, json = false) {
	if (json) {
		return JSON.stringify(result, null, 2);
	}

	const lines = [];
	lines.push(`Task Gate: ${result.name} (${result.ok ? "PASSED" : "FAILED"})`);
	lines.push(`Total Duration: ${result.durationMs}ms`);
	lines.push("----------------------------------------");

	for (const s of result.stages) {
		const icon = s.status === "passed" ? "✔" : "✖";
		lines.push(`${icon} [${s.name}] ${s.command} (${s.durationMs}ms)`);
		if (s.status === "failed" && s.errorSnippet) {
			lines.push("  Decisive Failure Snippet:");
			const indented = s.errorSnippet
				.split("\n")
				.map((l) => `    ${l}`)
				.join("\n");
			lines.push(indented);
		}
	}

	if (!result.ok && result.failedStage) {
		lines.push("----------------------------------------");
		lines.push(`REMEDIATION REQUIRED: Stage "${result.failedStage.name}" failed.`);
	}

	return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: task-gate [options]

Options:
  --config <path>      Path to JSON gate configuration file
  --stage <name:cmd>   Add an ad-hoc stage (can be repeated)
  --fail-fast          Halt on first stage failure (default: true)
  --no-fail-fast       Run all stages even if earlier ones fail
  --json               Output structured JSON diagnostics
  --cwd <path>         Working directory for stage commands
  -h, --help           Show this help message
`);
			return 0;
		}

		let stages = [...options.stages];
		let gateName = "ad-hoc-gate";
		let failFast = options.failFast;

		if (options.config) {
			const config = loadConfig(options.config, options.cwd);
			if (config.name) gateName = config.name;
			if (config.failFast !== undefined) failFast = config.failFast;
			if (Array.isArray(config.stages)) {
				stages = [...config.stages, ...stages];
			}
		}

		if (stages.length === 0) {
			throw new Error("No stages configured. Specify --config or at least one --stage.");
		}

		const result = runGate({ name: gateName, failFast, stages }, options.cwd);
		const output = formatReport(result, options.json);

		if (result.ok) {
			console.log(output);
			return 0;
		} else {
			console.error(output);
			return 1;
		}
	} catch (err) {
		console.error(`Task Gate Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
