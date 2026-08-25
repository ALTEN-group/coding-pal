import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseSpecFile, SpecDocsError, validateSpecDir } from "./spec-docs.mjs";

const validSpec = `# Auth routes

### POST /login
- **Purpose:** Authenticates a user with email and password from the request body.
- **Inputs:** \`req.body.email\`, \`req.body.password\`
- **Outputs:** 200 JSON with a token, or 401
- **Side effects:** Writes a session cookie
- **Tests:** \`tests/routes/auth.test.js\`

## Ambiguous or undocumented

_None._
`;

test("parses a valid spec file", () => {
	const parsed = parseSpecFile(validSpec, { filename: "routes-auth.md" });
	assert.equal(parsed.title, "Auth routes");
	assert.equal(parsed.components.length, 1);
	assert.equal(parsed.components[0].name, "POST /login");
	assert.match(parsed.ambiguous, /_None\._/);
});

test("rejects a bad filename", () => {
	assert.throws(
		() => parseSpecFile(validSpec, { filename: "Routes Auth.md" }),
		(error) => error instanceof SpecDocsError && /invalid spec filename/.test(error.message),
	);
});

test("rejects missing fields", () => {
	const missing = validSpec.replace("- **Tests:** `tests/routes/auth.test.js`\n", "");
	assert.throws(
		() => parseSpecFile(missing, { filename: "routes-auth.md" }),
		(error) => error instanceof SpecDocsError && /missing Tests/.test(error.message),
	);
});

test("rejects a missing ambiguous section", () => {
	const missing = validSpec.replace("## Ambiguous or undocumented\n\n_None._\n", "");
	assert.throws(
		() => parseSpecFile(missing, { filename: "routes-auth.md" }),
		(error) => error instanceof SpecDocsError && /exactly one level-two heading/.test(error.message),
	);
});

test("rejects files over 400 lines", () => {
	const padded = `${validSpec}${"\n".repeat(400)}`;
	assert.throws(
		() => parseSpecFile(padded, { filename: "routes-auth.md" }),
		(error) => error instanceof SpecDocsError && /exceeds 400 lines/.test(error.message),
	);
});

test("validateSpecDir accepts a directory of valid files", async () => {
	const dir = await mkdtemp(join(tmpdir(), "spec-docs-"));
	try {
		await writeFile(join(dir, "routes-auth.md"), validSpec);
		const files = await validateSpecDir(dir);
		assert.equal(files.length, 1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("validateSpecDir rejects an empty directory", async () => {
	const dir = await mkdtemp(join(tmpdir(), "spec-docs-empty-"));
	try {
		await assert.rejects(
			() => validateSpecDir(dir),
			(error) => error instanceof SpecDocsError && /no Markdown spec files/.test(error.message),
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
