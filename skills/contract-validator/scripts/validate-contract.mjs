#!/usr/bin/env node

/**
 * Contract Validator: Declarative schema and invariant checker for structured artifacts.
 * Validates markdown/text files against a declarative contract without custom regex scripts.
 * Zero-dependency ESM script for Node.js 18+.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function parseArgs(argv) {
	const options = {
		contract: null,
		file: null,
		json: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--contract") {
			options.contract = argv[++i];
		} else if (arg === "--file") {
			options.file = argv[++i];
		} else if (arg === "--json") {
			options.json = true;
		} else if (arg === "-h" || arg === "--help") {
			options.help = true;
		}
	}

	return options;
}

export function validateArtifactContent(content, rules) {
	const violations = [];
	const lines = content.split("\n");

	// 1. Max Lines Check
	if (rules.maxLines && lines.length > rules.maxLines) {
		violations.push({
			type: "MAX_LINES_EXCEEDED",
			message: `Artifact exceeds maximum allowed lines (${lines.length} > ${rules.maxLines})`,
		});
	}

	// 2. Required Markers Check
	if (Array.isArray(rules.requiredMarkers)) {
		for (const marker of rules.requiredMarkers) {
			if (!content.includes(marker)) {
				violations.push({
					type: "MISSING_REQUIRED_MARKER",
					marker,
					message: `Artifact is missing required marker "${marker}"`,
				});
			}
		}
	}

	// 3. Required Headings Check
	if (Array.isArray(rules.requiredHeadings)) {
		for (const heading of rules.requiredHeadings) {
			const hasHeading = lines.some((l) => l.trim().startsWith(heading));
			if (!hasHeading) {
				violations.push({
					type: "MISSING_REQUIRED_HEADING",
					heading,
					message: `Artifact is missing required heading "${heading}"`,
				});
			}
		}
	}

	// 4. Heading Sequence Check
	if (Array.isArray(rules.headingSequence) && rules.headingSequence.length > 1) {
		let lastIndex = -1;
		for (const title of rules.headingSequence) {
			const foundIdx = lines.findIndex((l) => l.startsWith("#") && l.includes(title));
			if (foundIdx !== -1) {
				if (foundIdx < lastIndex) {
					violations.push({
						type: "OUT_OF_SEQUENCE_HEADING",
						heading: title,
						message: `Heading containing "${title}" appears out of configured order (line ${foundIdx + 1})`,
					});
				}
				lastIndex = foundIdx;
			}
		}
	}

	// 5. Required Fields Check
	if (Array.isArray(rules.requiredFields)) {
		for (const field of rules.requiredFields) {
			if (!content.includes(field)) {
				violations.push({
					type: "MISSING_REQUIRED_FIELD",
					field,
					message: `Artifact is missing required field "${field}"`,
				});
			}
		}
	}

	// 6. Forbidden Patterns Check
	if (Array.isArray(rules.forbiddenPatterns)) {
		for (const pattern of rules.forbiddenPatterns) {
			lines.forEach((line, idx) => {
				if (line.includes(pattern)) {
					violations.push({
						type: "FORBIDDEN_PATTERN_DETECTED",
						pattern,
						line: idx + 1,
						message: `Line ${idx + 1} contains forbidden pattern "${pattern}": "${line.trim()}"`,
					});
				}
			});
		}
	}

	return {
		ok: violations.length === 0,
		violations,
		summary: {
			linesChecked: lines.length,
			violationCount: violations.length,
		},
	};
}

export function formatReport(result, json = false) {
	if (json) {
		return JSON.stringify(result, null, 2);
	}

	if (result.ok) {
		return `✔ Contract Validation Passed (${result.summary.linesChecked} lines checked).`;
	}

	const lines = [];
	lines.push(`✖ Contract Validation Failed: ${result.violations.length} violation(s) found.`);
	lines.push("----------------------------------------");
	for (const v of result.violations) {
		lines.push(`• [${v.type}] ${v.message}`);
	}
	return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);

		if (options.help) {
			console.log(`
Usage: validate-contract --contract <contract.json> --file <artifact.md> [options]

Options:
  --contract <path>   Path to JSON contract specification
  --file <path>       Path to artifact to validate
  --json              Output structured JSON result
  -h, --help          Show this help message
`);
			return 0;
		}

		if (!options.contract || !options.file) {
			throw new Error("Both --contract and --file arguments are required.");
		}

		const contractPath = resolve(options.contract);
		const filePath = resolve(options.file);

		if (!existsSync(contractPath)) {
			throw new Error(`Contract file not found: ${contractPath}`);
		}
		if (!existsSync(filePath)) {
			throw new Error(`Artifact file not found: ${filePath}`);
		}

		const contractData = JSON.parse(readFileSync(contractPath, "utf-8"));
		const fileContent = readFileSync(filePath, "utf-8");

		const rules = contractData.rules || contractData;
		const result = validateArtifactContent(fileContent, rules);
		const output = formatReport(result, options.json);

		if (result.ok) {
			console.log(output);
			return 0;
		} else {
			console.error(output);
			return 1;
		}
	} catch (err) {
		console.error(`Contract Validation Error: ${err.message}`);
		return 2;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	const exitCode = main(process.argv.slice(2));
	process.exit(exitCode);
}
