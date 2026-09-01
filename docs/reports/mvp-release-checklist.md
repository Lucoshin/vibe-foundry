---
project: VibeFoundry
category: release-checklist
source_path: docs/reports/mvp-release-checklist.md
status: active
last_updated: 2026-07-08
---

# MVP Release Checklist

## Verification Commands

- `npm test`
- `npm run build`
- `node dist/cli.js distill examples/fixture-project`
- `node scripts/verify-mvp.mjs`
- `python <plugin-creator-skill-root>/scripts/validate_plugin.py plugins/vibe-foundry`

## Required Artifacts

- `README.md`
- `docs/README.md`
- `docs/runbooks/quickstart.md`
- `docs/runbooks/use-vibe-foundry-skill.md`
- `docs/runbooks/use-vibe-foundry-mcp.md`
- `docs/runbooks/install-vibe-foundry-plugin.md`
- `docs/runbooks/create-metaphor-pack.md`
- `examples/fixture-project`
- `scripts/verify-mvp.mjs`
- `plugins/vibe-foundry/.codex-plugin/plugin.json`

## MVP Coverage

- Engineering assets: components, services, backend entrypoints.
- Business assets: auth and related service-driven flows.
- Product assets: onboarding, pricing, dashboard, settings, invite, content creation, empty state, upgrade prompt, user activation.
- Culture assets: short-note metaphor packs with copyright boundaries.
- Agent access: Skill, MCP tools, Plugin packaging.

## Known Limits

- GitNexus MCP tools were not exposed in the current session, so impact analysis and detect_changes could not be run.
- Product and metaphor extraction is heuristic and requires human review before reuse.
- MCP transport is a minimal stdio JSON-RPC implementation, not an official SDK integration.
- Plugin marketplace is repo-local and may need environment-specific installation in Codex.
- No SaaS dashboard, database, vector index, or LLM extraction pipeline is included in this MVP.

## Release Decision

MVP is releasable when all verification commands pass and the fixture produces:

- at least one component asset;
- at least one service asset;
- at least one product concept asset;
- at least one metaphor pack;
- readable `reuse-report.md` and `agent-rules.md`.
