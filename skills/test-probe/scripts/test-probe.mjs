#!/usr/bin/env node

/**
 * Anti-Tautology Test Probe: Mechanically asserts that generated tests are falsifiable.
 * Temporarily reverts source files to prove that tests fail when the fix is absent.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

export function parseArgs(argv) {
	const options = {
		testCmd: null,
		sources: [],
		json: false,
		cwd: process.cwd(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--test-cmd") {
			options.testCmd = argv[++i];
		} else if (arg === "--source") {
			options.sources.push(argv[++i]);
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

export function runShell(command, cwd = process.cwd()) {
	const res = spawnSync(command, {
		shell: true,
		cwd,
		encoding: "utf-8",
		env: process.env,
	});
	return {
		exitCode: res.status ?? (res.error ? 1 : 0),
		stdout: res.stdout || "",
		stderr: res.stderr || "",
	};
}

export function getHeadContent(filePath, cwd = process.cwd()) {
	const rel = relative(cwd, filePath).replace(/\\/g, "/");
	const res = runShell(`git show "HEAD:${rel}"`, cwd);
	if (res.exitCode !== 0) {
		throw new Error(`Unable to fetch HEAD version of "${rel}". Ensure file is tracked in git.`);
	}
	return res.stdout;
}

export function evaluateProbe({ testCmd, sources, cwd = process.cwd(), getUnpatchedContent = getHeadContent }) {
	if (!testCmd) throw new Error("Missing required --test-cmd");
	if (!sources || sources.length === 0) throw new Error("At least one --source file must be specified");

	const backups = new Map();

	// Step 1: Backup current working files and prepare unpatched contents
	for (const src of sources) {
		const abs = resolve(cwd, src);
		if (!existsSync(abs)) {
			throw new Error(`Source file does not exist: ${abs}`);
		}
		const currentContent = readFileSync(abs, "utf-8");
		const unpatchedContent = getUnpatchedContent(abs, cwd);
		backups.set(abs, { current: currentContent, unpatched: unpatchedContent });
	}

	try {
		// Step 2: Verify current patched state passes
		const patchedRun = runShell(testCmd, cwd);
		if (patchedRun.exitCode !== 0) {
			return {
				ok: false,
				type: "BASE_TEST_FAILED",
				message: `Test command failed on current patched state (exit ${patchedRun.exitCode}). Fix test or code before running probe.`,
				details: { patchedExitCode: patchedRun.exitCode },
			};
		}

		// Step 3: Unpatch source files
		for (const [abs, data] of backups.entries()) {
			writeFileSync(abs, data.unpatched, "utf-8");
		}

		// Step 4: Run test on unpatched code (MUST FAIL)
		const unpatchedRun = runShell(testCmd, cwd);

		if (unpatchedRun.exitCode === 0) {
			// Tautology! The test passed even without the fix!
			return {
				ok: false,
				type: "TAUTOLOGICAL_TEST_DETECTED",
				message: "Tautological test detected! The test suite PASSED even without the bugfix applied. The test does not genuinely assert the fix.",
				details: {
					unpatchedExitCode: unpatchedRun.exitCode,
					sources: sources,
				},
			};
		}

		// If we reached here, the unpatched test failed as expected!
		return {
			ok: true,
			type: "FALSIFIABLE_TEST_VERIFIED",
			message: "Test is confirmed falsifiable: it failed cleanly without the patch and passed with the patch.",
			details: {
				patchedExitCode: 0,
				unpatchedExitCode: unpatchedRun.exitCode,
			},
		};
	} finally {
		// Always restore current working file contents
		for (const [abs, data] of backups.entries()) {
			writeFileSync(abs, data.current, "utf-8");
		}
	}
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: test-probe --test-cmd <cmd> --source <path> [options]

Options:
  --test-cmd <cmd>    Test command to execute
  --source <path>     Source file to invert (can be repeated)
  --json              Output structured JSON result
  --cwd <path>        Working directory
  -h, --help          Show this help message
`);
			return 0;
		}

		const result = evaluateProbe({
			testCmd: options.testCmd,
			sources: options.sources,
			cwd: options.cwd,
		});

		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			if (result.ok) {
				console.log(`✔ Anti-Tautology Probe: ${result.message}`);
			} else {
				console.error(`✖ Anti-Tautology Probe Failed: ${result.message}`);
			}
		}

		return result.ok ? 0 : 1;
	} catch (err) {
		console.error(`Test Probe Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
