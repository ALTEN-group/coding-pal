---
name: token-audit
description: "Audit the harness (instructions, skills, agents, prompts, and the workflows that run them) for token waste: oversized or over-broad files, duplicated guidance, unbounded agent loops, work a script could do. Works on any project that uses AI coding assistants. Reports measured findings."
---

1. Inventory the AI assistant context files in scope: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `.github/agents/`, `.github/prompts/`, `.claude/`, `.cursor/rules/`, `.agents/skills/`, plus any `instructions/`, `skills/`, `agents/`, or `prompts/` folders and measure each file in bytes and lines. Estimate tokens as bytes / 4 and say that it is an estimate. Thresholds below are defaults: use any limit the project declares (in its docs, lint config, or contribution guide) instead.
2. Flag measurable waste only: an always-loaded file that only applies to part of the project, or an instruction with a missing, `**`, or broader-than-needed `applyTo` or `globs` scope; a file larger than the project's declared size limit (default 150 lines) that mixes several topics; near-duplicate guidance repeated across files; a skill or agent `description` longer than the project's declared limit (default two sentences); an agent or prompt that is missing a model choice, but only when the project already declares models or tiers elsewhere (never report this for a project that declares none); a workflow, script, or agent loop with no retry or iteration cap; a prompt or agent that tells the model to read the whole repository instead of a declared file scope; an LLM step that a linter, type checker, or test runner could do at zero token cost.
3. Consolidate closely related findings affecting the same file or the same pipeline into one finding. Skip any file already tracked by an open issue.
4. Never report a saving you did not measure. Never recommend removing a rule only because it is long: state which topic can be split or scoped.
5. Do not modify source, test, instruction, or documentation files.
6. Write `audit-findings.json` at the repository root as a JSON array where each element represents one consolidated finding with fields:
   - `"title"`: concise `chore(<scope>): <summary>` issue title
   - `"priority"`: GitHub issue priority (`"Urgent"`, `"High"`, `"Medium"`, or `"Low"`)
   - `"model"`: recommended Copilot model for remediation (`"claude-sonnet-5.5"`, `"claude-opus-5.5"`, `"claude-haiku-5.5"`, `"gpt-6.1-sol"`, `"gpt-6.1-terra"`, `"gpt-6-luna"`, `"gpt-5.3-codex"`, `"gemini-4-argon"`, `"gemini-3.8-flash"`, or `"auto"`) based on finding complexity
   - `"effort"`: recommended thinking effort (`"Low"`, `"Medium"`, `"High"`, or `"Max"`) based on reasoning depth required
   - `"problem"`: clear explanation of the issue, with measured evidence (file path, size, count, or rule id)
   - `"affectedFiles"`: array of affected file paths
   - `"suggestedFix"`: concrete remediation steps
   - `"acceptanceCriteria"`: array of testable `AC-<n>` criteria strings (e.g. `["- **AC-1:** ..."]`), each re-measurable with the same command or rule
   - `"body"`: multi-line Markdown specification (using `\n\n` between sections and `\n` after every `##` heading) with `## Problem`, `## Affected Files`, `## Suggested Fix`, and `## Acceptance Criteria` (`- **AC-1:** ...`).
