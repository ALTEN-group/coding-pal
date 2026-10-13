import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GuardError, loadConfig, matchGlob, parseArgs, parseDiff, resolveConfig, runControlGuard, scanDiff } from "./control-guard.mjs";
import { cleanDiff, fileDiff, tempRepo } from "./control-guard-fixture.mjs";

const scan = (text, opts) => scanDiff(parseDiff(text), resolveConfig({}), opts);
const rules = (text, opts) => scan(text, opts).map((f) => f.rule);

async function run(args, options) {
	const log = console.log;
	const err = console.error;
	const out = [];
	console.log = (...a) => out.push(a.join(" "));
	console.error = (...a) => out.push(a.join(" "));
	try {
		const code = await runControlGuard(args, options);
		return { code, out: out.join("\n") };
	} finally {
		console.log = log;
		console.error = err;
	}
}

test("matchGlob handles **, *, ? and root-level matches", () => {
	assert.equal(matchGlob("a.test.js", "**/*.test.*"), true);
	assert.equal(matchGlob("src/a/b.test.ts", "**/*.test.*"), true);
	assert.equal(matchGlob("tests/a/b.js", "tests/**"), true);
	assert.equal(matchGlob("src/tests/a.js", "tests/**"), false);
	assert.equal(matchGlob(".github/workflows/verify.yml", ".github/workflows/**"), true);
	assert.equal(matchGlob("docs/control-guard.json", "control-guard.json"), false);
	assert.equal(matchGlob("a/b.js", "a/?.js"), true);
	assert.equal(matchGlob("a/b/c.js", "a/*.js"), false);
});

test("parseDiff reads statuses, paths, hunks and line numbers", () => {
	const text = fileDiff({ path: "src/a.js", removed: ["old"], added: ["new1", "new2"], start: 5 })
		+ fileDiff({ path: "src/gone.js", status: "deleted", removed: ["x"] })
		+ fileDiff({ path: "src/new.js", status: "added", added: ["y"] })
		+ fileDiff({ path: "src/moved.js", oldPath: "src/orig.js", status: "renamed" });
	const files = parseDiff(text);
	assert.deepEqual(files.map((f) => [f.path, f.status]), [["src/a.js", "modified"], ["src/gone.js", "deleted"], ["src/new.js", "added"], ["src/moved.js", "renamed"]]);
	assert.equal(files[3].oldPath, "src/orig.js");
	assert.deepEqual(files[0].hunks[0].lines.map((l) => [l.type, l.line]), [["del", 5], ["add", 5], ["add", 6]]);
});

test("parseDiff treats content that looks like headers inside a hunk as content", () => {
	const text = "diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,2 +1,2 @@\n--- not a header\n+++ also not a header\n ctx\n";
	const files = parseDiff(text);
	assert.equal(files.length, 1);
	assert.deepEqual(files[0].hunks[0].lines.map((l) => l.type), ["del", "add"]);
});

test("parseDiff also reads a plain unified diff without git headers", () => {
	const text = "--- a/one.js\t2026-01-01\n+++ b/one.js\t2026-01-02\n@@ -1 +1 @@\n-a\n+b\n--- a/two.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n";
	const files = parseDiff(text);
	assert.deepEqual(files.map((f) => [f.path, f.status]), [["one.js", "modified"], ["two.js", "deleted"]]);
});

test("a clean change passes every rule", () => {
	assert.deepEqual(scan(cleanDiff), []);
});

test("R1: deleted test files and tests moved out of the test paths", () => {
	const found = scan(fileDiff({ path: "tests/a.test.js", status: "deleted", removed: ["x"] }) + fileDiff({ path: "src/helper.js", oldPath: "test/helper.js", status: "renamed" }));
	assert.deepEqual(found.map((f) => [f.rule, f.file]), [["R1", "tests/a.test.js"], ["R1", "test/helper.js"]]);
	assert.deepEqual(rules(fileDiff({ path: "src/old.js", status: "deleted", removed: ["x"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "tests/b.test.js", oldPath: "tests/a.test.js", status: "renamed" })), []);
});

test("R2: skip and only markers added in tests", () => {
	const markers = ["it.skip('a', () => {})", "xit('a', f)", "xdescribe('a', f)", "it.todo('a')", "test.todo('a')", "fit('a', f)", "fdescribe('a', f)", "it.only('a', f)", "@skip", "@pytest.mark.skip(reason='x')", "@Disabled", "xtest('a', f)", "@unittest.skip('x')"];
	for (const marker of markers) {
		assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", added: [marker] })), ["R2"], marker);
	}
	assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", added: ["const gain = benefit(model);", "model.fit(x)"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "src/db.js", added: ["cursor.skip(10)"] })), []);
});

test("R3: lowered thresholds in config files", () => {
	const lowered = [
		[['"branches": 80,'], ['"branches": 70,'], "branches"],
		[["  fail_under = 90"], ["  fail_under = 85"], "fail_under"],
		[['"break": 80'], ['"break": 60'], "break"],
		[["run: npx mutation-bar --min-score 80"], ["run: npx mutation-bar --min-score 50"], "--min-score"],
		[["minScore: 90"], ["minScore: 89.5"], "minScore"],
	];
	for (const [removed, added, key] of lowered) {
		const found = scan(fileDiff({ path: "config/ci.json", removed, added }));
		assert.deepEqual(found.map((f) => f.rule), ["R3"], key);
		assert.ok(found[0].message.startsWith(`threshold ${key} lowered`), found[0].message);
	}
	assert.deepEqual(rules(fileDiff({ path: "jest.config.js", removed: ["branches: 80,", "functions: 80,"], added: ["branches: 70,", "functions: 80,"] })), ["R3"]);
	assert.deepEqual(rules(fileDiff({ path: "jest.config.js", removed: ["branches: 80,"], added: ["branches: 90,"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "jest.config.js", removed: ["lines: 80,"], added: ["maxLines: 10,"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "tests/fixture.test.js", removed: ["branches: 80"], added: ["branches: 10"] })), []);
});

test("R4: workflow weakening on added lines", () => {
	const lines = ["    continue-on-error: true", "      run: npm test || true", "  run: git commit --no-verify", "    if: false", "    allow_failure: true"];
	for (const line of lines) {
		assert.deepEqual(rules(fileDiff({ path: ".github/workflows/verify.yml", added: [line] })).filter((r) => r === "R4"), ["R4"], line);
	}
	assert.deepEqual(rules(fileDiff({ path: ".gitlab-ci.yml", added: ["  allow_failure: false"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "package.json", added: ['"test": "jest || true"'] })), ["R4"]);
	assert.deepEqual(rules(fileDiff({ path: ".github/workflows/verify.yml", added: ["    # was: continue-on-error: true"] })).filter((r) => r === "R4"), []);
	assert.deepEqual(rules(fileDiff({ path: "src/app.js", added: ["a() || true"] })), []);
});

test("R4: a deleted workflow file and a deleted job key", () => {
	const deleted = scan(fileDiff({ path: ".github/workflows/verify.yml", status: "deleted", removed: ["name: verify"] }));
	assert.deepEqual(deleted.map((f) => f.rule), ["R4", "R5"]);
	const jobGone = fileDiff({ path: ".github/workflows/verify.yml", removed: ["  controls:", "    runs-on: ubuntu-latest", "    steps:", "      - run: echo"], added: [] });
	assert.deepEqual(scan(jobGone).filter((f) => f.rule === "R4").map((f) => f.message), ["job controls deleted"]);
	const renamed = fileDiff({ path: ".github/workflows/verify.yml", removed: ["  controls:", "    runs-on: ubuntu-latest"], added: ["  controls:", "    runs-on: ubuntu-24.04"] });
	assert.deepEqual(scan(renamed).filter((f) => f.rule === "R4"), []);
	const trigger = fileDiff({ path: ".github/workflows/verify.yml", removed: ["  push:", "    branches: [main]"] });
	assert.deepEqual(scan(trigger).filter((f) => f.rule === "R4"), []);
});

test("R5: protected paths, config additions and --allow-path", () => {
	for (const path of [".agents/skills/code-loop/SKILL.md", ".claude/skills/x/a.mjs", ".cursor/skills/x/a.mjs", ".github/workflows/ci.yml", "control-guard.json", "mutation-bar.json", "waivers.json", "svc/waivers.json"]) {
		assert.ok(rules(fileDiff({ path, added: ["x"] })).includes("R5"), path);
	}
	assert.deepEqual(rules(fileDiff({ path: "src/app.js", added: ["x"] })), []);
	assert.deepEqual(rules(fileDiff({ path: ".agents/skills/code-loop/SKILL.md", added: ["x"] }), { allowPaths: [".agents/skills/**"] }), []);
	assert.deepEqual(rules(fileDiff({ path: ".agents/skills/a/x.mjs", oldPath: "src/x.mjs", status: "renamed" })), ["R5"]);
	const config = resolveConfig({ protectedPaths: ["infra/**"] });
	assert.deepEqual(scanDiff(parseDiff(fileDiff({ path: "infra/main.tf", added: ["x"] })), config).map((f) => f.rule), ["R5"]);
});

test("R6: suppressions added", () => {
	for (const line of ["// eslint-disable-next-line no-console", "// @ts-ignore", "// @ts-nocheck", "x = 1  # noqa: E501", "// biome-ignore lint: reason", "int a; // NOSONAR"]) {
		assert.deepEqual(rules(fileDiff({ path: "src/a.js", added: [line] })), ["R6"], line);
	}
	assert.deepEqual(rules(fileDiff({ path: "docs/lint.md", added: ["Use eslint-disable sparingly"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "src/a.js", removed: ["// eslint-disable-next-line"], added: [] })), []);
});

test("R7: agent and remediate workflows must not expose production credentials", () => {
	for (const line of ["  token: ${{ secrets.PROD_DEPLOY_KEY }}", "  token: ${{ secrets.PRODUCTION }}", "    environment: production", "  k: ${{ secrets['PROD_KEY'] }}"]) {
		for (const path of [".github/workflows/remediate.yml", ".github/workflows/agent-run.yml"]) {
			assert.ok(rules(fileDiff({ path, added: [line] })).includes("R7"), `${path} ${line}`);
		}
	}
	assert.ok(!rules(fileDiff({ path: ".github/workflows/release.yml", added: ["    environment: production"] })).includes("R7"));
	assert.ok(!rules(fileDiff({ path: ".github/workflows/remediate.yml", added: ["  # secrets.PROD is forbidden here"] })).includes("R7"));
	assert.ok(!rules(fileDiff({ path: ".github/workflows/remediate.yml", added: ["  token: ${{ secrets.REMEDIATE_PUSH_TOKEN }}"] })).includes("R7"));
});

test("R8: net assertion loss in a modified test file, with tolerance", () => {
	const lost = fileDiff({ path: "tests/a.test.js", removed: ["expect(a).toBe(1);", "expect(b).toBe(2);", "assert.equal(c, 3);"], added: ["expect(a).toBe(1);"] });
	const found = scan(lost);
	assert.deepEqual(found.map((f) => f.rule), ["R8"]);
	assert.match(found[0].message, /-3 \+1 \(net 2, tolerance 0\)/);
	assert.equal(found[0].line, 10);
	assert.deepEqual(scanDiff(parseDiff(lost), resolveConfig({ assertionTolerance: 2 })), []);
	assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", removed: ["expect(a).toBe(1);"], added: ["expect(a).toBe(2);"] })), []);
	assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", removed: ["self.assertEqual(a, 1)", "assert b == 2"], added: ["self.assertEqual(a, 1)"] })), ["R8"]);
	assert.deepEqual(rules(fileDiff({ path: "src/a.js", removed: ["assert(a)"], added: [] })), []);
	assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", status: "added", added: ["expect(a).toBe(1);"] })), []);
});

test("R4: continue-on-error written as a quoted string or an expression still fails", () => {
	for (const line of ['    continue-on-error: "true"', "    continue-on-error: ${{ true }}", "    continue-on-error: True"]) {
		assert.ok(rules(fileDiff({ path: ".github/workflows/verify.yml", added: [line] })).includes("R4"), line);
	}
	assert.ok(!rules(fileDiff({ path: ".github/workflows/verify.yml", added: ["    continue-on-error: false"] })).includes("R4"));
});

test("R7: the multi-line and inline-map forms of environment: production fail", () => {
	for (const line of ["      name: production", "    environment: { name: production }"]) {
		assert.ok(rules(fileDiff({ path: ".github/workflows/remediate.yml", added: [line] })).includes("R7"), line);
	}
	assert.ok(!rules(fileDiff({ path: ".github/workflows/remediate.yml", added: ["      name: production-smoke-check", "    - name: production"] })).includes("R7"));
});

test("R8: commented-out assertions do not offset removed ones, and C# Assert calls are counted", () => {
	assert.deepEqual(rules(fileDiff({ path: "tests/a.test.js", removed: ["expect(a).toBe(1);"], added: ["// expect(a).toBe(1);", "# assert a"] })), ["R8"]);
	assert.deepEqual(rules(fileDiff({ path: "tests/FooTests.cs", removed: ["Assert.Equal(1, x);"], added: ["var y = 1;"] })), ["R8"]);
});

test("parseDiff reads CRLF diffs and quoted rename paths", () => {
	const crlf = ["diff --git a/.github/workflows/x.yml b/docs/x.yml", "similarity index 100%", "rename from .github/workflows/x.yml", "rename to docs/x.yml", ""].join("\r\n");
	const [renamed] = parseDiff(crlf);
	assert.deepEqual([renamed.oldPath, renamed.path], [".github/workflows/x.yml", "docs/x.yml"]);
	assert.deepEqual(rules(crlf), ["R5"]);
	const quoted = ['diff --git "a/docs/caf\\303\\251 x.yml" "b/.github/workflows/caf\\303\\251 x.yml"', "similarity index 100%", 'rename from "docs/caf\\303\\251 x.yml"', 'rename to ".github/workflows/caf\\303\\251 x.yml"', ""].join("\n");
	const [moved] = parseDiff(quoted);
	assert.deepEqual([moved.oldPath, moved.path], ["docs/café x.yml", ".github/workflows/café x.yml"]);
	assert.deepEqual(rules(quoted), ["R5"]);
	const deleted = ['diff --git "a/tests/a\\tb.test.js" "b/tests/a\\tb.test.js"', "deleted file mode 100644", 'Binary files "a/tests/a\\tb.test.js" and /dev/null differ', ""].join("\n");
	assert.deepEqual(scan(deleted).map((f) => [f.rule, f.file]), [["R1", "tests/a\tb.test.js"]]);
});

test("findings are ordered and carry RULE file:line", () => {
	const text = fileDiff({ path: "src/a.js", added: ["// @ts-ignore"], start: 3 }) + fileDiff({ path: "tests/a.test.js", added: ["it.skip('x', f)"], start: 7 });
	assert.deepEqual(scan(text).map((f) => `${f.rule} ${f.file}:${f.line}`), ["R6 src/a.js:3", "R2 tests/a.test.js:7"]);
});

test("config: validation, defaults and additive lists", async () => {
	assert.throws(() => resolveConfig([]), GuardError);
	assert.throws(() => resolveConfig({ nope: 1 }), /unknown config key/);
	assert.throws(() => resolveConfig({ protectedPaths: "x" }), /protectedPaths/);
	assert.throws(() => resolveConfig({ testGlobs: [""] }), /testGlobs/);
	assert.throws(() => resolveConfig({ assertionTolerance: -1 }), /assertionTolerance/);
	assert.ok(resolveConfig({ protectedPaths: [] }).protectedPaths.includes(".github/workflows/**"));
	const dir = await mkdtemp(join(tmpdir(), "control-guard-cfg-"));
	assert.equal((await loadConfig(undefined, dir)).assertionTolerance, 0);
	await assert.rejects(loadConfig("missing.json", dir), /not found/);
	await writeFile(join(dir, "control-guard.json"), "{bad");
	await assert.rejects(loadConfig(undefined, dir), /not valid JSON/);
	await writeFile(join(dir, "control-guard.json"), JSON.stringify({ assertionTolerance: 3 }));
	assert.equal((await loadConfig(undefined, dir)).assertionTolerance, 3);
});

test("parseArgs needs exactly one source", () => {
	assert.throws(() => parseArgs([]), /exactly one/);
	assert.throws(() => parseArgs(["--git", "main", "--diff", "x"]), /exactly one/);
	assert.throws(() => parseArgs(["--git"]), /needs a value/);
	assert.throws(() => parseArgs(["--git", "main", "--bogus"]), /unknown argument/);
	assert.deepEqual(parseArgs(["--diff", "d", "--allow-path", "a/**", "--allow-path", "b"]).allowPaths, ["a/**", "b"]);
});

test("CLI --diff: pass, fail with RULE file:line, and --json", async () => {
	const dir = await mkdtemp(join(tmpdir(), "control-guard-cli-"));
	await writeFile(join(dir, "clean.diff"), cleanDiff);
	await writeFile(join(dir, "bad.diff"), fileDiff({ path: "tests/a.test.js", added: ["it.skip('x', f)"], start: 4 }));
	const ok = await run(["--diff", "clean.diff"], { cwd: dir });
	assert.equal(ok.code, 0);
	assert.match(ok.out, /PASS/);
	const bad = await run(["--diff", "bad.diff"], { cwd: dir });
	assert.equal(bad.code, 1);
	assert.match(bad.out, /^R2 tests\/a\.test\.js:4 skip or only marker added/m);
	const json = await run(["--diff", "bad.diff", "--json"], { cwd: dir });
	assert.equal(JSON.parse(json.out).findings[0].rule, "R2");
});

test("CLI --diff: honours control-guard.json and --allow-path", async () => {
	const dir = await mkdtemp(join(tmpdir(), "control-guard-cli-"));
	await writeFile(join(dir, "loss.diff"), fileDiff({ path: "tests/a.test.js", removed: ["expect(a).toBe(1);"], added: [] }));
	assert.equal((await run(["--diff", "loss.diff"], { cwd: dir })).code, 1);
	await writeFile(join(dir, "control-guard.json"), JSON.stringify({ assertionTolerance: 1 }));
	assert.equal((await run(["--diff", "loss.diff"], { cwd: dir })).code, 0);
	await writeFile(join(dir, "skills.diff"), fileDiff({ path: ".agents/skills/a/SKILL.md", added: ["x"] }));
	assert.equal((await run(["--diff", "skills.diff"], { cwd: dir })).code, 1);
	assert.equal((await run(["--diff", "skills.diff", "--allow-path", ".agents/skills/**"], { cwd: dir })).code, 0);
});

test("CLI: usage errors, unreadable diffs and bad config exit 1 with one line", async () => {
	const dir = await mkdtemp(join(tmpdir(), "control-guard-cli-"));
	await writeFile(join(dir, "ok.diff"), cleanDiff);
	await writeFile(join(dir, "bad.json"), JSON.stringify({ nope: 1 }));
	await writeFile(join(dir, "garbage.diff"), "not a diff at all\n");
	for (const args of [[], ["--diff", "missing.diff"], ["--diff", "ok.diff", "--config", "missing.json"], ["--diff", "ok.diff", "--config", "bad.json"], ["--git", "no-such-ref"], ["--diff", "garbage.diff"]]) {
		const { code, out } = await run(args, { cwd: dir });
		assert.equal(code, 1, args.join(" "));
		assert.match(out, /^control-guard: /);
		assert.equal(out.split("\n").length, 1);
	}
});

test("CLI --git: scans a temp repository against its base", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "export const a = 1;\n", "tests/a.test.js": "expect(a).toBe(1);\nexpect(a).toBeTruthy();\n", "package.json": '{"scripts":{"test":"jest"}}\n' });
		repo.git("checkout", "-q", "-b", "feature/issue-1-x");
		repo.commit("weaken", { "tests/a.test.js": "it.skip('a', () => {});\nexpect(a).toBe(1);\n", "src/a.js": "// @ts-ignore\nexport const a = 2;\n", "package.json": '{"scripts":{"test":"jest || true"}}\n' });
		const result = await run(["--git", "main"], { cwd: repo.dir });
		assert.equal(result.code, 1);
		assert.match(result.out, /^R2 tests\/a\.test\.js:1 /m);
		assert.match(result.out, /^R4 package\.json:1 /m);
		assert.match(result.out, /^R6 src\/a\.js:1 /m);
		assert.match(result.out, /^R8 tests\/a\.test\.js:2 /m);
	} finally {
		repo.cleanup();
	}
});

test("CLI --git: includes uncommitted edits, deletions and notes untracked files", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "tests/a.test.js": "expect(a).toBe(1);\n", ".github/workflows/verify.yml": "name: verify\n" });
		repo.remove("tests/a.test.js");
		repo.write("scratch.txt", "untracked");
		const result = await run(["--git", "HEAD"], { cwd: repo.dir });
		assert.equal(result.code, 1);
		assert.match(result.out, /R1 tests\/a\.test\.js:1 test file deleted/);
		assert.match(result.out, /1 untracked file\(s\) are not scanned/);
	} finally {
		repo.cleanup();
	}
});

test("CLI --git: a clean branch passes", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "export const a = 1;\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-2-y");
		repo.commit("fix", { "src/a.js": "export const a = 2;\n" });
		assert.equal((await run(["--git", "main"], { cwd: repo.dir })).code, 0);
	} finally {
		repo.cleanup();
	}
});
