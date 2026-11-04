import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { DEFAULT_ROUTES, SmokeError, checkRoute, getJsonPath, loadRoutes, parseArgs, probeRoute, runPreviewSmoke, runSmoke, validateRoutes } from "./preview-smoke.mjs";
import { closedUrl, startPreview } from "./preview-smoke-fixture.mjs";

let preview;
before(async () => {
	preview = await startPreview();
});
after(async () => {
	await preview.close();
});

const fast = { timeoutMs: 1000, retries: 3, retryDelayMs: 10 };

async function run(args, options) {
	const log = console.log;
	const err = console.error;
	const out = [];
	console.log = (...a) => out.push(a.join(" "));
	console.error = (...a) => out.push(a.join(" "));
	try {
		const code = await runPreviewSmoke(args, options);
		return { code, out: out.join("\n") };
	} finally {
		console.log = log;
		console.error = err;
	}
}

async function routesFile(routes) {
	const dir = await mkdtemp(join(tmpdir(), "preview-smoke-"));
	const file = join(dir, "routes.json");
	await writeFile(file, typeof routes === "string" ? routes : JSON.stringify(routes));
	return file;
}

test("validateRoutes applies the default status and rejects bad routes", () => {
	assert.deepEqual(validateRoutes([{ path: "/a" }]), [{ path: "/a", status: 200 }]);
	for (const bad of [[], {}, [null], [{ path: "a" }], [{}], [{ path: "/a", status: 99 }], [{ path: "/a", status: "200" }], [{ path: "/a", equals: 1 }], [{ path: "/a", jsonPath: "" }], [{ path: "/a", maxMs: 0 }], [{ path: "/a", nope: 1 }]]) {
		assert.throws(() => validateRoutes(bad), SmokeError, JSON.stringify(bad));
	}
});

test("loadRoutes defaults to /health 200 and reports unreadable or invalid files", async () => {
	assert.deepEqual(await loadRoutes(null), DEFAULT_ROUTES);
	assert.deepEqual(DEFAULT_ROUTES, [{ path: "/health", status: 200 }]);
	await assert.rejects(loadRoutes(join(tmpdir(), "no-routes.json")), /cannot read routes file/);
	await assert.rejects(loadRoutes(await routesFile("{nope")), /not valid JSON/);
	await assert.rejects(loadRoutes(await routesFile([])), /non-empty/);
});

test("getJsonPath reads dotted, indexed and missing paths", () => {
	const body = { status: "ok", items: [{ id: 7 }], nested: { a: { b: false } } };
	assert.equal(getJsonPath(body, "status"), "ok");
	assert.equal(getJsonPath(body, "items[0].id"), 7);
	assert.equal(getJsonPath(body, "items.0.id"), 7);
	assert.equal(getJsonPath(body, "nested.a.b"), false);
	assert.equal(getJsonPath(body, "nested.x.b"), undefined);
	assert.equal(getJsonPath(body, "status.length.x"), undefined);
	for (const inherited of ["constructor", "__proto__", "toString", "items.constructor"]) assert.equal(getJsonPath(body, inherited), undefined, inherited);
});

test("a healthy route passes with the default route list", async () => {
	const results = await runSmoke(preview.url, DEFAULT_ROUTES, fast);
	assert.equal(results[0].ok, true);
	assert.equal(results[0].probe.attempts, 1);
});

test("assertions: status, jsonPath, equals and maxMs, each with its failure", async () => {
	const routes = validateRoutes([
		{ path: "/health", jsonPath: "status", equals: "ok" },
		{ path: "/health", jsonPath: "version.major", equals: 2 },
		{ path: "/items", jsonPath: "items[1].id", equals: 8 },
		{ path: "/missing", status: 404 },
		{ path: "/health", jsonPath: "status" },
	]);
	for (const result of await runSmoke(preview.url, routes, fast)) assert.equal(result.ok, true, JSON.stringify(result.failures));

	const failing = validateRoutes([
		{ path: "/missing" },
		{ path: "/health", jsonPath: "status", equals: "degraded" },
		{ path: "/health", jsonPath: "nothing.here" },
		{ path: "/not-json", jsonPath: "status" },
		{ path: "/slow", maxMs: 20 },
	]);
	const results = await runSmoke(preview.url, failing, fast);
	assert.deepEqual(results.map((r) => r.ok), [false, false, false, false, false]);
	assert.match(results[0].failures[0], /expected status 200, got 404/);
	assert.match(results[1].failures[0], /status expected "degraded", got "ok"/);
	assert.match(results[2].failures[0], /nothing\.here is missing/);
	assert.match(results[3].failures[0], /body is not JSON/);
	assert.match(results[4].failures[0], /over the 20 ms limit/);
});

test("retries while the app is starting, then evaluates once", async () => {
	const p = await startPreview({ flakyFailures: 2 });
	try {
		const probe = await probeRoute(p.url, { path: "/flaky", status: 200 }, fast);
		assert.equal(probe.status, 200);
		assert.equal(probe.attempts, 3);
		assert.equal(p.hits["/flaky"], 3);
	} finally {
		await p.close();
	}
});

test("gives up after the retries and fails on the last 5xx", async () => {
	const [result] = await runSmoke(preview.url, [{ path: "/always-down", status: 200 }], { ...fast, retries: 2 });
	assert.equal(result.probe.attempts, 3);
	assert.equal(result.ok, false);
	assert.match(result.failures[0], /expected status 200, got 500/);
});

test("does not retry a 4xx, or a 5xx the route expects", async () => {
	const p = await startPreview();
	try {
		const four = await probeRoute(p.url, { path: "/missing", status: 200 }, fast);
		assert.equal(four.attempts, 1);
		const five = await probeRoute(p.url, { path: "/teapot", status: 503 }, fast);
		assert.equal(five.attempts, 1);
		assert.deepEqual(checkRoute({ path: "/teapot", status: 503 }, five), []);
	} finally {
		await p.close();
	}
});

test("redirects are not followed so a 302 can be asserted", async () => {
	const [result] = await runSmoke(preview.url, [{ path: "/redirect", status: 302 }], fast);
	assert.equal(result.ok, true);
});

test("connection errors are retried and reported as the app not answering", async () => {
	const url = await closedUrl();
	const [result] = await runSmoke(url, DEFAULT_ROUTES, { ...fast, retries: 1 });
	assert.equal(result.ok, false);
	assert.equal(result.probe.attempts, 2);
	assert.match(result.failures[0], /app not answering/);
});

test("a hanging route times out", async () => {
	const [result] = await runSmoke(preview.url, [{ path: "/hang", status: 200 }], { timeoutMs: 100, retries: 0, retryDelayMs: 1 });
	assert.equal(result.ok, false);
	assert.match(result.failures[0], /no response within 100 ms/);
});

test("parseArgs validates options", () => {
	assert.throws(() => parseArgs([]), /--url is required/);
	assert.throws(() => parseArgs(["--url"]), /needs a value/);
	assert.throws(() => parseArgs(["--url", "not a url"]), /not a valid URL/);
	assert.throws(() => parseArgs(["--url", "ftp://x"]), /http or https/);
	assert.throws(() => parseArgs(["--url", "http://x", "--timeout-ms", "0"]), /integer >= 1/);
	assert.throws(() => parseArgs(["--url", "http://x", "--retries", "-1"]), /integer >= 0/);
	assert.throws(() => parseArgs(["--url", "http://x", "--retry-delay-ms", "abc"]), /integer >= 0/);
	assert.throws(() => parseArgs(["--url", "http://x", "--bogus"]), /unknown argument/);
	assert.deepEqual(parseArgs(["--url", "http://x"]), { url: "http://x", routes: null, timeoutMs: 5000, retries: 3, retryDelayMs: 1000 });
});

test("CLI: all routes passing exits 0 with per-route lines", async () => {
	const file = await routesFile([{ path: "/health", status: 200, jsonPath: "status", equals: "ok", maxMs: 2000 }, { path: "/items" }]);
	const { code, out } = await run(["--url", `${preview.url}/`, "--routes", file, "--retry-delay-ms", "10"]);
	assert.equal(code, 0);
	assert.match(out, /^PASS GET \/health 200 \d+ ms$/m);
	assert.match(out, /^PASS: 2\/2 routes passed$/m);
});

test("CLI: a failing route exits 1 and lists the failure", async () => {
	const file = await routesFile([{ path: "/health" }, { path: "/missing" }]);
	const { code, out } = await run(["--url", preview.url, "--routes", file, "--retry-delay-ms", "10"]);
	assert.equal(code, 1);
	assert.match(out, /^FAIL GET \/missing 404/m);
	assert.match(out, /^ {2}- expected status 200, got 404$/m);
	assert.match(out, /^FAIL: 1\/2 routes passed$/m);
});

test("CLI: default /health is used without --routes, and an unreachable app fails", async () => {
	assert.equal((await run(["--url", preview.url])).code, 0);
	const down = await run(["--url", await closedUrl(), "--retries", "0"]);
	assert.equal(down.code, 1);
	assert.match(down.out, /app not answering/);
});

test("CLI: usage and routes errors exit 1 with one line", async () => {
	const bad = await routesFile("[{\"path\": \"nope\"}]");
	for (const args of [[], ["--url", "x"], ["--url", preview.url, "--routes", join(tmpdir(), "missing-routes.json")], ["--url", preview.url, "--routes", bad]]) {
		const { code, out } = await run(args);
		assert.equal(code, 1, args.join(" "));
		assert.match(out, /^preview-smoke: /);
		assert.equal(out.split("\n").length, 1);
	}
});

test("CLI: an injected fetch is honoured", async () => {
	const fetchImpl = async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });
	const file = await routesFile([{ path: "/health", jsonPath: "status", equals: "ok" }]);
	assert.equal((await run(["--url", "http://example.invalid", "--routes", file], { fetchImpl })).code, 0);
});
