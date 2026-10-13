# Context Health Contract

Persistent Context is the organization's knowledge in a form an AI can consume. It stays useful only while it is small, specific, scoped, current, and free of secrets. This skill gives the weekly **Persistent Context & Controls review** two deterministic inputs: a lint of the instruction files, and an append-only log of corrections that turns repeated corrections into proposed artifacts.

Rules of the factory it enforces:

1. **Small and specific.** An instruction that tries to cover everything gets ignored.
2. **Scoped precisely.** The narrowest `applyTo` that works. Never `**`.
3. **Evidence-driven.** New artifacts come from something corrected or re-explained twice.
4. **Deleted when wrong.** An outdated instruction is worse than none.
5. **Never contains secrets.**

The Architect owns Persistent Context. The tools report and propose. People change it through pull requests.

---

## 1. `scripts/context-lint.mjs`

```bash
node scripts/context-lint.mjs --root . [--baseline context-baseline.json] [--write-baseline] \
  [--max-lines 120] [--stale-days 180] [--strict] [--today YYYY-MM-DD]
```

### What it scans

Under `--root`: `instructions/`, `.github/instructions/`, `.github/agents/`, `.github/prompts/`, `.github/skills/`, `.agents/`, `.claude/`, `.cursor/` (text files: `.md`, `.mdc`, `.json`, `.yml`, `.yaml`, `.txt`; `node_modules` and `.git` are skipped), plus `.github/copilot-instructions.md`, `AGENTS.md`, and `CLAUDE.md`.

An **instruction file** is a `*.instructions.md`, `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, or a `.cursor/**/*.mdc`. A `.cursor/**/*.mdc` generated from an `*.instructions.md` of the same name is a copy: it is still scanned for secrets but not counted, so an installation for several targets does not double the instruction count.

### Rules

| Rule | Severity | Applies to | Check |
|---|---|---|---|
| `missing-description` | error | `*.instructions.md` | Frontmatter has no `description` |
| `too-long` | warning | instruction files | More than `--max-lines` lines (the everything instruction) |
| `near-duplicate` | warning | instruction files | Line-set Jaccard similarity >= 0.6 between two files (files with fewer than 5 distinct lines are skipped) |
| `dangling-reference` | error | instruction files | References a skill, agent, or prompt that does not exist in the tree |
| `secret` | error | every scanned file | An AWS access key, a private key block, a `ghp_`-style or `github_pat_` GitHub token, an `xox` Slack token, or an `sk-`/`sk_live_`-style API secret key. The value is never printed |
| `stale` | warning | instruction files | The last git commit is older than `--stale-days` (only inside a git repository; untracked files are skipped). In a shallow clone the check is skipped with a one-line `note:` (history is truncated, so every file would look fresh): fetch full history, for example `fetch-depth: 0`. The note is not a finding and does not affect `--strict` |
| `growth` | warning | all | The instruction count grew more than 20% over the baseline |

Reference forms that are recognised: `` `name` skill ``, `` skill `name` ``, `skills/<name>/`, `` `Name` agent ``, `` agent `Name` ``, `agents/<slug>.agent.md`, `` `name` prompt ``, `` prompt `name` ``, `prompts/<slug>.prompt.md`. A skill, agent, or prompt exists when its `SKILL.md`, `*.agent.md`, or `*.prompt.md` (or a Claude/Cursor `agents/*.md` or `commands/*.md`) is in the tree (matched by file slug or frontmatter `name`, case-insensitive). References inside fenced code blocks are examples and are ignored.

### Baseline

`context-baseline.json`:

```json
{ "instructionCount": 16 }
```

- `--baseline <file>` enables the growth check. The count and the growth percentage are always printed.
- `--write-baseline` records the current instruction count (default file `<root>/context-baseline.json`). Changing the baseline is a pull request, like any Persistent Context.

### Exit codes

`0` no errors (warnings are reported). `1` errors or invalid input. `--strict` also fails on warnings.

---

## 2. `scripts/context-corrections.mjs`

An append-only JSON Lines log of corrections and re-explanations.

```bash
node scripts/context-corrections.mjs add --log specs/learn/corrections.jsonl \
  --topic "Use named exports" --source "PR #123" [--artifact instructions/exports.instructions.md]
node scripts/context-corrections.mjs propose --log specs/learn/corrections.jsonl [--min 2]
```

Each line: `{ "at": "<ISO timestamp>", "topic": "<normalised>", "source": "<pr or issue>", "artifact": "<path>" | null }`.

- Topics are normalised: lowercase, whitespace collapsed. `Use  Named Exports` and `use named exports` are one topic.
- `add` never rewrites the file. A malformed log is rejected with its line number.
- Record `--artifact` when an instruction, skill, or prompt now covers the topic.
- `propose` lists topics corrected from **at least `--min` distinct sources (default 2) with no artifact recorded**: the factory rule that a new artifact comes from something corrected or re-explained twice. One correction logged twice with the same source counts once. It proposes; the Architect decides.

---

## 3. The Weekly Persistent Context & Controls Review

The pack contains:

1. The `context-lint` report and the instruction count against the baseline.
2. The `context-corrections propose` list.
3. **Control signal-to-noise findings** supplied by the user: for each Deterministic Control, how often it fires and how often it is bypassed or overridden. A control that is routinely bypassed is fixed or removed, never left decorative. The agent does not invent these numbers.
4. Controls hardened from incidents (`learn-signals` issues) for the Architect and Developer to decide.

---

## 4. Anti-Patterns & Prohibitions

1. **No instruction for everything.** Split by scope or delete.
2. **No secrets in context.** Rotate anything the lint reports. Do not just delete the line.
3. **No artifact without evidence.** Two corrections first.
4. **No silent baseline changes.** The baseline moves by pull request.
