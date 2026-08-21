# AI Use Disclosure

Some code in this repository was written with the assistance of Claude (Anthropic), an AI
coding assistant, via Claude Code.

## Disclosed commit

Commit [`195db29`](https://github.com/SK-143381/flowviz/commit/195db29ad150b55d702623e7f444b3ac236682ba)
— "feat: pane-zoom navigation, id-collision/hidden-pane bug fixes, and a permanent
smoke-test pipeline" (2026-07-17) — carries an explicit `Co-Authored-By: Claude` trailer and
touched the following files:

- `app/package-lock.json`
- `app/package.json`
- `app/scripts/smoke-test.mjs`
- `app/src/App.tsx`
- `app/src/application/ids.ts`
- `app/src/domain/dependencyEngine.ts`
- `app/src/domain/idGenerator.ts`
- `app/src/domain/schema/mermaidErParser.ts`
- `app/src/domain/schema/schemaToGraph.ts`
- `app/src/index.css`
- `app/src/infrastructure/reasoning/GeminiReasoningEngine.ts`
- `app/src/infrastructure/reasoning/GeminiSchemaReasoningEngine.ts`
- `app/src/infrastructure/reasoning/MockReasoningEngine.ts`
- `app/src/infrastructure/reasoning/MockSchemaReasoningEngine.ts`
- `app/src/presentation/components/ExpandablePane.tsx`
- `app/src/presentation/components/SchemaPane.tsx`
- `app/src/presentation/schema/SchemaConnectors.tsx`
- `app/src/presentation/schema/SchemaDiagramCanvas.tsx`
- `app/src/presentation/schema/SchemaTableBox.tsx`
- `app/src/presentation/schema/layoutSchemaTables.ts`
- `app/src/presentation/schema/tablePalette.ts`
- `app/src/presentation/schema/useFitScale.ts`
- `docs/architecture.md`
- `docs/smoke-testing.md`

All AI-assisted contributions were reviewed by a human contributor before merging.

## Contributions

- **Sanchita S. Kamath** — primary author and maintainer. Designed and implemented the Clean/Hexagonal architecture (domain/application/infrastructure/presentation layers), the decision-confirmation loop, the dependency-aware edit loop, the schema↔diagram sync coordinator, accessibility features (keyboard navigation, ARIA live regions, TTS/STT), and the Playwright smoke-test suite.
- **Azucena Ventimilla** — implemented Gemini API key handling and wired the live Gemini reasoning engine into the schema editor (`app/src/infrastructure/reasoning/geminiClient.ts`, `app/src/App.tsx`).
