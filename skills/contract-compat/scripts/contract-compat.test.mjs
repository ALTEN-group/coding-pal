import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CompatError, checkDecisionRecord, compareContracts, documentKind, formatChange, parseDocument, runContractCompat } from "./contract-compat.mjs";
import { acceptedRecord, baseApi, baseSchema, clone } from "./contract-fixture.mjs";

const lines = (base, head) => compareContracts(base, head).changes.map(formatChange);
const diff = (mutate, base = baseApi) => {
	const head = clone(base);
	mutate(head);
	return lines(base, head);
};
const schemas = (doc) => doc.components.schemas;
const has = (out, kind, at, what) => assert.ok(out.some((l) => l.startsWith(`${kind} ${at} `) && l.includes(what)), `expected ${kind} ${at} ${what} in:\n${out.join("\n")}`);
const breaking = (out, at, what) => has(out, "BREAKING", at, what);
const compatible = (out, at, what) => has(out, "compatible", at, what);

test("identical contracts have no changes", () => {
	assert.deepEqual(lines(baseApi, clone(baseApi)), []);
	assert.deepEqual(lines(baseSchema, clone(baseSchema)), []);
});

test("removing a path, an operation, or a declared response status is breaking", () => {
	breaking(diff((d) => delete d.paths["/users/{id}"]), "/users/{id}", "path removed");
	breaking(diff((d) => delete d.paths["/users/{id}"].delete), "DELETE:/users/{id}", "operation removed");
	breaking(diff((d) => delete d.paths["/users"].get.responses[400]), "GET:/users", "response 400 removed");
	breaking(diff((d) => delete d.paths["/users"].get.responses[200].content["application/json"]), "GET:/users", "response 200 media type application/json removed");
	const withHeader = clone(baseApi);
	withHeader.paths["/users"].get.responses[200].headers = { "X-Total": { schema: { type: "integer" } } };
	breaking(lines(withHeader, baseApi), "GET:/users", "response 200 header X-Total removed");
});

test("response schema changes: removed property, changed type, added enum value, no longer required", () => {
	const out = diff((d) => {
		const user = schemas(d).User;
		delete user.properties.email;
		user.required = ["id"];
		user.properties.id.type = "integer";
		user.properties.role.enum = ["admin", "viewer", "owner"];
		schemas(d).Address.properties.zip.type = "number";
	});
	breaking(out, "GET:/users/{id}", "response 200 application/json email: property removed");
	breaking(out, "GET:/users/{id}", "response 200 application/json id: type changed string -> integer");
	breaking(out, "GET:/users/{id}", 'role: enum value "owner" added');
	breaking(out, "GET:/users/{id}", "address.zip: type changed string -> number");
});

test("response enums: a value clients never saw is breaking, fewer values or a removed enum are judged by direction", () => {
	compatible(diff((d) => (schemas(d).User.properties.role.enum = ["admin"])), "GET:/users/{id}", 'role: enum value "viewer" removed');
	breaking(diff((d) => delete schemas(d).User.properties.role.enum), "GET:/users/{id}", "role: enum constraint removed");
	const out = diff((d) => (schemas(d).NewUser.properties.role.enum = ["admin"]));
	breaking(out, "POST:/users", 'role: enum value "viewer" removed');
});

test("a response schema that disappears is breaking, a request schema that appears is breaking", () => {
	breaking(diff((d) => delete d.paths["/users/{id}"].get.responses[200].content["application/json"].schema), "GET:/users/{id}", "response 200 application/json: schema removed");
	compatible(diff((d) => delete d.paths["/users"].post.requestBody.content["application/json"].schema), "POST:/users", "request body application/json: schema removed");
	const bare = clone(baseApi);
	delete bare.paths["/users"].post.requestBody.content["application/json"].schema;
	breaking(lines(bare, baseApi), "POST:/users", "request body application/json: schema added");
});

test("a response property that becomes optional is breaking", () => {
	breaking(diff((d) => (schemas(d).User.required = ["id"])), "GET:/users/{id}", "email: property is no longer guaranteed (now optional)");
});

test("response additions are compatible", () => {
	const out = diff((d) => {
		schemas(d).User.properties.nickname = { type: "string" };
		d.paths["/users"].get.responses[500] = { description: "boom" };
		d.paths["/users"].get.responses[200].headers = { "X-Total": { schema: { type: "integer" } } };
		d.paths["/health"] = { get: { responses: { 200: { description: "ok" } } } };
		d.paths["/users/{id}"].put = { responses: { 200: { description: "ok" } } };
	});
	compatible(out, "GET:/users/{id}", "nickname: property added");
	compatible(out, "GET:/users", "response 500 added");
	compatible(out, "GET:/users", "response 200 header X-Total added");
	compatible(out, "GET:/health", "operation added");
	compatible(out, "PUT:/users/{id}", "operation added");
	assert.ok(!out.some((l) => l.startsWith("BREAKING")));
});

test("request: new required parameter, parameter made required, location changed", () => {
	const out = diff((d) => {
		d.paths["/users"].get.parameters.push({ name: "tenant", in: "header", required: true, schema: { type: "string" } });
	});
	breaking(out, "GET:/users", "new required parameter header:tenant");
	breaking(diff((d) => (d.paths["/users"].get.parameters[0].required = true)), "GET:/users", "parameter query:limit made required");
	breaking(diff((d) => (d.paths["/users"].get.parameters[0].in = "header")), "GET:/users", "parameter limit location changed from query to header");
	breaking(diff((d) => (d.paths["/users"].get.parameters[0].schema.type = "string")), "GET:/users", "parameter query:limit: type changed integer -> string");
	breaking(diff((d) => (d.paths["/users"].get.parameters[0].schema.maximum = 10)), "GET:/users", "maximum tightened");
});

test("request: compatible parameter changes", () => {
	const out = diff((d) => {
		d.paths["/users"].get.parameters.push({ name: "q", in: "query", schema: { type: "string" } });
		d.paths["/users"].get.parameters[0].schema.maximum = 500;
	});
	compatible(out, "GET:/users", "new optional parameter query:q");
	compatible(out, "GET:/users", "maximum relaxed");
	compatible(diff((d) => d.paths["/users"].get.parameters.shift()), "GET:/users", "parameter query:limit removed");
});

test("request body: required property, type change, enum removal, requiredness, media type", () => {
	const out = diff((d) => {
		const s = schemas(d).NewUser;
		s.required.push("role");
		s.properties.age.type = "string";
		s.properties.role.enum = ["admin"];
		s.properties.nickname = { type: "string" };
		s.required.push("nickname");
	});
	breaking(out, "POST:/users", "request body application/json role: property is now required");
	breaking(out, "POST:/users", "age: type changed integer -> string");
	breaking(out, "POST:/users", 'role: enum value "viewer" removed');
	breaking(out, "POST:/users", "nickname: new required property");
	breaking(diff((d) => (d.paths["/users"].post.requestBody.content = { "text/plain": { schema: { type: "string" } } })), "POST:/users", "request body media type application/json removed");
	assert.ok(diff((d) => (d.paths["/users"].get.requestBody = { required: true, content: {} })).some((l) => l === "BREAKING GET:/users new required request body"));
	compatible(diff((d) => (d.paths["/users"].get.requestBody = { content: {} })), "GET:/users", "request body added");
	compatible(diff((d) => delete d.paths["/users"].post.requestBody), "POST:/users", "request body removed");
	const optional = clone(baseApi);
	optional.paths["/users"].post.requestBody.required = false;
	breaking(lines(optional, baseApi), "POST:/users", "request body is now required");
});

test("request body: compatible additions and relaxations", () => {
	const out = diff((d) => {
		const s = schemas(d).NewUser;
		s.properties.nickname = { type: "string" };
		s.properties.role.enum.push("owner");
		s.required = [];
		s.properties.age.type = ["integer", "null"];
		delete s.properties.age.minimum;
	});
	compatible(out, "POST:/users", "nickname: new optional property");
	compatible(out, "POST:/users", 'role: enum value "owner" added');
	compatible(out, "POST:/users", "email: property is no longer required");
	compatible(out, "POST:/users", "age: type widened integer -> integer|null");
	compatible(out, "POST:/users", "age: minimum removed");
	assert.ok(!out.some((l) => l.startsWith("BREAKING")));
});

test("request: additionalProperties false on a previously open schema, and tightened constraints", () => {
	const out = diff((d) => {
		const s = schemas(d).NewUser;
		s.additionalProperties = false;
		s.properties.email.pattern = "^.+@acme\\.com$";
		s.properties.age.minimum = 18;
		s.properties.role.enum = undefined;
		s.properties.role.type = "string";
	});
	breaking(out, "POST:/users", "additionalProperties set to false");
	breaking(out, "POST:/users", "email: pattern added");
	breaking(out, "POST:/users", "age: minimum tightened");
	const closed = clone(baseApi);
	schemas(closed).NewUser.additionalProperties = false;
	assert.ok(!lines(closed, baseApi).some((l) => l.includes("additionalProperties")));
	const dropped = clone(baseApi);
	schemas(dropped).NewUser.additionalProperties = false;
	const head = clone(dropped);
	delete head.components.schemas.NewUser.properties.age;
	breaking(lines(dropped, head), "POST:/users", "age: property removed and additional properties are rejected");
	compatible(diff((d) => delete schemas(d).NewUser.properties.age), "POST:/users", "age: property removed (ignored by the server)");
});

test("a type constraint added to a request is breaking, added to a response is compatible", () => {
	const loose = clone(baseApi);
	delete schemas(loose).NewUser.properties.age.type;
	breaking(lines(loose, baseApi), "POST:/users", "age: type constraint added (integer)");
	const looseResponse = clone(baseApi);
	delete schemas(looseResponse).User.properties.id.type;
	compatible(lines(looseResponse, baseApi), "GET:/users/{id}", "id: type constraint added (string)");
	breaking(lines(baseApi, looseResponse), "GET:/users/{id}", "id: type constraint removed (was string)");
});

test("nullable and type widening follow the direction of the data", () => {
	const nullable = clone(baseApi);
	schemas(nullable).User.properties.id.nullable = true;
	breaking(lines(baseApi, nullable), "GET:/users/{id}", "id: type changed string -> null|string");
	compatible(lines(nullable, baseApi), "GET:/users/{id}", "id: type narrowed null|string -> string");
	const integer = clone(baseApi);
	schemas(integer).NewUser.properties.age.type = "number";
	compatible(lines(baseApi, integer), "POST:/users", "age: type widened integer -> number");
});

test("security: a requirement added to an operation is breaking, relaxed or extended is not", () => {
	breaking(diff((d) => (d.paths["/users"].get.security = [{ bearer: [] }])), "GET:/users", "security requirement added");
	breaking(diff((d) => (d.security = [{ bearer: [] }])), "GET:/users/{id}", "security requirement added");
	breaking(diff((d) => (d.paths["/users"].post.security = [{ apiKey: [] }])), "POST:/users", "security requirement changed");
	breaking(diff((d) => (d.paths["/users"].post.security = [{ bearer: ["write"], apiKey: [] }, { bearer: ["admin"] }])), "POST:/users", "security requirement changed");
	assert.ok(!diff((d) => (d.paths["/users"].post.security = [{ bearer: [] }, { apiKey: [] }])).some((l) => l.startsWith("BREAKING")));
	assert.ok(!diff((d) => delete d.paths["/users"].post.security).some((l) => l.startsWith("BREAKING")));
	assert.ok(!diff((d) => (d.paths["/users"].post.security = [{}, { bearer: [] }])).some((l) => l.startsWith("BREAKING")));
});

test("resolves local $ref, reports each consumer of a shared schema, and survives cycles", () => {
	const out = diff((d) => delete schemas(d).Address.properties.zip);
	breaking(out, "GET:/users/{id}", "address.zip: property removed");
	breaking(out, "GET:/users", "address.zip: property removed");
	breaking(out, "POST:/users", "address.zip: property removed");

	const tree = { openapi: "3.1.0", paths: { "/tree": { get: { responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } } } } } } }, components: { schemas: { Node: { type: "object", properties: { child: { $ref: "#/components/schemas/Node" }, name: { type: "string" } } } } } };
	const next = clone(tree);
	next.components.schemas.Node.properties.name.type = "integer";
	breaking(lines(tree, next), "GET:/tree", "name: type changed");
	assert.deepEqual(lines(tree, clone(tree)), []);
});

test("rejects unresolvable and external $ref", () => {
	const broken = clone(baseApi);
	broken.paths["/users/{id}"].get.responses[200].content["application/json"].schema = { $ref: "#/components/schemas/Missing" };
	assert.throws(() => compareContracts(baseApi, broken), /unresolvable \$ref "#\/components\/schemas\/Missing"/);
	const external = clone(baseApi);
	external.paths["/users/{id}"].get.responses[200].content["application/json"].schema = { $ref: "other.json#/User" };
	assert.throws(() => compareContracts(baseApi, external), /unsupported \$ref/);
	const malformed = clone(baseApi);
	malformed.paths["/users/{id}"].get.responses[200].content["application/json"].schema = { $ref: "#/components/%E0%A4%A" };
	assert.throws(() => compareContracts(baseApi, malformed), /malformed \$ref/);
});

test("merges allOf before comparing", () => {
	const base = clone(baseApi);
	schemas(base).Admin = { allOf: [{ $ref: "#/components/schemas/User" }, { type: "object", properties: { level: { type: "integer" } } }] };
	base.paths["/admins"] = { get: { responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Admin" } } } } } } };
	const head = clone(base);
	delete schemas(head).User.properties.email;
	schemas(head).User.required = ["id"];
	schemas(head).Admin.allOf[1].properties.level.type = "string";
	const out = lines(base, head);
	breaking(out, "GET:/admins", "email: property removed");
	breaking(out, "GET:/admins", "level: type changed integer -> string");
	const cyclic = clone(base);
	schemas(cyclic).Loop = { allOf: [{ $ref: "#/components/schemas/Loop" }] };
	cyclic.paths["/loop"] = { get: { responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Loop" } } } } } } };
	assert.throws(() => compareContracts(cyclic, clone(cyclic)), /too deep/);
});

test("oneOf variants are compared by position", () => {
	const base = clone(baseApi);
	schemas(base).Pet = { oneOf: [{ type: "object", properties: { bark: { type: "string" } } }, { type: "object", properties: { meow: { type: "string" } } }] };
	base.paths["/pets"] = { post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } }, responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } } } };
	const head = clone(base);
	schemas(head).Pet.oneOf.pop();
	const out = lines(base, head);
	breaking(out, "POST:/pets", "request body application/json: oneOf variant removed");
	compatible(out, "POST:/pets", "response 200 application/json: oneOf variant removed");
	const added = lines(head, base);
	compatible(added, "POST:/pets", "request body application/json: oneOf variant added");
	breaking(added, "POST:/pets", "response 200 application/json: oneOf variant added");
	const changed = clone(base);
	schemas(changed).Pet.oneOf[0].properties.bark.type = "integer";
	breaking(lines(base, changed), "POST:/pets", "request body application/json <oneOf[0]>.bark: type changed");
	const noOneOf = clone(base);
	delete schemas(noOneOf).Pet.oneOf;
	breaking(lines(base, noOneOf), "POST:/pets", "oneOf removed");
});

test("lists breaking changes first and is deterministic", () => {
	const head = clone(baseApi);
	head.paths["/health"] = { get: { responses: { 200: { description: "ok" } } } };
	delete head.paths["/users/{id}"].delete;
	const first = lines(baseApi, head);
	assert.match(first[0], /^BREAKING /);
	assert.match(first.at(-1), /^compatible /);
	assert.deepEqual(lines(baseApi, head), first);
});

test("compares plain JSON Schema in both directions", () => {
	const out = diff((d) => {
		delete d.properties.id;
		d.required = ["owner"];
		d.properties.status.enum = ["open"];
		d.$defs.Owner.properties.name.type = "integer";
		d.properties.created = { type: "string" };
	}, baseSchema);
	breaking(out, "schema", "id: property removed");
	breaking(out, "schema", "owner: property is now required");
	breaking(out, "schema", 'status: enum value "closed" removed');
	breaking(out, "schema", "owner.name: type changed string -> integer");
	compatible(out, "schema", "created: new optional property");
	breaking(diff((d) => d.properties.status.enum.push("archived"), baseSchema), "schema", 'enum value "archived" added');
	assert.ok(!diff((d) => d.properties.status.enum.push("archived"), baseSchema).some((l) => l.startsWith("compatible") && l.includes("enum value")));
});

test("rejects YAML, Swagger 2, unsupported versions, and mixed kinds", () => {
	assert.throws(() => parseDocument("openapi: 3.0.3\npaths: {}", "base.yaml"), /YAML is not supported/);
	assert.throws(() => documentKind({ swagger: "2.0" }, "base"), /Swagger 2\.0/);
	assert.throws(() => documentKind({ openapi: "4.0.0" }, "head"), /only 3\.x/);
	assert.throws(() => documentKind([], "head"), /JSON object/);
	assert.throws(() => compareContracts(baseApi, baseSchema), /same kind/);
	assert.equal(documentKind(baseApi), "openapi");
	assert.equal(documentKind(baseSchema), "schema");
	assert.ok(new CompatError("x") instanceof Error);
});

test("a decision record must be Accepted and signed by a named Architect on a real date", () => {
	assert.deepEqual(checkDecisionRecord(acceptedRecord), { ok: true, reason: "" });
	assert.deepEqual(checkDecisionRecord("# Decision\n\nStatus: Accepted\nSignature: Signed by Ada Lovelace (Architect) on 2026-10-13\n"), { ok: true, reason: "" });
	assert.match(checkDecisionRecord("# Decision\n\n## Status\n\nProposed\n").reason, /not Accepted/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("Accepted", "Drafted")).reason, /not Accepted/);
	assert.match(checkDecisionRecord("# Decision\n\nNo status here.\n").reason, /no Status line/);
	assert.match(checkDecisionRecord(acceptedRecord.replace(/- \*\*Signature:\*\*.*\n/, "")).reason, /not signed/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("(Architect) on", "(Wizard) on")).reason, /not signed/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("Signed by Ada Lovelace (Architect)", "Drafted: unsigned")).reason, /not signed/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("(Architect) on", "(Product Owner) on")).reason, /Architect decision/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("(Architect) on", "(Developer) on")).reason, /Architect decision/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("Signed by Ada Lovelace", "Signed by Copilot")).reason, /is not a person/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("Ada Lovelace (Architect) on", "<name> (Architect) on")).reason, /is not a person/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("(Architect) on 2026-10-13", "(Architect)")).reason, /Signature line does not match/);
	assert.match(checkDecisionRecord(acceptedRecord.replace("(Architect) on 2026-10-13", "(Architect) on 2026-13-45")).reason, /not a real date/);
});

test("CLI exits 1 on breaking changes unless an accepted signed decision record allows them", async () => {
	const root = await mkdtemp(join(tmpdir(), "compat-"));
	const write = async (name, content) => {
		await writeFile(join(root, name), typeof content === "string" ? content : JSON.stringify(content));
		return join(root, name);
	};
	const head = clone(baseApi);
	delete head.paths["/users/{id}"].delete;
	const base = await write("base.json", baseApi);
	const same = await write("same.json", baseApi);
	const broken = await write("head.json", head);
	const accepted = await write("0007-remove-delete.md", acceptedRecord);
	const drafted = await write("0008-drafted.md", acceptedRecord.replace("Accepted", "Drafted"));
	const unsigned = await write("0009-unsigned.md", acceptedRecord.replace(/- \*\*Signature:\*\*.*\n/, ""));

	const logged = [];
	const { log, error } = console;
	console.log = (line) => logged.push(line);
	console.error = () => {};
	try {
		assert.equal(await runContractCompat(["--base", base, "--head", same]), 0);
		assert.equal(await runContractCompat(["--base", base, "--head", broken]), 1);
		assert.ok(logged.includes("BREAKING DELETE:/users/{id} operation removed"));
		assert.equal(await runContractCompat(["--base", base, "--head", broken, "--allow-breaking", accepted]), 0);
		assert.equal(await runContractCompat(["--base", base, "--head", broken, "--allow-breaking", drafted]), 1);
		assert.equal(await runContractCompat(["--base", base, "--head", broken, "--allow-breaking", unsigned]), 1);
		assert.equal(await runContractCompat(["--base", base, "--head", broken, "--allow-breaking", join(root, "missing.md")]), 1);
		assert.equal(await runContractCompat(["--base", base, "--head", same, "--allow-breaking", drafted]), 0);
		assert.equal(await runContractCompat(["--base", base, "--head", await write("head.yaml", "openapi: 3.0.3")]), 1);
		assert.equal(await runContractCompat(["--base", base, "--head", join(root, "missing.json")]), 1);
		assert.equal(await runContractCompat(["--base", base]), 1);
		assert.equal(await runContractCompat(["--base", base, "--head", same, "--bogus"]), 1);
		assert.equal(await runContractCompat(["--help"]), 0);
	} finally {
		Object.assign(console, { log, error });
	}
});
