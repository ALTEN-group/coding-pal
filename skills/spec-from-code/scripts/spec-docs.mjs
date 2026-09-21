#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FIELD_NAMES = ["Purpose", "Inputs", "Outputs", "Side effects", "Tests"];
const MAX_LINES = 400;
const FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const AMBIGUOUS = "Ambiguous or undocumented";

export class SpecDocsError extends Error {}

function fail(message) {
	throw new SpecDocsError(message);
}

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

function parseComponent(block) {
	const lines = block.split("\n");
	const heading = lines.shift()?.match(/^### (.+)$/);
	if (!heading || !heading[1].trim()) fail("invalid component heading");
	const name = heading[1].trim();
	if (name.length > 160) fail(`component name exceeds 160 characters: ${name.slice(0, 40)}`);

	const fields = {};
	let currentField;
	let lastFieldIndex = -1;
	for (const line of lines) {
		const field = line.match(/^- \*\*(Purpose|Inputs|Outputs|Side effects|Tests):\*\*\s+(.+)$/);
		if (field) {
			currentField = field[1];
			const fieldIndex = FIELD_NAMES.indexOf(currentField);
			if (fieldIndex <= lastFieldIndex) fail(`fields are duplicated or reordered in: ${name}`);
			lastFieldIndex = fieldIndex;
			if (fields[currentField]) fail(`duplicate ${currentField} field in: ${name}`);
			fields[currentField] = field[2].trim();
		} else if (line.trim() && currentField) fields[currentField] += `\n${line.trim()}`;
		else if (line.trim()) fail(`unexpected content in component: ${name}`);
	}

	for (const field of FIELD_NAMES) {
		if (!fields[field]) fail(`missing ${field} field in: ${name}`);
		if (fields[field].length > 2000) fail(`${field} exceeds 2000 characters in: ${name}`);
	}
	return { name, ...fields };
}

export function parseSpecFile(rawMarkdown, { filename } = {}) {
	if (filename && !FILENAME.test(filename)) fail(`invalid spec filename: ${filename}`);
	const markdown = normalizeNewlines(rawMarkdown);
	const lineCount = markdown.split("\n").length;
	if (lineCount > MAX_LINES) fail(`${filename ?? "file"} exceeds ${MAX_LINES} lines`);

	const title = markdown.match(/^# (.+)$/m);
	if (!title) fail(`${filename ?? "file"} must start with a level-one heading`);

	const h2 = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
	if (h2.length !== 1 || h2[0] !== AMBIGUOUS) {
		fail(`${filename ?? "file"} must contain exactly one level-two heading: ## ${AMBIGUOUS}`);
	}

	const split = markdown.search(/^## Ambiguous or undocumented\s*$/m);
	if (split < 0) fail(`${filename ?? "file"} is missing ## ${AMBIGUOUS}`);
	const before = markdown.slice(0, split).trim();
	const ambiguous = markdown.slice(split).replace(/^## Ambiguous or undocumented\s*/, "").trim();
	if (!ambiguous) fail(`${filename ?? "file"} has an empty ambiguous section`);

	const components = [...before.matchAll(/^### /gm)];
	if (!components.length) fail(`${filename ?? "file"} must contain at least one component heading`);

	const bodyAfterTitle = before.replace(/^# .+\n+/, "");
	const parsed = bodyAfterTitle.split(/\n(?=### )/).map((block) => {
		const trimmed = block.trim();
		if (!trimmed.startsWith("### ")) fail(`${filename ?? "file"} has content outside component sections`);
		return parseComponent(trimmed);
	});

	return { title: title[1].trim(), components: parsed, ambiguous };
}

export async function validateSpecDir(dir) {
	let names;
	try {
		names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
	} catch (error) {
		fail(`cannot read spec directory: ${dir} (${error.message})`);
	}
	if (!names.length) fail(`no Markdown spec files in ${dir}`);
	const files = [];
	for (const name of names) {
		const markdown = await readFile(join(dir, name), "utf8");
		files.push({ filename: name, ...parseSpecFile(markdown, { filename: name }) });
	}
	return files;
}

function parseArguments(arguments_) {
	const options = {};
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--dir") options.dir = arguments_[index += 1];
		else fail(`unknown argument: ${argument}`);
	}
	if (!options.dir) fail("usage: spec-docs.mjs --dir DIRECTORY");
	return options;
}

export async function main(arguments_) {
	const options = parseArguments(arguments_);
	const files = await validateSpecDir(options.dir);
	console.log(`spec-docs: ${files.length} file(s) valid`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
	main(process.argv.slice(2)).catch((error) => {
		console.error(`spec-docs: ${error.message}`);
		process.exitCode = 1;
	});
