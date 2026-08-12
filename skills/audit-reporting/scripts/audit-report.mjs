#!/usr/bin/env node

// This script is a command-line formatter and validator for audit-report Markdown files.
// It does three things:
// - reads an input Markdown file.
// - validates the file follows a strict audit-report structure.
// - rewrites the report into a normalized, canonical format in an output file.
// What it expects:
// - A report wrapped between <!-- AUDIT-REPORT:START --> and <!-- AUDIT-REPORT:END -->
// - An Executive Summary section
// - Three severity sections: Critical, Important, Suggestions
// - Findings written with a strict field order: Location, Category, Evidence, Impact, Recommendation
// What it enforces:
// - File size must stay under 60 KiB
// - No unsafe control characters
// - The audit marker block must appear exactly once
// - Sections must appear in the right order
// - Each finding must have all required fields
// - Location must be written in backticks and stay inside allowed scopes, if scopes are provided
// - Limits on lengths for title, category, and description fields
// - No duplicate findings with the same severity, location, and title
// - No more than 20 findings total
// What it outputs:

// A normalized Markdown report with:
// numbered audit identifiers like AUDIT-001
// findings sorted by severity, then location, then title
// consistent formatting
// section counts in the headings

// How it is used:

// Run it with --input, --output, and optional --scope arguments
// It reads the source report, normalizes it, and writes the cleaned version to the output file
// So the script is basically a strict audit-report linter plus formatter for the workspace.

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const START_MARKER = "<!-- AUDIT-REPORT:START -->";
const END_MARKER = "<!-- AUDIT-REPORT:END -->";
const SEVERITIES = ["Critical", "Important", "Suggestions"];
const FIELD_NAMES = ["Location", "Category", "Evidence", "Impact", "Recommendation"];
const MAX_INPUT_BYTES = 60 * 1024;
const MAX_FINDINGS = 20;

export class AuditReportError extends Error {}

function fail(message) {
	throw new AuditReportError(message);
}

function normalizeNewlines(value) {
	return value.replace(/\r\n?/g, "\n");
}

function markerBounds(markdown) {
	const start = markdown.indexOf(START_MARKER);
	const end = markdown.indexOf(END_MARKER);
	if (start < 0 || end < 0 || end < start) fail("missing or reordered report markers");
	if (markdown.indexOf(START_MARKER, start + 1) >= 0 || markdown.indexOf(END_MARKER, end + 1) >= 0) {
		fail("report markers must appear exactly once");
	}
	return [start, end + END_MARKER.length];
}

function parseLocation(value, scopes) {
	const match = value.match(/^`([^`\n]+)`$/);
	if (!match) fail("Location must be wrapped in backticks");
	const location = match[1];
	const path = location.replace(/:\d+$/, "");
	if (path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
		fail(`invalid repository-relative location: ${location}`);
	}
	if (scopes.length && !scopes.some((scope) => path === scope || path.startsWith(`${scope}/`))) {
		fail(`location is outside configured scopes: ${location}`);
	}
	return location;
}

function parseFinding(block, severity, scopes) {
	const lines = block.split("\n");
	const heading = lines.shift()?.match(/^### (?:AUDIT-\d{3}: )?(.+)$/);
	if (!heading || !heading[1].trim()) fail(`invalid finding heading in ${severity}`);
	const title = heading[1].trim();
	if (title.length > 160) fail(`finding title exceeds 160 characters: ${title.slice(0, 40)}`);

	const fields = {};
	let currentField;
	let lastFieldIndex = -1;
	for (const line of lines) {
		const field = line.match(/^- \*\*(Location|Category|Evidence|Impact|Recommendation):\*\*\s+(.+)$/);
		if (field) {
			currentField = field[1];
			const fieldIndex = FIELD_NAMES.indexOf(currentField);
			if (fieldIndex <= lastFieldIndex) fail(`fields are duplicated or reordered in: ${title}`);
			lastFieldIndex = fieldIndex;
			if (fields[currentField]) fail(`duplicate ${currentField} field in: ${title}`);
			fields[currentField] = field[2].trim();
		} else if (line.trim() && currentField)
			fields[currentField] += `\n${line.trim()}`;
		else if (line.trim())
			fail(`unexpected content in finding: ${title}`);
	}

	for (const field of FIELD_NAMES) {
		if (!fields[field]) fail(`missing ${field} field in: ${title}`);
	}
	if (fields.Category.length > 80) fail(`Category exceeds 80 characters in: ${title}`);
	for (const field of ["Evidence", "Impact", "Recommendation"]) {
		if (fields[field].length > 2000) fail(`${field} exceeds 2000 characters in: ${title}`);
	}
	fields.Location = parseLocation(fields.Location, scopes);
	return { severity, title, ...fields };
}

function parseSeverity(content, severity, scopes) {
	const empty = content.trim();
	if (empty === "_No findings._") return [];
	if (!empty.startsWith("### ")) fail(`${severity} must contain findings or _No findings._`);
	return empty.split(/\n(?=### )/).map((block) => parseFinding(block.trim(), severity, scopes));
}

export function parseAuditReport(rawMarkdown, { scopes = [] } = {}) {
	if (Buffer.byteLength(rawMarkdown, "utf8") > MAX_INPUT_BYTES) fail("report exceeds 60 KiB");
	if (/\0|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rawMarkdown)) fail("report contains unsafe control characters");
	const markdown = normalizeNewlines(rawMarkdown);
	const [start, end] = markerBounds(markdown);
	const fragment = markdown.slice(start + START_MARKER.length, end - END_MARKER.length).trim();
	const sectionPattern = /(?:^|\n)## (Executive Summary|Critical|Important|Suggestions)(?: \(\d+\))?\n+([\s\S]*?)(?=\n## |$)/g;
	const sections = [...fragment.matchAll(sectionPattern)];
	const expected = ["Executive Summary", ...SEVERITIES];
	if (sections.length !== expected.length || sections.some((section, index) => section[1] !== expected[index]))
		fail("sections must appear exactly once and in order: ## Executive Summary, ## Critical, ## Important, ## Suggestions — plain-text headings without '## ' are not accepted");
	const summary = sections[0][2].trim();
	if (!summary || summary.length > 1200) fail("Executive Summary must contain 1 to 1200 characters");
	const findings = SEVERITIES.flatMap((severity, index) => parseSeverity(sections[index + 1][2], severity, scopes));
	if (findings.length > MAX_FINDINGS) fail(`report exceeds ${MAX_FINDINGS} findings`);
	const seen = new Set();
	for (const finding of findings) {
		const key = `${finding.severity}\0${finding.Location.toLowerCase()}\0${finding.title.toLowerCase()}`;
		if (seen.has(key)) fail(`duplicate finding: ${finding.title}`);
		seen.add(key);
	}
	return { summary, findings };
}

function renderField(name, value) {
	const [first, ...rest] = value.split("\n");
	return [`- **${name}:** ${first}`, ...rest].join("\n");
}

function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function renderAuditReport(report) {
	const ordered = [...report.findings].sort((left, right) => {
		return SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity)
			|| compareText(left.Location, right.Location)
			|| compareText(left.title.toLowerCase(), right.title.toLowerCase());
	});
	let identifier = 0;
	const sections = SEVERITIES.map((severity) => {
		const findings = ordered.filter((finding) => finding.severity === severity);
		const body = findings.length ? findings.map((finding) => {
			identifier += 1;
			return [
				`### AUDIT-${String(identifier).padStart(3, "0")}: ${finding.title}`,
				renderField("Location", `\`${finding.Location}\``),
				renderField("Category", finding.Category),
				renderField("Evidence", finding.Evidence),
				renderField("Impact", finding.Impact),
				renderField("Recommendation", finding.Recommendation),
			].join("\n");
		}).join("\n\n") : "_No findings._";
		return `## ${severity} (${findings.length})\n\n${body}`;
	});
	return `${START_MARKER}\n## Executive Summary\n\n${report.summary.trim()}\n\n${sections.join("\n\n")}\n${END_MARKER}\n`;
}

export function normalizeAuditReport(markdown, options) {
	return renderAuditReport(parseAuditReport(markdown, options));
}

function parseArguments(arguments_) {
	const options = { scopes: [] };
	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--input") options.input = arguments_[index += 1];
		else if (argument === "--output") options.output = arguments_[index += 1];
		else if (argument === "--scope") options.scopes.push(arguments_[index += 1]?.replace(/\/$/, ""));
		else fail(`unknown argument: ${argument}`);
	}
	if (!options.input || !options.output || options.scopes.some((scope) => !scope))
		fail("usage: audit-report.mjs --input FILE --output FILE [--scope PATH ...]");
	return options;
}

export async function main(arguments_) {
	const options = parseArguments(arguments_);
	const markdown = await readFile(options.input, "utf8");
	await writeFile(options.output, normalizeAuditReport(markdown, options), "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
	main(process.argv.slice(2)).catch((error) => {
		console.error(`audit-report: ${error.message}`);
		process.exitCode = 1;
	});
