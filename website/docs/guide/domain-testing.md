# Testing & Verification

The **Testing & Verification** domain provides end-to-end capabilities for authoring, isolating, and validating automated test suites across all application layers — from module unit tests to stateful API fuzzing.

Rather than authoring tests ad-hoc, Coding Pal enforces strict boundaries: **test agents are strictly scoped to one module or service, edit only test files, and must never alter production code without explicit user consent.**

---

## Domain Architecture

### 1. Unit & Component Testing

```mermaid
---
caption: Unit & Component Testing Flow
---
flowchart TD
    subgraph Triggers ["Slash Prompts"]
        P_NODE["<b>/node-unit-tests</b><br/>Node Jest & Supertest"]
        P_NG_U["<b>/angular-unit-tests</b><br/>Angular Vitest Specs"]
    end

    subgraph Specialists ["Specialist Agent"]
        A_UNIT["<b>Unit Tester Agent</b><br/>(unit-test.agent.md)"]
    end

    subgraph Standards ["Scoped Instructions"]
        I_NODE["<b>node-unit-tests.instructions.md</b><br/>tests/**/*.js"]
        I_NG_U["<b>angular-unit-tests.instructions.md</b><br/>**/*.spec.ts"]
    end

    P_NODE --> A_UNIT
    P_NG_U --> A_UNIT
    A_UNIT -.-> I_NODE
    A_UNIT -.-> I_NG_U

    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef standard fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;

    class P_NODE,P_NG_U prompt;
    class A_UNIT agent;
    class I_NODE,I_NG_U standard;
```

### 2. End-to-End Testing

```mermaid
---
caption: End-to-End Testing Flow
---
flowchart TD
    subgraph Triggers ["Slash Prompt"]
        P_NG_E2E["<b>/angular-e2e-tests</b><br/>Playwright E2E Flows"]
    end

    subgraph Specialists ["Specialist Agent"]
        A_E2E["<b>E2E Tester Agent</b><br/>(e2e-test.agent.md)"]
    end

    subgraph Standards ["Scoped Instruction"]
        I_NG_E2E["<b>angular-e2e-tests.instructions.md</b><br/>**/e2e/**/*.ts"]
    end

    P_NG_E2E --> A_E2E
    A_E2E -.-> I_NG_E2E

    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef standard fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;

    class P_NG_E2E prompt;
    class A_E2E agent;
    class I_NG_E2E standard;
```

### 3. Database Testing

```mermaid
---
caption: Database Testing Flow
---
flowchart TD
    subgraph Triggers ["Slash Prompt"]
        P_DB["<b>/postgres-liquibase-tests</b><br/>SQL Rollback/Forward Tests"]
    end

    subgraph Specialists ["Specialist Agent"]
        A_UNIT_DB["<b>Unit Tester Agent</b><br/>(unit-test.agent.md)"]
    end

    subgraph Standards ["Scoped Instruction"]
        I_DB["<b>postgres-liquibase-tests.instructions.md</b><br/>tests/db/**/*.sql"]
    end

    P_DB --> A_UNIT_DB
    A_UNIT_DB -.-> I_DB

    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef standard fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;

    class P_DB prompt;
    class A_UNIT_DB agent;
    class I_DB standard;
```

### 4. Performance & Load Testing

```mermaid
---
caption: Performance Testing Flow
---
flowchart TD
    subgraph Triggers ["Slash Prompt"]
        P_PERF["<b>/performance-tests</b><br/>k6 Load Scenarios"]
    end

    subgraph Specialists ["Specialist Agent"]
        A_PERF["<b>Performance Tester Agent</b><br/>(performance-tests.agent.md)"]
    end

    subgraph Standards ["Scoped Instruction"]
        I_PERF["<b>k6-performance-tests.instructions.md</b><br/>tests/perf/"]
    end

    subgraph Bundles ["Executable Skill"]
        S_PERF["<b>skills/k6-performance-examples/</b><br/>Fixtures, thresholds, runners"]
    end

    P_PERF --> A_PERF
    A_PERF -.-> I_PERF
    A_PERF === S_PERF

    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef standard fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;

    class P_PERF prompt;
    class A_PERF agent;
    class I_PERF standard;
    class S_PERF skill;
```

### 5. API Fuzz Testing

```mermaid
---
caption: API Fuzz Testing Flow
---
flowchart TD
    subgraph Triggers ["Slash Prompt"]
        P_FUZZ["<b>/fuzz-tests</b><br/>RESTler API Fuzzing"]
    end

    subgraph Specialists ["Specialist Agent"]
        A_FUZZ["<b>Fuzz Tester Agent</b><br/>(fuzz-tests.agent.md)"]
    end

    subgraph Standards ["Scoped Instruction"]
        I_FUZZ["<b>restler-fuzzing-tests.instructions.md</b><br/>tests/restler/"]
    end

    subgraph Bundles ["Executable Skill"]
        S_FUZZ["<b>skills/restler-fuzzing-examples/</b><br/>OpenAPI dicts, auth scripts"]
    end

    P_FUZZ --> A_FUZZ
    A_FUZZ -.-> I_FUZZ
    A_FUZZ === S_FUZZ

    classDef prompt fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;
    classDef agent fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef standard fill:#082f49,stroke:#0ea5e9,stroke-width:2px,color:#f0f9ff;
    classDef skill fill:#4c1d95,stroke:#8b5cf6,stroke-width:2px,color:#faf5ff;

    class P_FUZZ prompt;
    class A_FUZZ agent;
    class I_FUZZ standard;
    class S_FUZZ skill;
```

---

## Capabilities Matrix

| Capability | Slash Prompt | Specialist Agent | Scoping Instruction | Supporting Skill | Key Test Runner |
|---|---|---|---|---|---|
| **Node.js Unit & API Tests** | [`/node-unit-tests`](./catalog-prompts.md#1-node-unit-tests) | [`Unit Tester`](./catalog-agents.md#4-unit-tester) | [`node-unit-tests`](./catalog-instructions.md#3-node-unit-tests) | — | Jest / Supertest |
| **Angular Component Specs** | [`/angular-unit-tests`](./catalog-prompts.md#2-angular-unit-tests) | [`Unit Tester`](./catalog-agents.md#4-unit-tester) | [`angular-unit-tests`](./catalog-instructions.md#8-angular-unit-tests) | — | Vitest (`ng test`) |
| **Angular E2E Flows** | [`/angular-e2e-tests`](./catalog-prompts.md#3-angular-e2e-tests) | [`E2E Tester`](./catalog-agents.md#5-e2e-tester) | [`angular-e2e-tests`](./catalog-instructions.md#9-angular-e2e-tests) | — | Playwright |
| **PostgreSQL Migration Tests** | [`/postgres-liquibase-tests`](./catalog-prompts.md#4-postgres-liquibase-tests) | [`Unit Tester`](./catalog-agents.md#4-unit-tester) | [`postgres-liquibase-tests`](./catalog-instructions.md#5-postgresql-liquibase-tests) | — | SQL Assertions |
| **k6 Performance Tests** | [`/performance-tests`](./catalog-prompts.md#6-performance-tests) | [`Performance Tester`](./catalog-agents.md#7-performance-tester) | [`k6-performance-tests`](./catalog-instructions.md#11-k6-performance-tests) | [`k6-performance-examples`](./catalog-skills.md#8-k6-performance-examples) | k6 (Docker runner) |
| **RESTler API Fuzzing** | [`/fuzz-tests`](./catalog-prompts.md#7-fuzz-tests) | [`Fuzz Tester`](./catalog-agents.md#8-fuzz-tester) | [`restler-fuzzing-tests`](./catalog-instructions.md#12-restler-fuzzing-tests) | [`restler-fuzzing-examples`](./catalog-skills.md#9-restler-fuzzing-examples) | Microsoft RESTler |

---

## Capability Workflows

### 1. Node.js Unit & Route Integration Tests

- **Trigger**: `/node-unit-tests [src/path/to/module.js]`
- **Scope & Isolation**: 
  - Resolves target module from chat input, editor cursor, or active tab.
  - Automatically discriminates between pure modules (`src/services/` → Jest unit tests) and HTTP routers (`src/routes/` → Supertest HTTP assertions).
  - Target path: `src/<path>/<file>.js` → `tests/<path>/<file>.test.js`.
- **Falsifiable Done When**:
  - All branching paths (happy path, edge values, null/undefined, error codes) are covered with explicit assertions.
  - Test suite passes via narrowest command (`npm test -- tests/<path>/<file>.test.js`).
  - **Zero production code files are modified.**

### 2. Angular Vitest Component Specs

- **Trigger**: `/angular-unit-tests [src/app/path/to/component.ts]`
- **Scope & Isolation**:
  - Colocates `*.spec.ts` files adjacent to the implementation.
  - Enforces Vitest + `@testing-library/angular` or native TestBed patterns.
  - Mocks all injected dependencies (services, router, HTTP clients).
- **Falsifiable Done When**:
  - Spec executes cleanly with `ng test --include src/app/<path>/<name>.spec.ts`.
  - DOM event triggers and reactive signal state changes are validated.

### 3. Angular Playwright End-to-End Tests

- **Trigger**: `/angular-e2e-tests [flow-name]`
- **Specialist Agent**: `E2E Tester` (`e2e-test.agent.md`)
- **Scope & Isolation**:
  - Implements the Page Object Model (POM) pattern under `e2e/`.
  - Validates full browser interactions: authentication, forms, navigation guards, and accessibility selectors (`getByRole`, `getByText`).
  - Relies on running Docker dev stack and `baseURL`.
- **Falsifiable Done When**:
  - Playwright spec passes headlessly via `npx playwright test e2e/<flow>.spec.ts`.
  - **Zero production code files are modified.**

### 4. PostgreSQL & Liquibase Migration Assertions

- **Trigger**: `/postgres-liquibase-tests [db/changelog/path]`
- **Scope & Isolation**:
  - Generates deterministic SQL test scripts validating forward migrations, rollback integrity, and soft-delete triggers.
- **Falsifiable Done When**:
  - Migration applies cleanly to a temporary schema, verification assertions pass, and rollback returns the schema to pristine state.

### 5. k6 Performance & Load Benchmarking

- **Trigger**: `/performance-tests [service-name]`
- **Agent**: [`Performance Tester`](./catalog-agents.md#6-performance-tester)
- **Scaffolding**: Employs [`k6-performance-examples`](./catalog-skills.md#8-k6-performance-examples) containing Docker Compose runners and threshold templates.
- **Falsifiable Done When**:
  - k6 scenario executes against the target endpoint asserting explicit SLA thresholds (e.g. `http_req_duration: ['p(95)<300']`, `http_req_failed: ['rate<0.01']`).
  - Outputs summary metrics in console and JSON formats.

### 6. RESTler API Grammar Fuzzing

- **Trigger**: `/fuzz-tests [openapi-path]`
- **Agent**: [`Fuzz Tester`](./catalog-agents.md#7-fuzz-tester)
- **Scaffolding**: Employs [`restler-fuzzing-examples`](./catalog-skills.md#9-restler-fuzzing-examples) containing compilation configurations, dictionary templates, and CI gating scripts.
- **Falsifiable Done When**:
  - RESTler compiles grammar from OpenAPI specs, fuzz-lean phase passes with 0 unexpected 500 server crashes.

---

## Related Schemas & Catalogs

- [Prompts Catalog](./catalog-prompts.md)
- [Agents Catalog](./catalog-agents.md)
- [Instructions Catalog](./catalog-instructions.md)
- [Skills Catalog](./catalog-skills.md)
- [Agent Markdown Schema](./schema-agents.md)
