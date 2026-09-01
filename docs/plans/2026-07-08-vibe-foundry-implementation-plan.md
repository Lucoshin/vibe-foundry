# VibeFoundry Implementation Plan

> **历史契约说明（2026-09-01）：** 本文保留用于首版实现追溯；其中源项目内资产目录约定已被 central-only 集中资产库契约取代，不代表当前输出位置。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first local version of VibeFoundry, a CLI that distills reusable engineering assets from an existing React / Next.js / Node.js project, while reserving schema space for product design and culture metaphor assets.

**Architecture:** Start with a local CLI and deterministic project analyzers. The CLI scans a project, extracts structured asset data for components, services, business flows, design tokens, and page patterns, writes a `.vibe-foundry/` asset package, then generates human-readable reports and agent-facing rules. MCP, Skill, and Plugin packaging are layered on after the CLI output schema is stable.

**Tech Stack:** Node.js, TypeScript, ts-morph or TypeScript Compiler API, PostCSS, Tailwind config parsing, JSON Schema, Vitest.

---

## Phase 1: Repository Bootstrap

### Task 1: Initialize the TypeScript CLI project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Create: `tests/cli.test.ts`

**Step 1: Create the package metadata**

Add a Node.js package named `vibe-foundry` with a binary entry:

```json
{
  "name": "vibe-foundry",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "vibe-foundry": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsx src/cli.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "fast-glob": "^3.3.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

**Step 2: Add the first failing CLI test**

```ts
import { describe, expect, it } from "vitest";

describe("vibe-foundry CLI", () => {
  it("exports a distill command handler", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.distillProject).toBe("function");
  });
});
```

**Step 3: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `distillProject` does not exist.

**Step 4: Implement minimal export**

```ts
export async function distillProject(projectRoot: string) {
  return { projectRoot };
}
```

**Step 5: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: PASS.

**Step 6: Commit**

```bash
git add package.json tsconfig.json src tests
git commit -m "chore: initialize vibe-foundry cli"
```

## Phase 2: Output Schema

### Task 2: Define the universal asset package schema

**Files:**
- Create: `src/schema/asset-package.ts`
- Create: `tests/schema/asset-package.test.ts`

**Step 1: Write schema tests**

Test that a minimal asset package includes:

- `version`
- `sourceProject`
- `generatedAt`
- `framework`
- `assets`
- `tokens`
- `patterns`
- `services`
- `businessPatterns`
- `conceptAssets`

**Step 2: Implement Zod schemas**

Create schemas for:

- `AssetPackage`
- `ComponentAsset`
- `ServiceAsset`
- `BusinessPattern`
- `DesignToken`
- `PagePattern`
- `ConceptAsset`
- `ReuseScore`

Asset kinds must include:

- `component`
- `service`
- `business-pattern`
- `page-pattern`
- `design-token`
- `concept`
- `metaphor`

**Step 3: Validate JSON serializability**

Add a test that parses, stringifies, and re-parses a fixture object.

**Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/schema tests/schema
git commit -m "feat: define universal asset package schema"
```

## Phase 3: Project Scanner

### Task 3: Detect framework, frontend, and backend project structure

**Files:**
- Create: `src/scanner/project-scanner.ts`
- Create: `tests/scanner/project-scanner.test.ts`

**Step 1: Build fixtures**

Create temporary test projects with:

- `package.json`
- `src/components/Button.tsx`
- `src/app/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/server/auth.ts`
- Optional `tailwind.config.ts`

**Step 2: Write failing detection tests**

Expected scanner output:

```ts
{
  framework: "next",
  language: "typescript",
  packageManager: "npm",
  componentDirs: ["src/components"],
  pageDirs: ["src/app"],
  apiDirs: ["src/app/api"],
  serviceDirs: ["src/server"]
}
```

**Step 3: Implement scanner**

Use `fast-glob` and filesystem checks. Keep detection simple and explicit for MVP.

**Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/scanner tests/scanner
git commit -m "feat: detect project structure and backend entrypoints"
```

## Phase 4: Component Analyzer

### Task 4: Extract component candidates

**Files:**
- Create: `src/analyzers/component-analyzer.ts`
- Create: `tests/analyzers/component-analyzer.test.ts`

**Step 1: Write component fixture**

Use a simple React component:

```tsx
export function Button({ variant = "primary", children }) {
  return <button className="rounded-md px-4 py-2">{children}</button>;
}
```

**Step 2: Write failing test**

Expected extracted asset:

```ts
{
  name: "Button",
  filePath: "src/components/Button.tsx",
  kind: "component",
  reusePotential: "high"
}
```

**Step 3: Implement minimal analyzer**

For MVP, inspect file names and exported function names. Use heuristics:

- Files under `components` are candidate components.
- Files under `app`, `pages`, or `routes` are page components.
- Components with business-heavy names or direct API imports get lower scores.

**Step 4: Add coupling tests**

Add a fixture that imports `@/lib/billing` and assert lower reuse score.

**Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/analyzers tests/analyzers
git commit -m "feat: extract component candidates"
```

## Phase 5: Service and Business Analyzer

### Task 5: Extract backend service and business flow candidates

**Files:**
- Create: `src/analyzers/service-analyzer.ts`
- Create: `src/analyzers/business-pattern-summarizer.ts`
- Create: `tests/analyzers/service-analyzer.test.ts`
- Create: `tests/analyzers/business-pattern-summarizer.test.ts`

**Step 1: Write API route fixture**

Use a simple Next.js route:

```ts
export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ ok: true });
}
```

Place it at:

```text
src/app/api/auth/register/route.ts
```

**Step 2: Write failing service extraction test**

Expected extracted asset:

```ts
{
  name: "auth.register",
  filePath: "src/app/api/auth/register/route.ts",
  kind: "service",
  businessDomain: "auth",
  reusePotential: "high"
}
```

**Step 3: Implement minimal service analyzer**

Use heuristics:

- API paths under `api/auth`, `routes/auth`, or `server/auth` are auth candidates.
- Files containing `login`, `register`, `session`, `permission`, `role`, or `password` get business-domain tags.
- Files importing `bcrypt`, `jwt`, `next-auth`, `lucia`, `passport`, `stripe`, or `clerk` get dependency tags.

**Step 4: Write business pattern summary test**

Given `auth.register` and `auth.login` service assets, assert `business-patterns.md` includes:

- registration flow
- login flow
- security constraints
- reuse caveats

**Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/analyzers tests/analyzers
git commit -m "feat: extract backend service and business flow assets"
```

## Phase 6: Token Extractor

### Task 6: Extract design tokens

**Files:**
- Create: `src/analyzers/token-extractor.ts`
- Create: `tests/analyzers/token-extractor.test.ts`

**Step 1: Write Tailwind class fixture**

Include classes such as:

```tsx
<div className="bg-white text-slate-950 rounded-lg shadow-sm p-6">
```

**Step 2: Write failing token test**

Expected extracted token categories:

- `color`
- `radius`
- `shadow`
- `spacing`

**Step 3: Implement class extraction**

Parse `className` strings with a conservative regex. Do not attempt full Tailwind evaluation in MVP.

**Step 4: Add source tracking**

Each token should include:

- `value`
- `category`
- `sourceFiles`
- `occurrences`

**Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/analyzers/token-extractor.ts tests/analyzers/token-extractor.test.ts
git commit -m "feat: extract design tokens"
```

## Phase 7: Report Generator

### Task 7: Generate asset package and reports

**Files:**
- Create: `src/writers/asset-writer.ts`
- Create: `src/writers/report-writer.ts`
- Create: `tests/writers/report-writer.test.ts`

**Step 1: Write output test**

Given a minimal asset package, assert that these files are written:

- `.vibe-foundry/asset-manifest.json`
- `.vibe-foundry/tokens.json`
- `.vibe-foundry/component-catalog.json`
- `.vibe-foundry/service-catalog.json`
- `.vibe-foundry/page-patterns.md`
- `.vibe-foundry/business-patterns.md`
- `.vibe-foundry/concept-assets.json`
- `.vibe-foundry/agent-rules.md`
- `.vibe-foundry/reuse-report.md`

**Step 2: Implement JSON writers**

Write stable, pretty-printed JSON with two-space indentation.

**Step 3: Implement Markdown writers**

Keep reports concise:

- top reusable assets
- reusable services and business flows
- token summary
- recommended extraction order
- agent usage rules
- known risks

**Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/writers tests/writers
git commit -m "feat: write asset package reports"
```

## Phase 8: Distill Command

### Task 8: Connect the full `distill` flow

**Files:**
- Modify: `src/index.ts`
- Modify: `src/cli.ts`
- Create: `tests/distill-flow.test.ts`

**Step 1: Write integration test**

Create a temporary Next.js-like fixture and call:

```ts
await distillProject(fixtureRoot);
```

Assert `.vibe-foundry/asset-manifest.json` exists.

**Step 2: Implement orchestration**

Flow:

1. Scan project.
2. Analyze components.
3. Analyze backend services.
4. Summarize business patterns.
5. Extract tokens.
6. Build asset package.
7. Write reports.

**Step 3: Implement CLI command**

Command:

```bash
vibe-foundry distill .
```

Expected output:

```text
VibeFoundry generated .vibe-foundry asset package.
```

**Step 4: Run tests**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add distill command"
```

## Phase 9: Codex Skill

### Task 9: Add a local Codex Skill for asset distillation

**Files:**
- Create: `.agents/skills/vibe-foundry/SKILL.md`

**Step 1: Write the skill**

The skill should trigger when the user asks to distill, extract, or reuse assets from a vibe project.

**Step 2: Include workflow instructions**

The skill should instruct Codex to:

1. Inspect project type.
2. Run `vibe-foundry distill .`.
3. Read `.vibe-foundry/reuse-report.md`.
4. Suggest the next highest-value asset extraction across components, services, business flows, product patterns, and concept assets.
5. Update `AGENTS.md` only when the user asks to persist rules.

**Step 3: Test manually**

Restart Codex or refresh skills, then ask:

```text
$vibe-foundry distill this project into reusable assets
```

Expected: Codex loads the skill and follows the workflow.

**Step 4: Commit**

```bash
git add .agents/skills/vibe-foundry/SKILL.md
git commit -m "feat: add vibe-foundry codex skill"
```

## Phase 10: MCP Server

### Task 10: Add read-only MCP asset server

**Files:**
- Create: `src/mcp/server.ts`
- Create: `tests/mcp/server.test.ts`

**Step 1: Define read-only tools**

Initial MCP tools:

- `list_assets`
- `get_component`
- `get_service`
- `search_tokens`
- `search_business_patterns`
- `search_concept_assets`
- `get_agent_rules`
- `validate_asset_usage`

**Step 2: Implement local asset loading**

Read from `.vibe-foundry/` in the current project root. If missing, return a clear error telling the user to run `vibe-foundry distill .`.

**Step 3: Add tests**

Use a fixture `.vibe-foundry/` directory and assert tool responses are stable JSON.

**Step 4: Run tests**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/mcp tests/mcp
git commit -m "feat: expose asset package through mcp"
```

## Phase 11: Plugin Packaging

### Task 11: Package Skill and MCP config as a Codex Plugin

**Files:**
- Create: `plugins/vibe-foundry/.codex-plugin/plugin.json`
- Create: `plugins/vibe-foundry/skills/vibe-foundry/SKILL.md`
- Create: `.agents/plugins/marketplace.json`

**Step 1: Create plugin manifest**

Package:

- the VibeFoundry skill
- MCP server config
- CLI usage documentation

**Step 2: Add local marketplace entry**

Expose the plugin for local testing through `.agents/plugins/marketplace.json`.

**Step 3: Verify plugin discovery**

Restart Codex and open `/plugins`.

Expected: VibeFoundry appears in the local repo marketplace.

**Step 4: Commit**

```bash
git add plugins .agents/plugins
git commit -m "chore: package vibe-foundry plugin"
```

## Validation Strategy

- Unit tests for schema, scanner, analyzers, and writers.
- Integration test for `distillProject`.
- Manual test against one real React / Next.js project and one full-stack project with auth routes.
- Manual Codex test for the Skill.
- Manual MCP test by querying assets after `.vibe-foundry/` generation.

## Risks and Guardrails

- Keep MVP focused on React / Next.js / TypeScript / Tailwind plus lightweight Node.js / Next.js API route recognition.
- Avoid automatic source refactoring in the first release.
- Mark all scores as heuristic, not authoritative.
- Preserve file paths and source references for every extracted asset.
- Treat MCP tools as read-only until validation is mature.
- Reserve schema for product design and culture metaphor assets, but do not implement full book distillation in MVP.

## Milestones

### Milestone 1: Local asset package

Deliver CLI, scanner, schema, component analyzer, service analyzer, token extraction, and reports.

### Milestone 2: Agent usability

Deliver Codex Skill and `agent-rules.md`.

### Milestone 3: Live asset access

Deliver MCP server for read-only asset lookup.

### Milestone 4: Distribution

Deliver Codex Plugin packaging and local marketplace entry.
