---
description: Generate a unit test suite using Jest and Supertest for any node.js project
agent: Unit Tester
---

Generate a comprehensive, production-ready unit test suite for the target file or module, executing under the **Unit Tester** agent persona and standards.

### Target File & Path Rules
- Target the currently open file, active editor selection, or file specified in the request.
- For source file located at `src/<path>/<filename>.js`, place the corresponding test file at `tests/<path>/<filename>.test.js`.

### Action Plan
1. **Analyze Code (Unit Tester Agent)**: Leverage the agent's approach to map out all execution paths (happy path, edge cases, error branches).
2. **Write Test Suite**: Create or update the unit test file at `tests/<path>/<filename>.test.js` following project test instructions.
3. **Verify Execution**: Run `npm test` to verify all test cases pass cleanly.
