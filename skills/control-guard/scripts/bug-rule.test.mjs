import assert from "node:assert/strict";
import { test } from "node:test";
import { BugRuleError, DEFAULT_TEST_GLOBS, classifyCommit, evaluateBugRule, parseArgs, parseNameStatus, parseRange, runBugRule } from "./bug-rule.mjs";
import { tempRepo } from "./control-guard-fixture.mjs";

async function run(args, options) {
	const log = console.log;
	const err = console.error;
	const out = [];
	console.log = (...a) => out.push(a.join(" "));
	console.error = (...a) => out.push(a.join(" "));
	try {
		const code = await runBugRule(args, options);
		return { code, out: out.join("\n") };
	} finally {
		console.log = log;
		console.error = err;
	}
}

const commit = (kind, extra = {}) => ({ kind, short: `c${Math.random().toString(16).slice(2, 8)}`, addsOrChangesTests: kind !== "code", ...extra });

test("parseRange accepts base..head and rejects anything else", () => {
	assert.deepEqual(parseRange("origin/main..HEAD"), { base: "origin/main", head: "HEAD" });
	for (const bad of ["main", "a...b", "..b", "a..", "a b..c", undefined]) assert.throws(() => parseRange(bad), BugRuleError, String(bad));
});

test("parseNameStatus reads statuses and keeps the old path of renames", () => {
	assert.deepEqual(parseNameStatus("A\ttests/a.test.js\nM\tsrc/a.js\nR090\told.js\tnew.js\n"), [
		{ status: "A", path: "tests/a.test.js" },
		{ status: "M", path: "src/a.js" },
		{ status: "R", path: "new.js", oldPath: "old.js" },
	]);
});

test("classifyCommit counts the old path of a rename and uses the same test paths as Control Guard", () => {
	const rename = (oldPath, path) => classifyCommit([{ status: "R", path, oldPath }]).kind;
	assert.equal(rename("src/a.js", "tests/a.test.js"), "mixed");
	assert.equal(rename("tests/a.test.js", "tests/b.test.js"), "tests");
	assert.equal(rename("tests/a.test.js", "lib/a.js"), "mixed");
	const nested = (path) => classifyCommit([{ status: "A", path }]).kind;
	assert.equal(nested("packages/api/tests/a.js"), "tests");
	assert.equal(nested("svc/src/test/java/AppTest.java"), "tests");
	assert.equal(nested("pkg/test_app.py"), "tests");
});

test("classifyCommit labels tests, code, mixed and empty commits with the default globs", () => {
	const kind = (...paths) => classifyCommit(paths.map((path) => ({ status: "M", path }))).kind;
	assert.equal(kind("tests/a.js", "src/a.spec.ts", "pkg/__tests__/x.js", "a.test.js"), "tests");
	assert.equal(kind("src/a.js", "README.md"), "code");
	assert.equal(kind("tests/a.js", "src/a.js"), "mixed");
	assert.equal(kind(), "empty");
	assert.equal(classifyCommit([{ status: "D", path: "tests/a.js" }]).addsOrChangesTests, false);
	assert.equal(classifyCommit([{ status: "A", path: "lib/x.js" }], ["lib/**"]).kind, "tests");
	assert.ok(DEFAULT_TEST_GLOBS.includes("**/*.spec.*"));
});

test("evaluateBugRule passes when a tests-only commit precedes the first code change", () => {
	const v = evaluateBugRule([commit("tests"), commit("code"), commit("code")]);
	assert.equal(v.ok, true);
	assert.equal(v.testIndex, 0);
	assert.equal(v.fixIndex, 1);
});

test("evaluateBugRule fails when code comes first, when tests and code are mixed, and when tests only come later", () => {
	assert.equal(evaluateBugRule([commit("code"), commit("tests")]).ok, false);
	const mixed = evaluateBugRule([commit("mixed")]);
	assert.equal(mixed.ok, false);
	assert.match(mixed.reason, /mixes tests and non-test changes/);
	assert.equal(evaluateBugRule([commit("empty"), commit("code")]).ok, false);
	assert.equal(evaluateBugRule([commit("tests", { addsOrChangesTests: false }), commit("code")]).ok, false);
	assert.match(evaluateBugRule([commit("code")]).reason, /no tests-only commit precedes/);
});

test("evaluateBugRule: an empty range fails, a tests-only range has nothing to order", () => {
	assert.equal(evaluateBugRule([]).ok, false);
	assert.equal(evaluateBugRule([commit("tests")]).ok, true);
});

test("parseArgs validates options", () => {
	assert.throws(() => parseArgs([]), /--git <base>\.\.<head> is required/);
	assert.throws(() => parseArgs(["--git", "main"]), /range/);
	assert.throws(() => parseArgs(["--git", "a..b", "--tests", " , "]), /at least one glob/);
	assert.throws(() => parseArgs(["--git", "a..b", "--defect", " "]), /--defect/);
	assert.throws(() => parseArgs(["--git", "a..b", "--bogus"]), /unknown argument/);
	assert.throws(() => parseArgs(["--git"]), /needs a value/);
	const opts = parseArgs(["--git", "a..b", "--tests", "src/**/*.t.js, spec/**", "--defect", "#12"]);
	assert.deepEqual(opts.tests, ["src/**/*.t.js", "spec/**"]);
	assert.equal(opts.defect, "#12");
});

test("CLI: tests committed before the fix passes and prints the commit order", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/price.js": "export const add = (a, b) => a - b;\n", "tests/price.test.js": "expect(add(1, 1)).toBe(0);\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-7-add");
		repo.commit("test: add fails for 1 + 1", { "tests/price.test.js": "expect(add(1, 1)).toBe(2);\n" });
		repo.commit("fix: add sums", { "src/price.js": "export const add = (a, b) => a + b;\n" });
		const { code, out } = await run(["--git", "main..HEAD", "--defect", "#7"], { cwd: repo.dir });
		assert.equal(code, 0);
		assert.match(out, /^Bug rule for main\.\.HEAD \(defect: #7\)/);
		assert.match(out, /^1 [0-9a-f]{7} tests test: add fails for 1 \+ 1$/m);
		assert.match(out, /^2 [0-9a-f]{7} code {2}fix: add sums$/m);
		assert.match(out, /^PASS: /m);
		assert.match(out, /test-probe skill/);
	} finally {
		repo.cleanup();
	}
});

test("CLI: fix before test, or both in one commit, fails", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "a\n", "tests/a.test.js": "t\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-8-a");
		repo.commit("fix first", { "src/a.js": "b\n" });
		repo.commit("test later", { "tests/a.test.js": "t2\n" });
		const first = await run(["--git", "main..HEAD"], { cwd: repo.dir });
		assert.equal(first.code, 1);
		assert.match(first.out, /FAIL: no tests-only commit precedes/);
		repo.git("checkout", "-q", "main");
		repo.git("checkout", "-q", "-b", "fix/issue-9-b");
		repo.commit("both", { "src/a.js": "c\n", "tests/a.test.js": "t3\n" });
		const both = await run(["--git", "main..HEAD"], { cwd: repo.dir });
		assert.equal(both.code, 1);
		assert.match(both.out, /^1 [0-9a-f]{7} mixed both$/m);
		assert.match(both.out, /mixes tests and non-test changes/);
	} finally {
		repo.cleanup();
	}
});

test("CLI: --tests overrides the globs and --json is machine readable", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "a\n", "checks/a.js": "t\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-10-c");
		repo.commit("check", { "checks/a.js": "t2\n" });
		repo.commit("fix", { "src/a.js": "b\n" });
		assert.equal((await run(["--git", "main..HEAD"], { cwd: repo.dir })).code, 1);
		const { code, out } = await run(["--git", "main..HEAD", "--tests", "checks/**", "--json"], { cwd: repo.dir });
		assert.equal(code, 0);
		const parsed = JSON.parse(out);
		assert.equal(parsed.ok, true);
		assert.deepEqual(parsed.commits.map((c) => c.kind), ["tests", "code"]);
	} finally {
		repo.cleanup();
	}
});

test("CLI: a commit that only deletes a test does not count as the failing check", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "a\n", "tests/a.test.js": "t\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-11-d");
		repo.commit("remove test", {}, ["tests/a.test.js"]);
		repo.commit("fix", { "src/a.js": "b\n" });
		const { code, out } = await run(["--git", "main..HEAD"], { cwd: repo.dir });
		assert.equal(code, 1);
		assert.match(out, /^1 [0-9a-f]{7} tests remove test$/m);
	} finally {
		repo.cleanup();
	}
});

test("CLI: merge commits are skipped", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "a\n" });
		repo.git("checkout", "-q", "-b", "fix/issue-12-e");
		repo.commit("test", { "tests/a.test.js": "t\n" });
		repo.git("checkout", "-q", "main");
		repo.commit("other", { "docs/x.md": "x\n" });
		repo.git("checkout", "-q", "fix/issue-12-e");
		repo.git("merge", "-q", "--no-ff", "-m", "merge main", "main");
		repo.commit("fix", { "src/a.js": "b\n" });
		const { code, out } = await run(["--git", "main..HEAD"], { cwd: repo.dir });
		assert.equal(code, 0);
		assert.doesNotMatch(out, /merge main/);
	} finally {
		repo.cleanup();
	}
});

test("CLI: bad refs, empty ranges and usage errors exit 1", async () => {
	const repo = tempRepo();
	try {
		repo.commit("base", { "src/a.js": "a\n" });
		for (const args of [[], ["--git", "main"], ["--git", "nope..HEAD"]]) {
			const { code, out } = await run(args, { cwd: repo.dir });
			assert.equal(code, 1, args.join(" "));
			assert.match(out, /^bug-rule: /);
			assert.equal(out.split("\n").length, 1);
		}
		const empty = await run(["--git", "HEAD..HEAD"], { cwd: repo.dir });
		assert.equal(empty.code, 1);
		assert.match(empty.out, /FAIL: no commits in the range/);
	} finally {
		repo.cleanup();
	}
});
