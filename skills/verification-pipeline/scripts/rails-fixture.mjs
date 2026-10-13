import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG } from "./rails-check.mjs";

const references = join(dirname(fileURLToPath(import.meta.url)), "..", "references");

export const verifyTemplate = readFileSync(join(references, "verify.yml"), "utf8");
export const remediateTemplate = readFileSync(join(references, "remediate.yml"), "utf8");

export function apmYml({ skills = DEFAULT_CONFIG.skills, agents = DEFAULT_CONFIG.agents } = {}) {
	return [
		"name: demo-app",
		"version: 1.0.0",
		"dependencies:",
		"  apm:",
		...agents.map((a) => `    - alten-group/coding-pal/agents/${a}`),
		...skills.map((s) => `    - alten-group/coding-pal/skills/${s}`),
		"",
	].join("\n");
}

/** Creates a project that has every Platform Rails item. Pass overrides to change or remove (null) a file. */
export function railsProject(overrides = {}) {
	const root = mkdtempSync(join(tmpdir(), "rails-check-"));
	const files = {
		".github/workflows/verify.yml": verifyTemplate,
		".github/workflows/remediate.yml": remediateTemplate,
		".github/pull_request_template.md": "## Summary\n",
		"apm.yml": apmYml(),
		...Object.fromEntries(DEFAULT_CONFIG.skills.map((s) => [`.agents/skills/${s}/SKILL.md`, `---\nname: ${s}\n---\n`])),
		...overrides,
	};
	for (const [rel, content] of Object.entries(files)) {
		if (content === null) continue;
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), content);
	}
	return root;
}
