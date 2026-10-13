#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ValidationError, parseRelease } from "./validate-release.mjs";

export const EXIT = { promote: 0, rollback: 1, hold: 2 };
export const STAGING_CHECKS = ["smoke_failures", "qa_failures"];
const BROADEST_FIRST = ["Redeploy previous artifact", "Traffic shift back", "Feature flag off"];

function fail(message) {
	throw new ValidationError(message);
}

export function withinLimit(value, comparator, limit) {
	switch (comparator) {
		case "<":
			return value < limit;
		case "<=":
			return value <= limit;
		case ">":
			return value > limit;
		case ">=":
			return value >= limit;
		default:
			return fail(`Unknown comparator "${comparator}"`);
	}
}

/** Checks the shape of a metrics.json observation. */
export function parseObservation(raw, stageName) {
	let data;
	try {
		data = typeof raw === "string" ? JSON.parse(raw) : raw;
	} catch (err) {
		return fail(`metrics file is not valid JSON: ${err.message}`);
	}
	if (!data || typeof data !== "object" || Array.isArray(data)) fail("metrics file must be a JSON object");
	if (data.stage !== stageName) {
		fail(
			data.stage === undefined
				? `metrics file must name its stage ("stage": "${stageName}"), so another stage's metrics cannot promote this one`
				: `metrics file is for stage "${data.stage}", not "${stageName}"`,
		);
	}
	if (typeof data.observedMinutes !== "number" || !Number.isFinite(data.observedMinutes) || data.observedMinutes < 0) {
		fail('metrics file needs a non-negative number "observedMinutes"');
	}
	if (!data.metrics || typeof data.metrics !== "object" || Array.isArray(data.metrics)) fail('metrics file needs a "metrics" object');
	return { observedMinutes: data.observedMinutes, metrics: data.metrics };
}

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Deterministic rollout decision. Order of precedence: any breach rolls back, then anything unproven holds, else promote.
 * @param {ReturnType<typeof parseRelease>} release
 * @param {string} stageName
 * @param {{observedMinutes: number, metrics: Record<string, unknown>}} observation
 */
export function evaluateRollout(release, stageName, observation) {
	const stage = release.stages.find((s) => s.name === stageName);
	if (!stage) {
		fail(`stage "${stageName}" is not declared in the release (declared: ${release.stages.map((s) => s.name).join(", ")})`);
	}

	const breaches = [];
	const holds = [];
	const isStaging = stage.name === "staging";

	if (isStaging) {
		for (const name of STAGING_CHECKS) {
			const value = observation.metrics[name];
			if (!isNumber(value) || value < 0) holds.push(`missing or invalid ${name}: smoke and QA results (counts of 0 or more) are required before leaving staging`);
			else if (value > 0) breaches.push({ reason: `${name} is ${value}, must be 0`, rollback: null });
		}
	} else {
		for (const t of release.thresholds) {
			const value = observation.metrics[t.metric];
			if (!isNumber(value)) {
				holds.push(`missing or non-numeric metric ${t.metric} (${t.kind}): cannot prove the threshold`);
			} else if (!withinLimit(value, t.comparator, t.limit)) {
				breaches.push({
					reason: `${t.metric} ${value} breaches ${t.kind} threshold (must be ${t.comparator} ${t.limit}); rollback: ${t.rollback}`,
					rollback: t.rollback,
				});
			}
		}
	}

	if (breaches.length) {
		const mechanisms = breaches.map((b) => b.rollback).filter(Boolean);
		const rollbackWith = BROADEST_FIRST.find((m) => mechanisms.includes(m)) ?? null;
		const reasons = breaches.map((b) => b.reason);
		if (isStaging) reasons.push("nothing is exposed in production: stop the release and fix forward in a new change");
		return { decision: "rollback", stage: stage.name, reasons, rollbackWith };
	}

	if (observation.observedMinutes < stage.windowMinutes) {
		holds.push(`watch window not complete: observed ${observation.observedMinutes} of ${stage.windowMinutes} minutes`);
	}
	if (holds.length) return { decision: "hold", stage: stage.name, reasons: holds, rollbackWith: null };

	return {
		decision: "promote",
		stage: stage.name,
		reasons: [`all thresholds inside limits for the full ${stage.windowMinutes} minute window`],
		rollbackWith: null,
	};
}

function parseArgs(args) {
	const parsed = { release: null, stage: null, metrics: null, listStages: false };
	const valueFlags = { "--release": "release", "--stage": "stage", "--metrics": "metrics" };
	for (let i = 0; i < args.length; i++) {
		const key = valueFlags[args[i]];
		if (key) {
			const next = args[++i];
			if (!next || next.startsWith("--")) parsed.error = `${args[i - 1]} needs a value`;
			else parsed[key] = next;
		} else if (args[i] === "--list-stages") parsed.listStages = true;
		else if (args[i] === "--help" || args[i] === "-h") parsed.help = true;
		else parsed.error = `Unknown argument: ${args[i]}`;
	}
	return parsed;
}

const USAGE = `Usage:
  node evaluate-rollout.mjs --release <release.md> --stage <stage-name> --metrics <metrics.json>
  node evaluate-rollout.mjs --release <release.md> --list-stages
Prints {"decision","stage","reasons","rollbackWith"} as JSON. No AI is involved.
Exit codes: 0 promote, 2 hold, 1 rollback or error.
--list-stages prints the production stage names, one per line.`;

export async function runEvaluate(args = process.argv.slice(2)) {
	const opts = parseArgs(args);
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	if (opts.error) {
		console.error(`✗ [evaluate-rollout] ${opts.error}`);
		return 1;
	}
	if (!opts.release || (!opts.listStages && (!opts.stage || !opts.metrics))) {
		console.error(USAGE);
		return 1;
	}

	try {
		const release = parseRelease(await readFile(opts.release, "utf-8"), opts.release);
		if (opts.listStages) {
			release.stages.filter((s) => s.name !== "staging").forEach((s) => console.log(s.name));
			return 0;
		}
		const observation = parseObservation(await readFile(opts.metrics, "utf-8"), opts.stage);
		const result = evaluateRollout(release, opts.stage, observation);
		console.log(JSON.stringify(result, null, 2));
		return EXIT[result.decision];
	} catch (err) {
		console.error(`✗ [evaluate-rollout] ${err.message}`);
		return 1;
	}
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
	runEvaluate().then((code) => {
		if (code !== 0) process.exit(code);
	}).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
