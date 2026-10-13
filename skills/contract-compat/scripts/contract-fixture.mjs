export const clone = (value) => JSON.parse(JSON.stringify(value));

/** OpenAPI 3.0 contract with local $refs: users list/create/get, bearer security on writes. */
export const baseApi = {
	openapi: "3.0.3",
	info: { title: "Users API", version: "1.0.0" },
	paths: {
		"/users": {
			get: {
				parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 100 } }],
				responses: {
					200: { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/User" } } } } },
					400: { description: "bad request" },
				},
			},
			post: {
				security: [{ bearer: [] }],
				requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NewUser" } } } },
				responses: { 201: { description: "created", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
			},
		},
		"/users/{id}": {
			parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
			get: {
				responses: { 200: { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } }, 404: { description: "missing" } },
			},
			delete: { security: [{ bearer: [] }], responses: { 204: { description: "deleted" } } },
		},
	},
	components: {
		securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
		schemas: {
			User: {
				type: "object",
				required: ["id", "email"],
				properties: {
					id: { type: "string" },
					email: { type: "string", format: "email" },
					role: { type: "string", enum: ["admin", "viewer"] },
					address: { $ref: "#/components/schemas/Address" },
				},
			},
			Address: { type: "object", properties: { zip: { type: "string" }, city: { type: "string" } } },
			NewUser: {
				type: "object",
				required: ["email"],
				properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin", "viewer"] }, age: { type: "integer", minimum: 0 } },
			},
		},
	},
};

export const baseSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	required: ["id"],
	properties: {
		id: { type: "string" },
		status: { type: "string", enum: ["open", "closed"] },
		owner: { $ref: "#/$defs/Owner" },
	},
	$defs: { Owner: { type: "object", properties: { name: { type: "string" } } } },
};

export const acceptedRecord = `# Decision: Remove the legacy role field from the Users API

- **Status:** Accepted
- **Date:** 2026-10-13
- **Type:** contract-change
- **Deciders:** Ada Lovelace (Architect), Grace Hopper (Product Owner)
- **Signature:** Signed by Ada Lovelace (Architect) on 2026-10-13

## Decision
Remove \`role\` in v2 with a staged rollout.
`;
