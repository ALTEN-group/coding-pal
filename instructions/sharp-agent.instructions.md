---
description: "Guidelines to avoid overengineering and reduce token consumption. Favor surgical changes and establish clean problem-solving strategies."
applyTo: "**"
---

**Tradeoff:** These guidelines bias toward caution over speed.

## 1. Think Before Coding

**Do not assume. Do not hide confusion. Point out tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - do not pick silently.
- If a simpler approach exists, say so. Challenge when appropriate.
- Stop when confused. Name what is unclear. Ask.

## 2. Simplicity First

**Minimum code that solves the problem.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" nor "configurability" that was not requested.
- No error handling for impossible scenarios.
- If you write code that could be shorter, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Always match existing style.
- If you notice dead code, mention it - do not delete it.

When your changes create orphans:
- Only remove imports/variables/functions that your changes made unused.
- Do not remove pre-existing dead code. Mention it.

Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Ask for success criteria if not given. Stop once criteria are reached.**

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria require clarification.

---