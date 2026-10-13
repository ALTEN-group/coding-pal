import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
	LintError,
	collectFiles,
	collectInventory,
	findReferences,
	findSecrets,
	jaccard,
	lintContext,
	lineSet,
	parseBaseline,
	parseFrontmatter,
	renderLint,
	runLint,
} from "./context-lint.mjs";

const instruction = (description, applyTo, lines = ["Use named exports.", "Keep functions small.", "Prefer early returns.", "Name tests after behavior.", "Never log secrets."]) =>
	`---\n${description === null ? "" : `description: "${description}"\n`}${applyTo === null ? "" : `applyTo: "${applyTo}"\n`}---\n\n# Standards\n\n${lines.join("\n")}\n`;

async function makeTree(files) {
	const root = await mkdtemp(join(tmpdir(), "context-lint-"));
	for (const [rel, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, rel)), { recursive: true });
		await writeFile(join(root, rel), content);
	}
	return root;
}

const rules = (result, severity) => result.findings.filter((f) => !severity || f.severity === severity).map((f) => `${f.rule}:${f.file}`);

async function capture(fn) {
	const writes = [];
	const out = process.stdout.write.bind(process.stdout);
	const [log, error] = [console.log, console.error];
	process.stdout.write = (chunk) => (writes.push(String(chunk)), true);
	console.log = (...parts) => writes.push(`${parts.join(" ")}\n`);
	console.error = (...parts) => writes.push(`ERR ${parts.join(" ")}\n`);
	try {
		return { code: await fn(), text: writes.join("") };
	} finally {
		process.stdout.write = out;
		Object.assign(console, { log, error });
	}
}

const git = (cwd, args, date) =>
	execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
		cwd,
		stdio: "ignore",
		env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
	});

test("a healthy tree has no findings", async () => {
	const root = await makeTree({
		"instructions/api.instructions.md": instruction("API standards", "**/api/**"),
		"AGENTS.md": "# Agents\n\nBuild with npm.\n",
	});
	const result = await lintContext({ root });
	assert.deepEqual(result.findings, []);
	assert.equal(result.instructionCount, 2);
	assert.match(renderLint(result), /Instructions: 2\nFiles scanned: 2; 0 error\(s\), 0 warning\(s\)/);
});

test("collects the scanned locations only", async () => {
	const root = await makeTree({
		"instructions/a.instructions.md": instruction("a", "**/a/**"),
		".agents/skills/x/SKILL.md": "---\nname: x\n---\n",
		".agents/node_modules/pkg/readme.md": "ignored",
		".claude/rules/c.md": "claude",
		".cursor/rules/r.mdc": "cursor",
		".github/copilot-instructions.md": "# Copilot\n",
		".github/workflows/ci.yml": "ignored",
		"AGENTS.md": "# Agents\n",
		"src/other.md": "ignored",
		"instructions/image.png": "ignored",
	});
	assert.deepEqual(await collectFiles(root), [
		".agents/skills/x/SKILL.md",
		".claude/rules/c.md",
		".cursor/rules/r.mdc",
		".github/copilot-instructions.md",
		"AGENTS.md",
		"instructions/a.instructions.md",
	]);
});

test("flags a missing description", async () => {
	const files = {
		"instructions/nodesc.instructions.md": instruction(null, "**/x/**"),
		"instructions/broad.instructions.md": instruction("broad", "**", ["alpha one", "alpha two", "alpha three", "alpha four", "alpha five"]),
		"instructions/ok.instructions.md": instruction("ok", "**/ok/**,**/fine/**", ["zeta one", "zeta two", "zeta three", "zeta four", "zeta five"]),
	};
	const root = await makeTree(files);
	const result = await lintContext({ root });
	assert.deepEqual(rules(result, "error"), [
		"missing-description:instructions/nodesc.instructions.md",
	]);
});

test("warns about the everything instruction", async () => {
	const long = Array.from({ length: 130 }, (_, i) => `Rule number ${i}`);
	const root = await makeTree({ "instructions/big.instructions.md": instruction("big", "**/big/**", long), "instructions/small.instructions.md": instruction("small", "**/small/**") });
	assert.deepEqual(rules(await lintContext({ root })), ["too-long:instructions/big.instructions.md"]);
	assert.deepEqual(rules(await lintContext({ root, maxLines: 140 })), []);
	assert.deepEqual(rules(await lintContext({ root, maxLines: 5 })), ["too-long:instructions/big.instructions.md", "too-long:instructions/small.instructions.md"]);
});

test("detects near-duplicate instructions by line-set overlap", async () => {
	const base = ["Use named exports.", "Keep functions small.", "Prefer early returns.", "Name tests after behavior.", "Never log secrets.", "Validate input."];
	const root = await makeTree({
		"instructions/a.instructions.md": instruction("a", "**/a/**", base),
		"instructions/b.instructions.md": instruction("b", "**/b/**", [...base.slice(0, 5), "Something else."]),
		"instructions/c.instructions.md": instruction("c", "**/c/**", ["Unrelated one.", "Unrelated two.", "Unrelated three.", "Unrelated four.", "Unrelated five."]),
		"instructions/tiny1.instructions.md": "---\ndescription: t\napplyTo: \"**/t/**\"\n---\nOne line.\n",
		"instructions/tiny2.instructions.md": "---\ndescription: t\napplyTo: \"**/t/**\"\n---\nOne line.\n",
	});
	const result = await lintContext({ root });
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].rule, "near-duplicate");
	assert.match(result.findings[0].message, /near-duplicate of instructions\/b\.instructions\.md/);
	assert.equal(jaccard(lineSet(instruction("a", "x", base)), lineSet(instruction("b", "y", [...base.slice(0, 5), "Something else."]))) >= 0.6, true);
	assert.equal(jaccard(new Set(), new Set()), 0);
	assert.equal(jaccard(new Set(["a"]), new Set(["b"])), 0);
});

test("flags references to skills, agents, and prompts that do not exist", async () => {
	const text = (body) => `---\ndescription: "refs"\napplyTo: "**/refs/**"\n---\n${body}\n`;
	const root = await makeTree({
		"skills/real/SKILL.md": "---\nname: real\ndescription: x\n---\n",
		"agents/helper.agent.md": "---\nname: Helper Bot\ndescription: x\n---\n",
		"prompts/go.prompt.md": "---\nname: go-now\ndescription: x\n---\n",
		"instructions/good.instructions.md": text("Follow the `real` skill and `Helper Bot` agent. See skills/real/scripts/x.mjs, agents/helper.agent.md, the `go-now` prompt and prompts/go.prompt.md."),
		"instructions/bad.instructions.md": text("Use the `ghost` skill, skill `phantom`, skills/spectre/scripts/a.mjs, the `Missing Agent` agent, agent `Other`, agents/nope.agent.md, the `lost` prompt and prompts/gone.prompt.md. The `ghost` skill again."),
		"instructions/placeholder.instructions.md": text("Run the `<name>` skill with agent `<slug>`."),
	});
	const result = await lintContext({ root });
	const missing = new Set(result.findings.map((f) => f.message.match(/"(.+?)"/)[1]));
	assert.deepEqual([...missing].sort(), ["Missing Agent", "Other", "ghost", "gone", "lost", "nope", "phantom", "spectre"]);
	assert.equal(result.findings.filter((f) => f.file.includes("good")).length, 0);
	assert.equal(result.findings.filter((f) => f.file.includes("placeholder")).length, 0);
	assert.equal(result.findings.filter((f) => f.message.includes('"ghost"')).length, 1);

	const inventory = await collectInventory(root);
	assert.deepEqual([...inventory.agent].sort(), ["helper", "helper bot"]);
	assert.deepEqual(findReferences("the `x` skill and agent `Y Z`").map((r) => `${r.kind}:${r.name}`), ["skill:x", "agent:Y Z"]);
});

test("flags secret-looking strings without echoing them", async () => {
	const aws = `AKIA${"ABCDEFGHIJKLMNOP"}`;
	const ghp = `ghp_${"a1".repeat(18)}`;
	const slack = `xoxb-${"1234567890"}-abcdef`;
	const key = `-----BEGIN ${"RSA PRIVATE KEY"}-----`;
	const root = await makeTree({
		"instructions/s.instructions.md": instruction("s", "**/s/**", [`aws: ${aws}`, `token ${ghp}`, `slack ${slack}`, key, "fine line"]),
		".agents/skills/x/SKILL.md": `---\nname: x\n---\nkey = ${aws}\n`,
		"AGENTS.md": "# Agents\nNo secrets here.\n",
	});
	const result = await lintContext({ root });
	const secrets = result.findings.filter((f) => f.rule === "secret");
	assert.equal(secrets.length, 5);
	assert.deepEqual(secrets.map((f) => f.message.match(/looks like an? (.+?):/)[1]).sort(), ["AWS access key", "AWS access key", "GitHub token", "Slack token", "private key block"]);
	assert.ok(secrets.every((f) => f.severity === "error" && !f.message.includes(aws) && !f.message.includes(ghp)));
	assert.deepEqual(findSecrets("nothing\nto see"), []);
});

test("flags stale instruction files inside a git repository only", async () => {
	const root = await makeTree({
		"instructions/old.instructions.md": instruction("old", "**/old/**", ["old one", "old two", "old three", "old four", "old five"]),
		"instructions/new.instructions.md": instruction("new", "**/new/**", ["new one", "new two", "new three", "new four", "new five"]),
	});
	const now = Date.parse("2026-10-13T00:00:00Z");
	assert.deepEqual(rules(await lintContext({ root, now })), []);
	git(root, ["init", "-q"], "2026-01-01T00:00:00Z");
	git(root, ["add", "instructions/old.instructions.md"], "2026-01-01T00:00:00Z");
	git(root, ["commit", "-q", "-m", "old"], "2026-01-01T00:00:00Z");
	git(root, ["add", "instructions/new.instructions.md"], "2026-10-01T00:00:00Z");
	git(root, ["commit", "-q", "-m", "new"], "2026-10-01T00:00:00Z");
	await writeFile(join(root, "instructions/untracked.instructions.md"), instruction("u", "**/u/**", ["u one", "u two", "u three", "u four", "u five"]));
	const result = await lintContext({ root, now });
	assert.deepEqual(rules(result), ["stale:instructions/old.instructions.md"]);
	assert.match(result.findings[0].message, /285 days ago \(limit 180\)/);
	assert.deepEqual(rules(await lintContext({ root, now, staleDays: 400 })), []);
	assert.deepEqual(result.notes, []);
});

test("skips the stale check with a note in a shallow clone", async () => {
	const source = await makeTree({
		"instructions/old.instructions.md": instruction("old", "**/old/**", ["old one", "old two", "old three", "old four", "old five"]),
		"instructions/new.instructions.md": instruction("new", "**/new/**", ["new one", "new two", "new three", "new four", "new five"]),
	});
	const now = Date.parse("2026-10-13T00:00:00Z");
	git(source, ["init", "-q"], "2026-01-01T00:00:00Z");
	git(source, ["add", "instructions/old.instructions.md"], "2026-01-01T00:00:00Z");
	git(source, ["commit", "-q", "-m", "old"], "2026-01-01T00:00:00Z");
	git(source, ["add", "instructions/new.instructions.md"], "2026-10-01T00:00:00Z");
	git(source, ["commit", "-q", "-m", "new"], "2026-10-01T00:00:00Z");
	const parent = await mkdtemp(join(tmpdir(), "context-lint-shallow-"));
	const clone = join(parent, "clone");
	execFileSync("git", ["clone", "-q", "--depth", "1", `file://${source}`, clone], { stdio: "ignore" });

	const result = await lintContext({ root: clone, now });
	assert.deepEqual(rules(result), [], "no file may be reported as fresh or stale from truncated history");
	assert.equal(result.notes.length, 1);
	assert.match(result.notes[0], /stale check skipped: shallow clone/);
	assert.match(renderLint(result), /note: stale check skipped: shallow clone/);
	assert.equal((await capture(() => runLint(["--root", clone, "--strict"]))).code, 0, "the note is not a finding, so --strict still passes");

	assert.deepEqual(rules(await lintContext({ root: source, now })), ["stale:instructions/old.instructions.md"]);
});

test("reports instruction count growth against the baseline and validates it", async () => {
	const files = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`instructions/i${n}.instructions.md`, instruction(`i${n}`, `**/i${n}/**`, [`line ${n} a`, `line ${n} b`, `line ${n} c`, `line ${n} d`, `line ${n} e`])]));
	const root = await makeTree(files);
	const grown = await lintContext({ root, baseline: { instructionCount: 4, allowBroad: [] } });
	assert.deepEqual(rules(grown), ["growth:(all)"]);
	assert.match(grown.findings[0].message, /grew 50% over the baseline \(4 to 6\)/);
	assert.deepEqual(rules(await lintContext({ root, baseline: { instructionCount: 5, allowBroad: [] } })), []);
	assert.deepEqual(rules(await lintContext({ root, baseline: { instructionCount: 6, allowBroad: [] } })), []);
	const same = await lintContext({ root, baseline: { instructionCount: 6, allowBroad: [] } });
	assert.match(renderLint(same), /Instructions: 6 \(baseline 6, \+0%\)/);
	assert.deepEqual(rules(await lintContext({ root, baseline: { instructionCount: 0, allowBroad: [] } })), []);

	assert.deepEqual(parseBaseline({ instructionCount: 3 }), { instructionCount: 3 });
	assert.throws(() => parseBaseline([]), LintError);
	assert.throws(() => parseBaseline({ instructionCount: -1 }), /non-negative integer/);
	assert.deepEqual(parseFrontmatter("no frontmatter"), { data: {}, body: "no frontmatter", present: false });
});

test("CLI: exit codes, strict mode, and write-baseline", async () => {
	const root = await makeTree({
		"instructions/a.instructions.md": instruction("a", "**/a/**"),
		"instructions/b.instructions.md": instruction(null, "**", ["bb one", "bb two", "bb three", "bb four", "bb five"]),
	});
	let result = await capture(() => runLint(["--root", root]));
	assert.equal(result.code, 1);
	assert.match(result.text, /✗ error \[missing-description\] instructions\/b\.instructions\.md/);

	// Fix missing description
	await writeFile(join(root, "instructions/b.instructions.md"), instruction("b", "**", ["bb one", "bb two", "bb three", "bb four", "bb five"]));
	const baselinePath = join(root, "context-baseline.json");
	await writeFile(baselinePath, JSON.stringify({ instructionCount: 2 }));
	result = await capture(() => runLint(["--root", root, "--baseline", baselinePath]));
	assert.equal(result.code, 0);
	assert.match(result.text, /Instructions: 2 \(baseline 2, \+0%\)/);

	result = await capture(() => runLint(["--root", root, "--baseline", baselinePath, "--max-lines", "3"]));
	assert.equal(result.code, 0);
	assert.match(result.text, /warning \[too-long\]/);
	assert.equal((await capture(() => runLint(["--root", root, "--baseline", baselinePath, "--max-lines", "3", "--strict"]))).code, 1);

	await writeFile(join(root, "instructions/c.instructions.md"), instruction("c", "**/c/**", ["cc one", "cc two", "cc three", "cc four", "cc five"]));
	result = await capture(() => runLint(["--root", root, "--baseline", baselinePath, "--write-baseline"]));
	assert.equal(result.code, 0);
	assert.deepEqual(JSON.parse(await readFile(baselinePath, "utf-8")), { instructionCount: 3 });

	await rm(baselinePath);
	result = await capture(() => runLint(["--root", root, "--write-baseline"]));
	assert.equal(result.code, 0);
	assert.deepEqual(JSON.parse(await readFile(baselinePath, "utf-8")), { instructionCount: 3 });

	assert.equal((await capture(() => runLint(["--root", root, "--baseline", join(root, "missing.json")]))).code, 1);
	await writeFile(join(root, "bad.json"), "{nope");
	assert.equal((await capture(() => runLint(["--root", root, "--baseline", join(root, "bad.json")]))).code, 1);
	await writeFile(join(root, "bad.json"), JSON.stringify({ instructionCount: "x" }));
	assert.equal((await capture(() => runLint(["--root", root, "--baseline", join(root, "bad.json")]))).code, 1);
	assert.equal((await capture(() => runLint(["--root", join(root, "nowhere")]))).code, 1);
	assert.equal((await capture(() => runLint(["--root", root, "--max-lines", "0"]))).code, 1);
	assert.equal((await capture(() => runLint(["--root", root, "--stale-days", "x"]))).code, 1);
	assert.equal((await capture(() => runLint(["--root", root, "--today", "soon"]))).code, 1);
	await writeFile(baselinePath, JSON.stringify({ instructionCount: 3 }));
	assert.equal((await capture(() => runLint(["--root", root, "--today", "2026-10-13", "--baseline", baselinePath]))).code, 0);
	assert.equal((await capture(() => runLint(["--root", root, "--surprise"]))).code, 1);
	assert.equal((await capture(() => runLint([]))).code, 1);
	assert.equal((await capture(() => runLint(["--help"]))).code, 0);
});

test("lints the Copilot, Claude, and Cursor install locations without false positives", async () => {
	const lines = ["omega one", "omega two", "omega three", "omega four", "omega five"];
	const root = await makeTree({
		".github/instructions/broad.instructions.md": instruction("broad", "**/**", ["sigma one", "sigma two", "sigma three", "sigma four", "sigma five"]),
		".github/instructions/commented.instructions.md": instruction("commented", "**", ["psi one", "psi two", "psi three", "psi four", "psi five"]).replace('applyTo: "**"', 'applyTo: "**" # all files'),
		".github/prompts/leak.prompt.md": "key AKIAIOSFODNN7EXAMPLE\n",
		".github/instructions/token.instructions.md": `${instruction("token", "**/t/**", ["tau one", "tau two", "tau three", "tau four", "tau five"])}github_pat_${"A".repeat(30)}\n`,
		".cursor/rules/ok.mdc": instruction("ok", "**/ok/**", lines),
		".github/instructions/ok.instructions.md": instruction("ok", "**/ok/**", lines),
		"CLAUDE.md": "# Claude\n",
		".claude/agents/helper.md": "---\nname: Helper\n---\n",
		".claude/commands/go.md": "go",
		".github/instructions/refs.instructions.md": `${instruction("refs", "**/r/**", ["rho one", "rho two", "rho three", "rho four", "rho five"])}Hand off to the \`Helper\` agent and the \`go\` prompt.\n\n\`\`\`\nFollow the \`example\` skill\n\`\`\`\n`,
		"instructions/bom.instructions.md": `\uFEFF${instruction("bom", "**/b/**", ["chi one", "chi two", "chi three", "chi four", "chi five"])}`,
	});
	const result = await lintContext({ root });
	assert.deepEqual(rules(result, "error"), [
		"secret:.github/instructions/token.instructions.md",
		"secret:.github/prompts/leak.prompt.md",
	]);
	assert.deepEqual(rules(result, "warning"), []);
	// 6 native instruction files plus CLAUDE.md; the .mdc generated from ok.instructions.md is not counted twice.
	assert.equal(result.instructionCount, 7);
});
