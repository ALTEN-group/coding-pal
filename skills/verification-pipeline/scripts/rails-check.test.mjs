import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_CONFIG, RailsError, checkRails, parseArgs, resolveConfig, runRailsCheck, stripYamlComments } from "./rails-check.mjs";
import { apmYml, railsProject, remediateTemplate, verifyTemplate } from "./rails-fixture.mjs";

async function run(args) {
	const log = console.log;
	const err = console.error;
	const out = [];
	console.log = (...a) => out.push(a.join(" "));
	console.error = (...a) => out.push(a.join(" "));
	try {
		const code = await runRailsCheck(args);
		return { code, out: out.join("\n") };
	} finally {
		console.log = log;
		console.error = err;
	}
}

const items = (missing) => missing.map((m) => `${m.category}:${m.item}`);

test("the shipped verify.yml and remediate.yml satisfy the default Platform Rails", async () => {
	assert.deepEqual(await checkRails(railsProject()), []);
});

test("the templates keep their contract: jobs, limit, labels and no production secrets", () => {
	for (const job of ["clean-rerun:", "controls:", "preview:"]) assert.ok(verifyTemplate.includes(`\n  ${job}`), job);
	assert.match(remediateTemplate, /workflows: \[verify\]/);
	assert.match(remediateTemplate, /types: \[completed\]/);
	assert.match(remediateTemplate, /FIX_LOOP_LIMIT: "5"/);
	assert.match(remediateTemplate, /fix-loop:/);
	assert.match(remediateTemplate, /PLACEHOLDER/);
	assert.match(remediateTemplate, /control-guard\.mjs/);
	for (const text of [verifyTemplate, remediateTemplate]) {
		assert.doesNotMatch(text, /secrets\.PROD/i);
		assert.doesNotMatch(text, /environment:\s*production/i);
		assert.doesNotMatch(text, /continue-on-error/);
		assert.doesNotMatch(text, /\|\|\s*true/);
	}
	assert.doesNotMatch(remediateTemplate, /contents:\s*write/);
});

test("the controls job checks the fix-loop history from the base branch before the soft reset flattens it", () => {
	const active = stripYamlComments(verifyTemplate);
	const check = active.indexOf('code-loop/scripts/code-loop.mjs" check-history');
	assert.ok(check > 0, "verify.yml runs code-loop check-history");
	assert.ok(check < active.indexOf("git reset --soft"), "check-history runs before git reset --soft");
	assert.match(active, /check-history --dir "\$ITEM" --base "origin\/\$BASE_REF"/);
	assert.match(active, /node "\$SKILLS\/code-loop\//, "the control is the base-branch copy");
	assert.match(active, /git ls-tree -r --name-only "origin\/\$BASE_REF" -- specs/, "work items on the base branch are covered");
	assert.match(active, /git diff --name-only "origin\/\$BASE_REF\.\.\.HEAD" -- specs/, "work items in the pull request are covered");
});

test("a missing workflow, template or apm.yml is reported", async () => {
	const root = railsProject({ ".github/workflows/verify.yml": null, ".github/workflows/remediate.yml": null, ".github/pull_request_template.md": null, "apm.yml": null });
	assert.deepEqual(items(await checkRails(root)).filter((i) => i.startsWith("file:")), [
		"file:.github/workflows/verify.yml",
		"file:.github/workflows/remediate.yml",
		"file:.github/pull_request_template.md",
		"file:apm.yml",
	]);
});

test("verify.yml must run every required control script", async () => {
	for (const script of DEFAULT_CONFIG.controlScripts) {
		const root = railsProject({ ".github/workflows/verify.yml": verifyTemplate.replaceAll(script, "removed.mjs") });
		assert.deepEqual(items(await checkRails(root)), [`control:${script}`], script);
	}
});

test("a commented-out control does not count", async () => {
	const commented = verifyTemplate.split("\n").map((l) => (l.includes("mutation-bar.mjs") ? `#${l}` : l)).join("\n");
	assert.deepEqual(items(await checkRails(railsProject({ ".github/workflows/verify.yml": commented }))), ["control:mutation-bar.mjs"]);
	assert.equal(stripYamlComments("a: 1 # x\n# whole line\nb: 2").trim(), "a: 1\nb: 2");
});

test("remediate.yml must trigger on workflow_run, count the fix-loop, and run control-guard", async () => {
	const root = railsProject({ ".github/workflows/remediate.yml": "name: remediate\non: push\njobs: {}\n" });
	assert.deepEqual(items(await checkRails(root)), ["remediation:control-guard.mjs", "remediation:workflow_run", "remediation:fix-loop:"]);
});

test("apm.yml must list the required agents and skills", async () => {
	const without = DEFAULT_CONFIG.skills.filter((s) => s !== "security-gate" && s !== "code-loop");
	const root = railsProject({ "apm.yml": apmYml({ skills: without, agents: ["code.agent.md"] }) });
	assert.deepEqual(items(await checkRails(root)), ["apm-agent:gate-fix.agent.md", "apm-skill:code-loop", "apm-skill:security-gate"]);
});

test("apm.yml matches whole names only, not prefixes or comments", async () => {
	const apm = apmYml({ skills: DEFAULT_CONFIG.skills.filter((s) => s !== "task-gate") }).replace("name: demo-app", "name: demo-app\n# task-gate is planned");
	const near = `${apm}    - other/task-gates\n`;
	assert.deepEqual(items(await checkRails(railsProject({ "apm.yml": near }))), ["apm-skill:task-gate"]);
});

test("skills must be installed under .agents/skills", async () => {
	const root = railsProject({ ".agents/skills/control-guard/SKILL.md": null, ".agents/skills/preview-smoke/SKILL.md": null });
	assert.deepEqual(items(await checkRails(root)), ["installed-skill:control-guard", "installed-skill:preview-smoke"]);
});

test("config replaces a default list and is validated", async () => {
	assert.throws(() => resolveConfig([]), RailsError);
	assert.throws(() => resolveConfig({ nope: [] }), /unknown config key/);
	assert.throws(() => resolveConfig({ skills: "x" }), /skills must be an array/);
	assert.throws(() => resolveConfig({ agents: [""] }), /agents must be an array/);
	const config = resolveConfig({ controlScripts: ["control-guard.mjs"], skills: [], agents: [] });
	assert.deepEqual(await checkRails(railsProject({ ".agents/skills/security-gate/SKILL.md": null }), config), []);
});

test("parseArgs validates options", () => {
	assert.throws(() => parseArgs([]), /--root is required/);
	assert.throws(() => parseArgs(["--root"]), /needs a value/);
	assert.throws(() => parseArgs(["--root", "x", "--bogus"]), /unknown argument/);
	assert.deepEqual(parseArgs(["--root", "x", "--config", "c.json"]), { root: "x", config: "c.json", json: false });
});

test("CLI: a complete project passes", async () => {
	const { code, out } = await run(["--root", railsProject()]);
	assert.equal(code, 0);
	assert.match(out, /^PASS: the Platform Rails are in place$/m);
});

test("CLI: each missing item is printed and the exit code is 1", async () => {
	const root = railsProject({ ".github/pull_request_template.md": null, ".agents/skills/scope-guard/SKILL.md": null });
	const { code, out } = await run(["--root", root]);
	assert.equal(code, 1);
	assert.match(out, /^MISSING file \.github\/pull_request_template\.md: /m);
	assert.match(out, /^MISSING installed-skill scope-guard: /m);
	assert.match(out, /^FAIL: 2 item\(s\) missing$/m);
});

test("CLI: --config and --json", async () => {
	const dir = await mkdtemp(join(tmpdir(), "rails-cfg-"));
	await writeFile(join(dir, "rails.json"), JSON.stringify({ skills: ["code-loop"], agents: [], controlScripts: [] }));
	const root = railsProject({ ".agents/skills/mutation-bar/SKILL.md": null });
	assert.equal((await run(["--root", root, "--config", join(dir, "rails.json")])).code, 0);
	const json = await run(["--root", railsProject({ "apm.yml": null }), "--json"]);
	assert.equal(json.code, 1);
	assert.equal(JSON.parse(json.out).missing[0].item, "apm.yml");
});

test("CLI: usage, missing root and bad config exit 1 with one line", async () => {
	const dir = await mkdtemp(join(tmpdir(), "rails-cfg-"));
	await writeFile(join(dir, "bad.json"), "{nope");
	await writeFile(join(dir, "unknown.json"), JSON.stringify({ nope: [] }));
	for (const args of [[], ["--root", join(dir, "absent")], ["--root", dir, "--config", join(dir, "missing.json")], ["--root", dir, "--config", join(dir, "bad.json")], ["--root", dir, "--config", join(dir, "unknown.json")]]) {
		const { code, out } = await run(args);
		assert.equal(code, 1, args.join(" "));
		assert.match(out, /^rails-check: /);
		assert.equal(out.split("\n").length, 1);
	}
});
