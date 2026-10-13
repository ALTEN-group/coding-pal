import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_WEIGHTS, rankItems, renderRanking, resolveWeights, runRanker, scoreItem } from "./rank-backlog.mjs";
import { ValidationError, parseTriage } from "./validate-triage.mjs";
import { validTriage } from "./triage-fixture.mjs";

function item(issue, { customer = 4, business = "Pending PO", effort = 3, risk = 2, confidence = "High", proposed = "todo", final = "Pending" } = {}) {
	const md = validTriage
		.replace("| Customer value | 4 |", `| Customer value | ${customer} |`)
		.replace("| Business value | Pending PO |", `| Business value | ${business} |`)
		.replace("| Effort | 3 |", `| Effort | ${effort} |`)
		.replace("| Risk | 2 |", `| Risk | ${risk} |`)
		.replace("| Confidence | High |", `| Confidence | ${confidence} |`)
		.replace("- **Proposed:** todo", `- **Proposed:** ${proposed}`)
		.replace("- **Final (PO):** Pending", `- **Final (PO):** ${final}`);
	return { issue, md, triage: parseTriage(md) };
}

test("scores with default weights and confidence", () => {
	const t = item("issue-1", { customer: 4, business: "4", effort: 2, risk: 2, confidence: "Medium" }).triage;
	assert.equal(scoreItem(t.scores, DEFAULT_WEIGHTS), 1.5);
});

test("applies strategic weights and validates them", () => {
	const weights = resolveWeights({ businessValue: 2, confidence: { Low: 0.25 } });
	assert.equal(weights.confidence.Low, 0.25);
	assert.equal(weights.confidence.High, 1);
	const t = item("issue-1", { customer: 2, business: "5", effort: 1, risk: 1 }).triage;
	assert.equal(scoreItem(t.scores, weights), 6);
	assert.throws(() => resolveWeights({ effort: 0 }), ValidationError);
	assert.throws(() => resolveWeights({ confidence: { High: 2 } }), ValidationError);
	assert.throws(() => resolveWeights({ custmerValue: 3 }), /unknown weights key/);
	assert.throws(() => resolveWeights({ confidence: { Mid: 0.5 } }), /unknown weights.confidence level/);
	assert.throws(() => resolveWeights({ confidence: null }), ValidationError);
	assert.throws(() => resolveWeights(null), /JSON object/);
	assert.throws(() => resolveWeights([]), /JSON object/);
});

test("orders by score, separates parked and unscored needs, and reports ties", () => {
	const items = [
		item("issue-3", { business: "3", effort: 3, risk: 3 }),
		item("issue-1", { business: "5", effort: 1, risk: 1 }),
		item("issue-2", { business: "3", effort: 3, risk: 3 }),
		item("issue-4"),
		item("issue-5", { business: "5", proposed: "no" }),
		item("issue-6", { business: "5", proposed: "todo", final: "later" }),
	];
	const result = rankItems(items);
	assert.deepEqual(result.ranked.map((r) => r.issue), ["issue-1", "issue-2", "issue-3"]);
	assert.deepEqual(result.awaitingBusinessValue.map((r) => r.issue), ["issue-4"]);
	assert.deepEqual(result.parked.map((r) => r.issue), ["issue-5", "issue-6"]);
	assert.deepEqual(result.ties, [["issue-2", "issue-3"]]);
	const text = renderRanking(result);
	assert.match(text, /\| 1 \| issue-1 \|/);
	assert.match(text, /issue-4: .* \(proposed todo\)/);
	assert.match(renderRanking(rankItems([])), /_None\._/);
});

test("CLI ranks a specs directory and fails on invalid triage files", async () => {
	const root = await mkdtemp(join(tmpdir(), "rank-"));
	for (const [name, md] of [
		["issue-1", item("issue-1", { business: "5", final: "todo" }).md.replace("- **Final (PO):** todo", "- **Final (PO):** todo\n- **Decided By:** Sam Lee (Product Owner) on 2026-09-30")],
		["issue-2", "# Triage: broken"],
	]) {
		await mkdir(join(root, name));
		await writeFile(join(root, name, "triage.md"), md);
	}
	await mkdir(join(root, "triage"));
	await writeFile(join(root, "weights.json"), JSON.stringify({ customerValue: 2 }));

	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const err = console.error;
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.error = () => {};
	try {
		assert.equal(await runRanker(["--dir", root, "--weights", join(root, "weights.json")]), 1);
		assert.match(writes.join(""), /issue-1/);
		assert.equal(await runRanker([]), 1);
		assert.equal(await runRanker(["--dir", root, "--weights", join(root, "missing.json")]), 1);
	} finally {
		process.stdout.write = out;
		console.error = err;
	}
});
