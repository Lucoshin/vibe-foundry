---
name: vibe-foundry
description: Use when you need to distill reusable assets from a local project, inspect its package in the central asset library, or propose reuse guidance for components, services, business flows, product patterns, or cultural metaphor assets.
---

# VibeFoundry Skill

Use this skill when the user asks to:

- distill reusable project assets;
- inspect or summarize a project package in the central asset library;
- find reusable components, backend services, business flows, product design patterns, or metaphor assets before implementing new work;
- generate reuse suggestions from a project that has VibeFoundry installed.

## Required Workflow

1. Read `docs/README.md` first to understand the project documentation routes and current implementation state.
2. Run `npm test` from the repository root to confirm VibeFoundry is in a valid state.
3. Run `node dist/cli.js distill .` from the repository root to generate or refresh the local asset package.
4. Read `reuse-report.md` from the centralized asset package directory printed by `distill`.
5. Give the user concrete next-step asset reuse suggestions based on the report.

## Source Safety

- 不自动修改源码。
- 只读取项目文档、运行验证命令、在集中资产库中生成或刷新资产输出，并读取报告。
- Do not edit application files unless the user separately asks for implementation work after reviewing the reuse suggestions.
- If `reuse-report.md` is missing from the centralized asset package after distillation, report the missing file and include the command output or error summary.

## MCP Asset Queries

When an MCP client is available, prefer VibeFoundry MCP tools for read-only lookup:

- `list_assets`
- `get_component`
- `get_component_prompt` — pass the component's exact project-relative `filePath`; the result contains a Chinese design brief describing layout, visual appearance, motion, and interaction.
- `get_service`
- `search_tokens`
- `search_business_patterns`
- `search_concept_assets`
- `get_agent_rules`
- `validate_asset_usage`

For component effects, return the generated `prompt` as the copyable design brief. Keep `sourceFiles` and `unresolved` separate as analysis references and items to verify; do not append source code to the brief. The current record version is 0.2.0; older source-bundle prompts require redistillation. Run distillation when authorized by the user's task; do not invent visual effects when evidence is missing. Browser mount evidence does not establish visual fidelity.

## Output Guidance

When reporting back to the user, include:

- whether `npm test` passed;
- whether `node dist/cli.js distill .` completed;
- the highest-value reusable components or services;
- business flow reuse opportunities;
- token, page-pattern, product-pattern, or metaphor-pack suggestions when present;
- risks, limits, and any manual review needed before reuse.
