#!/usr/bin/env node

/**
 * Rollback & Roundtrip Probe: Mechanically certifies database migration and state reversibility.
 * Evaluates: Forward -> Rollback -> Forward (Re-apply) -> Verify.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function parseArgs(argv) {
	const options = {
		forward: null,
		rollback: null,
		verify: null,
		json: false,
		cwd: process.cwd(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--forward") {
			options.forward = argv[++i];
		} else if (arg === "--rollback") {
			options.rollback = argv[++i];
		} else if (arg === "--verify") {
			options.verify = argv[++i];
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

export function executeStep(name, command, cwd = process.cwd()) {
	const start = Date.now();
	const res = spawnSync(command, {
		shell: true,
		cwd,
		encoding: "utf-8",
		env: process.env,
	});
	const durationMs = Date.now() - start;
	const exitCode = res.status ?? (res.error ? 1 : 0);
	const stdout = res.stdout || "";
	const stderr = res.stderr || "";
	const passed = exitCode === 0;

	return {
		step: name,
		command,
		passed,
		exitCode,
		durationMs,
		snippet: passed ? null : (stderr.trim() || stdout.trim()).split("\n").slice(-8).join("\n"),
	};
}

export function evaluateRollbackProbe({ forward, rollback, verify = null, cwd = process.cwd() }) {
	if (!forward) throw new Error("Missing required --forward command");
	if (!rollback) throw new Error("Missing required --rollback command");

	const steps = [];
	const totalStart = Date.now();

	// Step 1: Forward Migration
	const forward1 = executeStep("1_FORWARD", forward, cwd);
	steps.push(forward1);
	if (!forward1.passed) {
		return {
			ok: false,
			failedStep: forward1,
			steps,
			durationMs: Date.now() - totalStart,
			message: `Initial forward migration failed (exit ${forward1.exitCode}).`,
		};
	}

	// Step 2: Rollback Migration
	const rollbackStep = executeStep("2_ROLLBACK", rollback, cwd);
	steps.push(rollbackStep);
	if (!rollbackStep.passed) {
		return {
			ok: false,
			failedStep: rollbackStep,
			steps,
			durationMs: Date.now() - totalStart,
			message: `Rollback failed (exit ${rollbackStep.exitCode}). The migration cannot be cleanly reversed!`,
		};
	}

	// Step 3: Re-apply Forward Migration (Idempotency)
	const forward2 = executeStep("3_REAPPLY_FORWARD", forward, cwd);
	steps.push(forward2);
	if (!forward2.passed) {
		return {
			ok: false,
			failedStep: forward2,
			steps,
			durationMs: Date.now() - totalStart,
			message: `Re-applying forward migration failed after rollback (exit ${forward2.exitCode}). Rollback left dirty state!`,
		};
	}

	// Step 4: Optional Verification Assertion
	if (verify) {
		const verifyStep = executeStep("4_VERIFY", verify, cwd);
		steps.push(verifyStep);
		if (!verifyStep.passed) {
			return {
				ok: false,
				failedStep: verifyStep,
				steps,
				durationMs: Date.now() - totalStart,
				message: `Verification check failed following re-apply (exit ${verifyStep.exitCode}).`,
			};
		}
	}

	return {
		ok: true,
		steps,
		durationMs: Date.now() - totalStart,
		message: "Rollback and roundtrip lifecycle certified: Forward -> Rollback -> Re-apply succeeded.",
	};
}

export function formatReport(result, json = false) {
	if (json) {
		return JSON.stringify(result, null, 2);
	}

	const lines = [];
	lines.push(`Rollback Probe: ${result.ok ? "CERTIFIED" : "FAILED"} (${result.durationMs}ms)`);
	lines.push("----------------------------------------");
	for (const s of result.steps) {
		const icon = s.passed ? "✔" : "✖";
		lines.push(`${icon} [${s.step}] ${s.command} (${s.durationMs}ms)`);
		if (!s.passed && s.snippet) {
			lines.push("  Decisive Failure Snippet:");
			lines.push(
				s.snippet
					.split("\n")
					.map((l) => `    ${l}`)
					.join("\n")
			);
		}
	}

	if (!result.ok) {
		lines.push("----------------------------------------");
		lines.push(`ERROR: ${result.message}`);
	}

	return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: rollback-probe --forward <cmd> --rollback <cmd> [options]

Options:
  --forward <cmd>     Command to execute forward migration
  --rollback <cmd>    Command to execute rollback
  --verify <cmd>      Optional verification command after re-apply
  --json              Output structured JSON report
  --cwd <path>        Working directory
  -h, --help          Show this help message
`);
			return 0;
		}

		const result = evaluateRollbackProbe({
			forward: options.forward,
			rollback: options.rollback,
			verify: options.verify,
			cwd: options.cwd,
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
		console.error(`Rollback Probe Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
