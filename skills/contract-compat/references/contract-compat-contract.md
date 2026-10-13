# Contract Compatibility Contract

The Contract & Schema Compatibility gate guarantees that a public interface never breaks silently. It compares the **base** contract (the version consumers use today) with the **head** contract (the version in the change) and classifies every difference as `BREAKING` or `compatible`.

The gate is deterministic and offline. It compares two JSON files and reads nothing else.

---

## 1. Inputs

| Input | Flag | Content |
|---|---|---|
| Base contract | `--base <old.json>` | The released contract, for example `git show origin/main:openapi.json > base.json` |
| Head contract | `--head <new.json>` | The contract of the change |
| Decision record | `--allow-breaking <decision-record.md>` | Optional. Releases breaking changes when it is an accepted, signed decision record |

Supported documents:

- **OpenAPI 3.x JSON** (a top-level `openapi` field starting with `3.`).
- **Plain JSON Schema** JSON (anything else that is a JSON object).

Not supported, each with a clear error:

- **YAML.** Convert to JSON first (for example `npx js-yaml openapi.yaml > openapi.json`).
- **Swagger 2.0** and OpenAPI versions other than 3.x.
- **External `$ref`.** Only local `#/...` references are resolved. Bundle the document first.
- **Pact consumer contracts.** Out of scope for now. A Pact adapter is a possible future addition.

Base and head must be the same kind of document.

---

## 2. What Is Breaking

### OpenAPI 3.x

| Area | Breaking | Compatible |
|---|---|---|
| Paths and operations | A path or an operation (method) is removed | A path or operation is added |
| Responses | A declared response status is removed. A response media type is removed. A response header is removed | A response status, media type, or header is added |
| Response schema | A property is removed. A property type changes. An enum value is added (clients never saw it). An enum constraint is removed. A property is no longer guaranteed (removed from `required`). The schema is removed from a media type | A property is added. An enum value is removed. An enum constraint is added. A property becomes always present |
| Parameters | A new required parameter. A parameter becomes required. A parameter changes location (for example query to header). A parameter schema changes incompatibly | A new optional parameter. A parameter is no longer required. A parameter is removed (the server ignores it) |
| Request body | A new required request body. The body becomes required. A request media type is removed | A request body is added or removed. A request media type is added |
| Request schema | A new required property. A property becomes required. A property type changes. An enum value is removed. An enum or type constraint is added. A schema appears on a media type that had none. `additionalProperties` becomes `false` on a schema that was open. A bound is tightened (`minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, ...). A `pattern` or `format` is added or changed | A new optional property. An enum value is added. A property is removed (unless the head schema rejects additional properties). A type is widened. A bound is relaxed |
| Security | A security requirement is added to an operation, or an alternative that clients used is no longer accepted | Another alternative is added, or security is removed |

The effective security of an operation is its own `security`, else the document's `security`, else none.

### Plain JSON Schema

A plain schema has no request or response side, so both directions are checked and the union is reported: a property removal, a new required property, a type change, an enum value removed or added, and so on are all `BREAKING`.

### How Types Are Judged

- Request direction: breaking when a type the base accepted is no longer accepted (`integer` is covered by `number`).
- Response direction: breaking when the head can return a type the base never returned.
- `nullable: true` is treated as the type `null`.
- `allOf` is merged before comparison. `oneOf` / `anyOf` variants are matched **by position**. Fewer variants in a request, or more variants in a response, is breaking. A `oneOf` / `anyOf` added or removed outright is breaking.
- Cyclic `$ref` is handled. A cyclic `allOf` is an error.

---

## 3. Output and Exit Codes

One line per change on stdout, breaking changes first:

```
BREAKING GET:/users/{id} response 200 application/json address.zip: property removed
BREAKING DELETE:/users/{id} operation removed
compatible GET:/users new optional parameter query:q
```

Format: `BREAKING|compatible <path> <what>`. The path is `<METHOD>:<path>` for an operation, the path alone for a removed path, and `schema` for plain JSON Schema. Schema locations use `a.b` for properties, `[]` for array items, and `<oneOf[i]>` for variants. The one-line verdict goes to stderr.

| Exit code | Meaning |
|---|---|
| 0 | No breaking change, or every breaking change is released by a valid `--allow-breaking` record |
| 1 | A breaking change without a valid record, an unreadable or unsupported document, or a bad argument |

---

## 4. Breaking Changes Need a Signed Decision Record

A breaking public contract is a **Critical** blast radius. It needs a decision record that the Architect signs, and a staged rollout. `--allow-breaking` accepts a record only when all of these hold:

- The file exists.
- Its `Status` line is `Accepted`. In the header block (`- **Status:** Accepted` or `Status: Accepted`) or under a `## Status` heading. `Drafted`, `Proposed`, `Rejected`, and `Superseded` do not release anything.
- Its `Signature` line is `Signed by <name> (Architect) on YYYY-MM-DD`: the role is exactly `Architect` (governance assigns a public contract change to the Architect), the name is a person (an AI name such as `Copilot` or a placeholder such as `<name>` is rejected), and the date is a real date. AI drafts the record. The Architect signs it.

Breaking lines are still printed when a record releases them, so the pull request shows exactly what was approved. The script does not check that the record covers *these* changes: reviewers do, through the decision record link in the pull request.

---

## 5. Where It Runs

- **Agent loop (Code):** before committing a change that touches an API contract or a schema.
- **CI (Prove):** base from the target branch, head from the pull request. A failure triggers auto-remediation: the agent restores compatibility (for example adds the field back or makes the new one optional). It never edits the base contract or fabricates a decision record.

---

## 6. Anti-Patterns & Prohibitions

1. **No silent breaking changes.** Add a new version or an optional field instead of changing meaning.
2. **No AI-signed decision records.** The agent may draft one. The Architect signs.
3. **No editing the base file** to make the diff disappear.
4. **No loosening a contract to pass tests** (for example removing `required` from a response).
