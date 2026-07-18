# FlowViz Architecture

This document maps every source file in [`app/src`](../app/src), what it does, and exactly
which other files it imports from / is imported by. See [write-up.md](./write-up.md) for the
research design this implements.

## 1. Layering principle

Clean Architecture, dependencies point inward only:

```
presentation  ──depends on──▶  application  ──depends on──▶  domain
infrastructure ─────────────────depends on───────────────────▶ domain
App.tsx (composition root) ──depends on──▶ everything, wires infrastructure into application
```

- **`domain/`** never imports from any other layer. It is plain TypeScript types + pure
  functions.
- **`application/`** imports only from `domain/` (never `infrastructure/` or
  `presentation/`). It depends on domain **ports** (interfaces), not concrete engines.
- **`infrastructure/`** imports only from `domain/`. Each file here implements exactly one
  port.
- **`presentation/`** imports from `application/` and `domain/` (for types), never directly
  from `infrastructure/`.
- **`App.tsx`** is the only file allowed to `import` a concrete `infrastructure/*` class by
  name and hand it to `application/DiagramSessionService`. This is the Dependency Inversion
  seam: swap an engine by editing this one file.

This is what makes the "swap the mock reasoning engine for a real LLM" claim literally true
rather than aspirational — `application/` and `presentation/` have zero references to
`MockReasoningEngine`, `ElkLayoutEngine`, `WebSpeechTTS`, or `WebSpeechSTT` anywhere in their
source.

## 2. File tree

```
app/
├── index.html                              entry HTML, loads /src/main.tsx
├── README.md                                architecture summary + run instructions
└── src/
    ├── main.tsx                             React root mount
    ├── App.tsx                              composition root
    ├── index.css                            global styles (app shell, chat, decision UI)
    ├── speech.d.ts                           ambient Web Speech API types
    │
    ├── domain/
    │   ├── entities.ts                      NodeEntity, EdgeEntity, LabelEntity, GroupEntity,
    │   │                                     DiagramGraph, Decision, GraphDiff, applyGraphDiff()
    │   ├── ports.ts                         IReasoningEngine, ILayoutEngine, ITextToSpeech,
    │   │                                     ISpeechToText interfaces
    │   └── dependencyEngine.ts              expandDependencies(): pure ripple-effect resolver
    │
    ├── application/
    │   ├── types.ts                         SessionState, SessionMode, LogEntry
    │   ├── ids.ts                            nextId() monotonic id generator
    │   └── DiagramSessionService.ts         the two loops (generateFromPrompt, requestEdit)
    │
    ├── infrastructure/
    │   ├── reasoning/
    │   │   └── MockReasoningEngine.ts       rule-based stand-in for a real LLM
    │   ├── layout/
    │   │   └── ElkLayoutEngine.ts           elkjs-backed layout + partial relayout
    │   └── speech/
    │       ├── WebSpeechTTS.ts              speechSynthesis wrapper
    │       └── WebSpeechSTT.ts              SpeechRecognition wrapper
    │
    └── presentation/
        ├── hooks/
        │   └── useDiagramSession.ts         useSyncExternalStore subscription to the service
        └── components/
            ├── DiagramCanvas.tsx             <svg> root, stacks the three layer components
            ├── NodesLayer.tsx                <g> of <rect> — geometry + type only
            ├── EdgesLayer.tsx                <g> of <line> — topology + protocol only
            ├── LabelsLayer.tsx               <g> of <text> — all display text, only text
            ├── Toolbar.tsx                   layer visibility toggles + JSON export
            ├── ChatPane.tsx                  prompt/edit input, mic button, conversation log
            └── DecisionDialogue.tsx          HCXAI one-at-a-time confirm/contest UI
```

## 3. File-by-file reference

### `domain/entities.ts`

**Purpose.** Defines what a diagram *is*: `NodeEntity` (geometry + type, no text),
`EdgeEntity` (topology + protocol, no text), `LabelEntity` (the only place text lives,
referencing a node/edge by `elementId`), `GroupEntity`, and the aggregate `DiagramGraph`
(`{ nodes, edges, labels, groups }`, each keyed by id). Also defines `Decision` (a single
interpretive-decision record matching the write-up's `decision_id` schema), `GraphDiff` (an
additive/removal/update patch), `DependencyRecord` (a human-readable ripple-effect entry),
and the pure function `applyGraphDiff(graph, diff): DiagramGraph`.

**Imports.** None (leaf file).

**Imported by.** `domain/ports.ts`, `domain/dependencyEngine.ts`,
`application/DiagramSessionService.ts`, `application/types.ts`,
`infrastructure/reasoning/MockReasoningEngine.ts`, `infrastructure/layout/ElkLayoutEngine.ts`,
every file under `presentation/components/`.

This is the most depended-upon file in the project — every layer ultimately renders or
mutates the shapes defined here.

### `domain/ports.ts`

**Purpose.** The Dependency Inversion boundary. Declares `IReasoningEngine` (parsePrompt,
proposeEdit, reviseForDecision), `ILayoutEngine` (layout, relayoutSubgraph), `ITextToSpeech`
(speak, cancel), `ISpeechToText` (isSupported, start, stop). Nothing in this file knows any
concrete engine exists.

**Imports.** `domain/entities.ts` (for `Decision`, `DiagramGraph`, `GraphDiff` types used in
method signatures).

**Imported by.** `application/DiagramSessionService.ts` (declares its constructor params in
terms of these interfaces); each `infrastructure/*` file (`implements` one of these
interfaces); `App.tsx` (imports the concrete classes, not the interfaces directly, but the
interfaces are what guarantees they're interchangeable).

### `domain/dependencyEngine.ts`

**Purpose.** `expandDependencies(graph, directDiff): ExpandedChange` — a pure function with
no I/O. Given a graph and a proposed direct change, it walks structural dependencies (an
edge cannot outlive its endpoints; a label cannot outlive its element) and returns (a) an
expanded `GraphDiff` including every rippled removal, (b) a `DependencyRecord[]` audit trail
in plain language for the confirmation UI, and (c) `affectedNodeIds` — the *only* nodes that
should be handed to the layout engine for repositioning. Deliberately does **not** add a
surviving edge endpoint to `affectedNodeIds` just because it lost an edge — that is the
"spatial stability" guarantee (see write-up Section 4.1, metric 3): deleting a node leaves a
gap, it does not trigger a repack of the rest of the canvas.

**Imports.** `domain/entities.ts` (`DependencyRecord`, `DiagramGraph`, `GraphDiff`).

**Imported by.** `application/DiagramSessionService.ts` — called twice: once to preview the
ripple effects of a proposed edit before showing the confirmation dialogue, and again inside
`applyStagedEdit()` to recompute `affectedNodeIds` for the layout call after the diff is
actually applied.

### `application/types.ts`

**Purpose.** `SessionState` — the single state object presentation components read:
`mode`, `graph`, `pendingDecisions`, `activeDecisionIndex`, `stagedDiff`, `stagedRecords`,
`log`, `layerVisibility`, `selectedElementId`, `error`. Also `SessionMode` (`idle` /
`confirming_generation` / `confirming_edit` / `ready`), `LogEntry`, and
`initialSessionState()`.

**Imports.** `domain/entities.ts` (`DiagramGraph`, `Decision`, `GraphDiff`,
`DependencyRecord` as inline type-only imports).

**Imported by.** `application/DiagramSessionService.ts`, `presentation/hooks/useDiagramSession.ts`,
and every `presentation/components/*` file that types its `state` prop.

### `application/ids.ts`

**Purpose.** `nextId(prefix)` — a monotonic counter-based id generator (`n_001`, `e_002`,
`lbl_003`, `d_004`, `log_005`, ...) so ids are stable and readable in dev tools / test
assertions.

**Imports.** None.

**Imported by.** `application/DiagramSessionService.ts` (log entry ids),
`infrastructure/reasoning/MockReasoningEngine.ts` (node/edge/label/decision ids).

### `application/DiagramSessionService.ts`

**Purpose.** The heart of the application layer — a plain observable class (subscribe/
notify, no framework dependency) implementing the two research mechanisms end to end:

- `generateFromPrompt(prompt)` — the **decision-confirmation loop**. Calls
  `reasoningEngine.parsePrompt()`, stores the returned decisions + draft graph, and drives
  the user through them one at a time via `confirmActiveDecision()` /
  `contestActiveDecision(chosenOptionIndex)`. When all decisions are resolved,
  `finalizeGeneration()` calls `layoutEngine.layout()` and flips `mode` to `ready`.
- `requestEdit(instruction, targetElementId?)` — the **dependency-aware edit loop**. Calls
  `reasoningEngine.proposeEdit()` for a direct diff + any decisions needed to disambiguate
  the instruction itself, then `domain/dependencyEngine.expandDependencies()` to find
  ripple effects, presents both (decisions first, then propagated effects) for
  confirmation, and on `confirmPropagatedEffects()` applies the diff and calls
  `layoutEngine.relayoutSubgraph()` with only the truly affected node ids.
- Also exposes `selectElement()`, `toggleLayer()`, `exportGraph()`, `cancelEdit()`.

Every state mutation goes through `setState()`, which shallow-merges into `this.state` and
notifies subscribers — this is what `useSyncExternalStore` in the presentation layer hooks
into.

**Imports.** `domain/entities.ts` (`applyGraphDiff`, `emptyGraph`, and types),
`domain/dependencyEngine.ts` (`expandDependencies`), `domain/ports.ts` (`IReasoningEngine`,
`ILayoutEngine`, `ITextToSpeech` — constructor parameter types only), `application/ids.ts`
(`nextId`), `application/types.ts` (`initialSessionState`, `SessionState`).

**Imported by.** `App.tsx` (instantiated once with concrete infrastructure classes),
`presentation/hooks/useDiagramSession.ts` (typed as the store), and every
`presentation/components/*` file that calls its methods (`ChatPane`, `DecisionDialogue`,
`Toolbar`, `DiagramCanvas` indirectly via `App.tsx` passing `state`/callbacks down).

### `infrastructure/reasoning/MockReasoningEngine.ts`

**Purpose.** A rule-based, offline stand-in for a real LLM, implementing `IReasoningEngine`
exactly as a Claude/GPT/Gemini-backed engine would need to. `parsePrompt()` scans the prompt
for a small fixed vocabulary of architecture nouns (client, server, database, load balancer,
cache, queue, api gateway, external service), builds a chain of nodes + edges in mention
order, and emits a `Decision` for every component-type, edge-directionality, and protocol
assumption it made. `proposeEdit()` pattern-matches a handful of edit verbs (`delete/remove
X`, `rename X to Y`, `add TYPE called NAME`) into a direct `GraphDiff`, falling back to a
disambiguating `Decision` if nothing matches. `reviseForDecision()` turns a user's chosen
alternative back into a `GraphDiff` (e.g. change a node's `type`, an edge's `protocol` or
`directionality`).

**Imports.** `application/ids.ts` (`nextId`), `domain/entities.ts` (types + `emptyGraph`),
`domain/ports.ts` (`IReasoningEngine`, `ParsePromptResult`, `ProposeEditResult` — implements
this interface).

**Imported by.** `App.tsx` only (composition root). This is the file you replace to connect
a real model.

### `infrastructure/layout/ElkLayoutEngine.ts`

**Purpose.** Implements `ILayoutEngine` using `elkjs` (bundled build, runs synchronously in
the main thread, no web worker needed). `layout(graph)` lays out every node (full layout,
used right after generation). `relayoutSubgraph(graph, affectedNodeIds)` pins every node
*not* in `affectedNodeIds` to its current `(x, y)` via elk's `elk.position` layout option, so
only genuinely affected nodes move — the mechanism behind the "spatial stability" guarantee.

**Imports.** `elkjs/lib/elk.bundled.js` (third-party), `domain/entities.ts` (`DiagramGraph`),
`domain/ports.ts` (`ILayoutEngine`, `LayoutResult`, `NodePosition` — implements this
interface).

**Imported by.** `App.tsx` only.

### `infrastructure/speech/WebSpeechTTS.ts`

**Purpose.** Implements `ITextToSpeech` via `window.speechSynthesis`. `speak(text)` cancels
any in-flight utterance and speaks the new one; used by `DiagramSessionService` to read
decision descriptions, propagated-effect summaries, and completion confirmations aloud
without any presentation-layer code needing to know speech is involved.

**Imports.** `domain/ports.ts` (`ITextToSpeech`).

**Imported by.** `App.tsx` only.

### `infrastructure/speech/WebSpeechSTT.ts`

**Purpose.** Implements `ISpeechToText` via the (vendor-prefixed) `SpeechRecognition` API.
`isSupported()` lets the UI grey out the mic button gracefully. `start(onResult, onEnd)`
begins listening and resolves the first transcript; `stop()` ends the session.

**Imports.** `domain/ports.ts` (`ISpeechToText`), ambient types from `../../speech.d.ts`.

**Imported by.** `App.tsx` (instantiated and passed down as a prop to `ChatPane`, since STT
is a UI-input concern rather than something the session service needs to drive itself).

### `speech.d.ts`

**Purpose.** Ambient `SpeechRecognition` interface declaration, because TypeScript's default
DOM lib does not consistently ship Web Speech API types across versions.

**Imports/Imported by.** Global ambient declaration file; not explicitly imported anywhere,
picked up automatically by the TypeScript compiler for any file referencing
`SpeechRecognition`/`webkitSpeechRecognition` (currently only `WebSpeechSTT.ts`).

### `presentation/hooks/useDiagramSession.ts`

**Purpose.** `useDiagramSession(service): SessionState` — a one-line wrapper around React's
`useSyncExternalStore(service.subscribe, service.getState)`. This is the only place React's
reactivity model touches `DiagramSessionService`.

**Imports.** `application/DiagramSessionService.ts` (type only), `application/types.ts`
(`SessionState`).

**Imported by.** `App.tsx`.

### `presentation/components/DiagramCanvas.tsx`

**Purpose.** Renders the single `<svg role="group">` root and stacks the three layer
components in paint order: `EdgesLayer` (bottom) → `NodesLayer` (middle) → `LabelsLayer`
(top). This ordering plus the fact that each is its own `<g>` is the literal implementation
of "dependency-aware, semantically-labeled layers" from the write-up.

**Imports.** `domain/entities.ts` (`DiagramGraph` type), `./EdgesLayer`, `./NodesLayer`,
`./LabelsLayer`.

**Imported by.** `App.tsx`.

### `presentation/components/NodesLayer.tsx`

**Purpose.** Renders one `<rect>` per node, colored/shaped by `NodeEntity.type`. Carries no
text. Handles click/keyboard selection (`onSelect`), reports `aria-label` from the node type
alone (since the human-readable name lives in the labels layer).

**Imports.** `domain/entities.ts` (`DiagramGraph`, `NodeType`).

**Imported by.** `presentation/components/DiagramCanvas.tsx`.

### `presentation/components/EdgesLayer.tsx`

**Purpose.** Renders one `<line>` per edge between the source/target node's computed
connection points, with an arrowhead marker reflecting `directionality`. Carries no text
(protocol is spoken via `aria-label`, not drawn) — the visible protocol string is a
`LabelEntity` in `LabelsLayer.tsx`, not part of this component.

**Imports.** `domain/entities.ts` (`DiagramGraph`).

**Imported by.** `presentation/components/DiagramCanvas.tsx`.

### `presentation/components/LabelsLayer.tsx`

**Purpose.** Renders one `<text>` per `LabelEntity`, positioned relative to its referenced
node's center or its referenced edge's midpoint plus the label's own `(dx, dy)` offset. The
*only* component that renders text in the diagram.

**Imports.** `domain/entities.ts` (`DiagramGraph`).

**Imported by.** `presentation/components/DiagramCanvas.tsx`.

### `presentation/components/Toolbar.tsx`

**Purpose.** Three checkboxes bound to `state.layerVisibility.{nodes,edges,labels}` calling
`service.toggleLayer()`, plus an "Export diagram JSON" button that serializes
`service.exportGraph()` to a downloadable file. Demonstrates that each layer is independently
addressable at the UI level, not just internally.

**Imports.** `application/DiagramSessionService.ts` (type), `application/types.ts`
(`SessionState`).

**Imported by.** `App.tsx`.

### `presentation/components/ChatPane.tsx`

**Purpose.** The conversational surface: text input + "Speak" (STT) + "Send" buttons, a
scrolling conversation log (`state.log`), inline error display, and it renders
`DecisionDialogue` beneath the log. Decides whether `Send` should call
`service.generateFromPrompt()` (graph is empty) or `service.requestEdit()` (graph already has
nodes), optionally scoping the edit to `state.selectedElementId`.

**Imports.** `application/DiagramSessionService.ts` (type), `application/types.ts`
(`SessionState`), `domain/ports.ts` (`ISpeechToText` — typed prop, concrete instance passed
in from `App.tsx`), `./DecisionDialogue`.

**Imported by.** `App.tsx`.

### `presentation/components/DecisionDialogue.tsx`

**Purpose.** The HCXAI confirmation UI. While `state.pendingDecisions` has an item at
`activeDecisionIndex`, shows its `description`, radio-button `options` (assumed option
pre-selected), and "Confirm assumption" / "Use selected alternative" buttons, calling
`service.confirmActiveDecision()` / `service.contestActiveDecision(index)`. Once decisions
are exhausted during an edit, if `state.stagedRecords.length > 0` it instead shows the
propagated-effects list with "Apply all" / "Cancel edit" buttons
(`service.confirmPropagatedEffects()` / `service.cancelEdit()`).

**Imports.** `application/DiagramSessionService.ts` (type), `application/types.ts`
(`SessionState`).

**Imported by.** `presentation/components/ChatPane.tsx`.

### `App.tsx` (composition root)

**Purpose.** The only file that names concrete infrastructure classes. `useComposedSession()`
constructs one `MockReasoningEngine`, one `ElkLayoutEngine`, one `WebSpeechTTS`, one
`WebSpeechSTT`, wraps the first three in a `DiagramSessionService`, and memoizes the result
for the component's lifetime. The top-level JSX wires `Toolbar`, `DiagramCanvas`, and
`ChatPane` to the shared `state` (from `useDiagramSession(service)`) and `service` methods.

**Imports.** `application/DiagramSessionService.ts`,
`infrastructure/reasoning/MockReasoningEngine.ts`, `infrastructure/layout/ElkLayoutEngine.ts`,
`infrastructure/speech/WebSpeechTTS.ts`, `infrastructure/speech/WebSpeechSTT.ts`,
`presentation/hooks/useDiagramSession.ts`, `presentation/components/DiagramCanvas.tsx`,
`presentation/components/ChatPane.tsx`, `presentation/components/Toolbar.tsx`.

**Imported by.** `main.tsx`.

### `main.tsx`

**Purpose.** Standard Vite/React entry point: mounts `<App />` into `#root` inside
`<StrictMode>`, imports `index.css`.

**Imports.** `App.tsx`, `index.css`.

**Imported by.** Nothing (loaded directly by `index.html`).

### `index.css`

**Purpose.** All styling: CSS variables for light/dark, the app shell grid (canvas pane +
chat pane), toolbar, chat log/input, and the decision-dialogue box. No CSS-in-JS or
component-scoped styles — one global stylesheet, kept flat deliberately for a
one-month prototype.

## 4. End-to-end data flow

### Generation ("a web app with a cache in front of the database")

1. `ChatPane` calls `service.generateFromPrompt(text)`.
2. `DiagramSessionService` calls `MockReasoningEngine.parsePrompt()` → `{ decisions, draftGraph }`.
3. State updates to `mode: 'confirming_generation'`, `graph: draftGraph`,
   `pendingDecisions: decisions`; `WebSpeechTTS.speak()` reads the first decision aloud.
4. `useDiagramSession` (via `useSyncExternalStore`) re-renders `App.tsx`'s subtree.
5. `DiagramCanvas` renders the (still-unconfirmed) draft graph through `EdgesLayer` /
   `NodesLayer` / `LabelsLayer`. `DecisionDialogue` renders the active decision.
6. User clicks "Confirm assumption" or picks an alternative and clicks "Use selected
   alternative" → `service.confirmActiveDecision()` / `contestActiveDecision(index)`.
   On contest, `MockReasoningEngine.reviseForDecision()` returns a `GraphDiff` merged in via
   `applyGraphDiff()` (from `domain/entities.ts`).
7. When `activeDecisionIndex` reaches the end of `pendingDecisions`,
   `finalizeGeneration()` calls `ElkLayoutEngine.layout(graph)`, merges positions back in,
   sets `mode: 'ready'`.

### Editing ("delete cache")

1. `ChatPane` calls `service.requestEdit(text, selectedElementId?)`.
2. `MockReasoningEngine.proposeEdit()` returns `{ decisions, diff }` — for a recognized verb
   like `delete`, `decisions` is empty and `diff = { removeNodeIds: [id] }`.
3. `domain/dependencyEngine.expandDependencies(graph, diff)` walks the graph, finds every
   edge touching that node and every label attached to the node or those edges, and returns
   an expanded diff + `DependencyRecord[]` explaining each removal in plain language.
4. If `decisions` is non-empty they're confirmed first (same one-at-a-time UI as
   generation); either way, once clear, `DecisionDialogue` shows the propagated-effects list
   from `stagedRecords`.
5. User clicks "Apply all" → `confirmPropagatedEffects()` → `applyStagedEdit()`: re-runs
   `expandDependencies` for the final `affectedNodeIds`, applies the diff via
   `applyGraphDiff()`, calls `ElkLayoutEngine.relayoutSubgraph(graph, affectedNodeIds)` —
   which, because a pure deletion produces an empty `affectedNodeIds`, returns no new
   positions at all, so every surviving node keeps its exact `(x, y)`.
6. `mode` returns to `'ready'`; `WebSpeechTTS.speak('Edit applied.')`.

## 5. Swapping the mock reasoning engine for a real model

1. Create `infrastructure/reasoning/ClaudeReasoningEngine.ts` (or GPT/Gemini) implementing
   `IReasoningEngine` from `domain/ports.ts` — same three methods
   (`parsePrompt`, `proposeEdit`, `reviseForDecision`), same return shapes.
2. In `App.tsx`, change one line: `new MockReasoningEngine()` → `new
   ClaudeReasoningEngine(apiKey)`.

No other file changes. `application/DiagramSessionService.ts`, every `presentation/*`
component, and `domain/*` are written entirely against the `IReasoningEngine` interface and
have no knowledge that a mock ever existed.

## 6. Schema pane, export, and live-model integration

Added after the initial milestone, in response to the feature request for a three-pane
layout (schema editor + canvas + chat), file/document upload, image export, and a
bring-your-own-key path to a live model. Same layering rule as Section 1 — the schema pane
is a fully independent vertical slice through domain/application/infrastructure/
presentation that happens to feed one value (a `SchemaModel` snapshot) into the diagram
pane at one call site. Neither pane imports the other's session service.

### New domain files

- **`domain/schema/entities.ts`** — `SchemaColumn`, `SchemaTable`, `SchemaModel`,
  `SchemaDiff` (mirrors `GraphDiff`'s shape/semantics), `applySchemaDiff()`,
  `primaryKeyCandidates()` (every PK column in the schema, used by the FK-cycling picker).
  Deliberately a separate model from `domain/entities.ts` — a relational schema and an
  architecture diagram are different things with different edit rules; the only bridge
  between them is `schemaToGraph.ts`, one explicit pure function.
- **`domain/schema/mermaidErParser.ts`** — `parseMermaidErDiagram(text)`, a pure regex-based
  parser for Mermaid `erDiagram` syntax (relationship lines + attribute blocks). Used by (a)
  `defaultSchema.ts`, (b) `MockSchemaReasoningEngine` whenever uploaded/typed text contains
  an `erDiagram` block, so pasting a design doc's existing ER diagram works immediately.
- **`domain/schema/defaultSchema.ts`** — the sample retail/warehouse star schema (8 tables)
  used by "Load default schema", expressed as the same Mermaid DSL and parsed through the
  parser above — a live regression check on the parser, not a separately hand-built fixture.
- **`domain/schema/schemaToGraph.ts`** — `schemaModelToDraftGraph(schema)`: pure conversion
  of a `SchemaModel` into a draft `DiagramGraph` (one `database`-typed node per table, one
  edge per resolved foreign key) plus the `Decision[]` this assumed (component type per
  table, protocol per edge) — feeding the *same* HCXAI confirmation loop prompt-driven
  generation uses. This is the "schema is automatically converted into an architecture
  diagram" requirement, implemented as a converter into the existing loop rather than a
  second, parallel one.

### Ports extended

- **`domain/ports.ts`** gained `ISchemaReasoningEngine` (`parseSchemaPrompt`,
  `reviseSchemaDecision`) — the schema-pane's Dependency Inversion boundary, symmetric with
  `IReasoningEngine`.

### New application files

- **`application/schemaTypes.ts`** — `SchemaSessionState`, mirrors `application/types.ts`.
- **`application/SchemaSessionService.ts`** — the schema pane's session service. Direct grid
  edits (add/remove/rename table or column) apply immediately, no confirmation needed —
  those are literal spreadsheet edits, not model interpretations. Only
  `generateFromPrompt()` (AI-driven parsing of free text or an uploaded document) produces
  `Decision`s that go through a one-at-a-time confirm/contest loop, same shape as
  `DiagramSessionService`'s but independently implemented (the two services intentionally
  don't share a base class — see the file's own header comment for the reasoning). Also
  owns `cycleColumnReference(tableId, columnId)`: each call advances a foreign-key column's
  `references` to the next primary-key candidate elsewhere in the schema, wrapping to
  "unset" after the last — the "press Enter to cycle candidates" interaction.
- **`application/DiagramSessionService.ts`** gained `generateFromSchema(schema)`, which
  calls `schemaModelToDraftGraph()` and then a newly extracted private `beginGeneration()`
  (factored out of `generateFromPrompt()`, which now also calls it) — one shared
  confirm/lock/layout pipeline regardless of whether the draft graph came from a prompt or
  a schema. Also gained `describeCurrentDiagram()` (see `describeGraph.ts` below).
- **`application/describeGraph.ts`** — `describeGraph(graph)`, a pure function producing
  plain-language bullets (component counts, every connection, any disconnected nodes) from
  a `DiagramGraph`. A GenAssist-inspired (Huh, Peng & Pavel, UIST 2023) post-generation
  description step: where GenAssist answers "what did the model produce?" via a VQA
  pipeline over pixels, this answers it directly from the graph's own data — always
  accurate by construction, no vision model needed. Wired to a "Describe diagram" button in
  `Toolbar.tsx` and to `ITextToSpeech`.

### New infrastructure files

- **`infrastructure/reasoning/MockSchemaReasoningEngine.ts`** — offline `ISchemaReasoningEngine`.
  Tries `parseMermaidErDiagram()` first; if the input has no `erDiagram` block, falls back to
  a simple line DSL (`TableName: col1 PK, col2, col3 FK->Other.col`) for freehand typing.
- **`infrastructure/config/settingsStore.ts`** — tiny localStorage wrapper for the Gemini API
  key (`getGeminiApiKey`/`setGeminiApiKey`) plus a subscribe/notify pair so the composition
  root can react to a saved key without a page reload.
- **`infrastructure/reasoning/geminiClient.ts`** — the one place that knows Gemini's REST
  request/response shape (`callGeminiForJson`, a single `fetch` against `generateContent`
  with `responseMimeType: "application/json"`). No SDK dependency.
- **`infrastructure/reasoning/GeminiReasoningEngine.ts`** /
  **`GeminiSchemaReasoningEngine.ts`** — live, key-backed implementations of
  `IReasoningEngine` / `ISchemaReasoningEngine`. Each prompts Gemini with the exact JSON
  shape our domain types expect and defensively coerces the response (unknown node types,
  missing fields, dangling ids are all normalized rather than trusted blindly, since an
  LLM's output is never 100% guaranteed to match even a very explicit instruction). **Not
  exercised against a real key as part of this build** — no key was available; correctness
  here rests on matching the documented Gemini `generateContent` contract and the app's own
  domain shapes, not on a live end-to-end run. Treat as reviewed-but-unverified until first
  use.

### New presentation files

- **`presentation/export/exportImage.ts`** — shared PNG/JPEG/SVG export pipeline.
  `exportSvgElement()` serializes the diagram canvas's own `<svg>` directly.
  `exportHtmlElementAsImage()` wraps an arbitrary HTML element (the schema grid) in an
  `<svg><foreignObject>` shell first, then both paths go through the same
  serialize-to-blob → `Image` → `<canvas>` → `toDataURL` rasterization for PNG/JPEG, or a
  direct blob download for SVG.
- **`presentation/components/ExportMenu.tsx`** — reusable PNG/JPEG/SVG button group, used by
  both `Toolbar.tsx` (diagram canvas, `kind="svg"`) and `SchemaPane.tsx` (schema grid,
  `kind="html"`).
- **`presentation/components/DocumentUpload.tsx`** — reusable `.txt`/`.md` file input
  (`FileReader`-based, no upload to any server); used by both `ChatPane.tsx` and
  `SchemaPane.tsx` to attach a document's contents to the next AI-generation request.
- **`presentation/components/SettingsPanel.tsx`** — the Gemini API key field ("bring your
  own key"; left blank by default per this milestone's scope — see write-up gap list).
  Saving calls `notifySettingsChanged()`, which `App.tsx` subscribes to in order to rebuild
  the composition root's engines on the next render, no reload required.
- **`presentation/components/SchemaPane.tsx`** — the schema editor: a toolbar (load
  default / clear / add table / generate-from-schema / export), an AI prompt row with
  document upload, `SchemaDecisionDialogue`, and the table grid itself. Tab order across
  cells is entirely native DOM order (inputs rendered in table→column order, no manual
  `tabIndex`); the one non-native control is the foreign-key cell
  (`<div tabIndex={0} role="button">`), whose `onKeyDown` calls
  `service.cycleColumnReference()` on Enter.
- **`presentation/components/SchemaDecisionDialogue.tsx`** — schema-pane counterpart to
  `DecisionDialogue.tsx`; intentionally a separate component rather than a shared generic,
  per the "independent files, easy to collaborate on in parallel" goal.
- **`presentation/hooks/useObservableService.ts`** — the `useSyncExternalStore` binding,
  generalized out of `useDiagramSession.ts` so `useSchemaSession.ts` could reuse it without
  either hook depending on the other's service type.

### Schema pane visual rewrite: `presentation/schema/`

The schema pane originally rendered tables as a vertically stacked, scrolling list of
cards. Replaced with an ER-diagram-style canvas — colored table boxes connected by
relationship lines, positioned by a layout algorithm and scaled to fit the pane's height
with **no vertical scrolling**, visually in the idiom of the reference ER diagram while
staying fully interactive and screen-reader accessible (real `<input>`/`<select>`/`<button>`
elements, native tab order — nothing here is a rendered picture of a diagram).

- **`presentation/schema/layoutSchemaTables.ts`** — `layoutSchemaTables(schema)`, elkjs-based
  positioning of table boxes from their foreign-key relationships (mirrors
  `ElkLayoutEngine.ts`'s approach, kept separate because table screen position is transient
  view state, not part of `SchemaModel`).
- **`presentation/schema/tablePalette.ts`** — the cycling pastel per-table header palette
  that gives each table box a distinct color, the way the reference ER diagram does.
- **`presentation/schema/useFitScale.ts`** — a `ResizeObserver`-driven hook computing the CSS
  `transform: scale(...)` that fits the laid-out content into the visible pane without
  vertical overflow (never upscales past 1; floors at a legibility minimum, beyond which
  horizontal scroll is the fallback — vertical scroll is what's disallowed, not scroll
  entirely).
- **`presentation/schema/SchemaConnectors.tsx`** — the relationship-line SVG overlay,
  `aria-hidden` (every relationship it draws is already stated in the accessible
  foreign-key cell text, so it's decorative, not a second source of truth).
- **`presentation/schema/SchemaTableBox.tsx`** — one colored, editable table box.
- **`presentation/schema/SchemaDiagramCanvas.tsx`** — composes the three above: runs the
  layout, applies the fit scale, renders the connectors under the table boxes. Exposes a
  `contentRef` so `SchemaPane.tsx`'s `ExportMenu` rasterizes exactly this element.

`SchemaPane.tsx` now renders `SchemaDiagramCanvas` in place of the old card list; its
toolbar/prompt row are unchanged.

### Zoom into a pane: `ExpandablePane.tsx`

Each of the three top-level panes can be expanded to fill the whole viewport and collapsed
back: Tab to a pane, Enter to zoom in, Escape to return to the three-pane view.

- **`presentation/components/ExpandablePane.tsx`** — a generic wrapper (no service
  dependency) used identically for all three panes. Not expanded/not hidden: a
  `tabIndex={0}` `<section>` whose `onKeyDown` expands on Enter — but only when the
  *wrapper itself* is the focused element (`e.target === e.currentTarget`), so Enter on a
  button or input inside the pane is never hijacked into a zoom. Expanded: an Escape
  handler that fires from *any* focused descendant (Escape is meant to work as "back out of
  here" regardless of how deep the user tabbed in), and a visible "Collapse (Esc)" bar for
  mouse users. Hidden (a *different* pane is expanded): rendered with the native `hidden`
  attribute rather than unmounted — the pane's own component (and its session-service
  subscription, and any in-progress typed draft) stays alive underneath, the browser just
  removes it from layout, tab order, and the accessibility tree for free.
- On collapse, an effect returns focus to the wrapper `<section>` itself, so keyboard users
  land somewhere sensible instead of at the top of the document.
- `App.tsx` holds one `expandedPane: 'schema' | 'canvas' | 'chat' | null` state value and
  passes `isExpanded`/`isHidden`/`onExpand`/`onCollapse` into each `ExpandablePane`.
  `app-main--pane-expanded` collapses the CSS grid to one column when any pane is expanded.

**A real bug caught while testing this**: the pane wrapper classes (`.schema-pane-wrapper`,
`.canvas-pane`, `.chat-pane-wrapper`) all set `display: flex` unconditionally, which has
higher CSS specificity than the browser's default `[hidden] { display: none }` UA-stylesheet
rule — so a "hidden" pane was still rendering (its Toolbar was visibly leaking in below the
expanded schema pane). Fixed with an explicit `.pane[hidden] { display: none !important; }`
override in `index.css`, ahead of the per-pane display rules.

### One shared id generator: `domain/idGenerator.ts`

A second real bug surfaced while testing the zoom feature (loading the default schema, then
clicking "Add table", produced a React "duplicate key: col_002" warning). Root cause: three
separate module-level `let counter = 0` id generators existed independently —
`application/ids.ts`, a local one in `mermaidErParser.ts`, and another in
`schemaToGraph.ts` — and the first two both minted bare, un-namespaced prefixes like `"col"`,
so two unrelated tables' columns could legitimately both land on `"col_002"`.

Fixed by moving id generation into `domain/idGenerator.ts` — the one counter the entire app
now shares — with `application/ids.ts` reduced to a re-export (existing `from './ids'`
imports across `application/` keep working unchanged) and `mermaidErParser.ts` /
`schemaToGraph.ts` / `dependencyEngine.ts` all calling the same function directly. This also
fixed a pre-existing, unrelated layering violation: every `infrastructure/reasoning/*.ts`
engine had been importing `nextId` from `../../application/ids` — infrastructure depending on
application, backwards from the documented dependency direction in Section 1. They now import
`nextId` from `../../domain/idGenerator` instead, which is the direction the architecture was
always supposed to have.

### `App.tsx` composition root, updated

`useComposedSession()` now reads `getGeminiApiKey()` and picks `GeminiReasoningEngine` /
`GeminiSchemaReasoningEngine` when a key is present, `MockReasoningEngine` /
`MockSchemaReasoningEngine` otherwise — the same Dependency Inversion seam described in
Section 5, just with a second concrete pair to choose from. It also constructs
`SchemaSessionService` alongside `DiagramSessionService`, and subscribes to
`subscribeToSettings()` so saving a key in `SettingsPanel` triggers `useMemo` to rebuild both
services (a `settingsVersion` counter is the memo dependency). The JSX now renders three
sections — `SchemaPane`, the canvas + `Toolbar`, and `ChatPane` — where `SchemaPane`'s
"Generate architecture diagram" button calls `diagramService.generateFromSchema(schemaState.schema)`,
the one call site where the two panes' independent session services meet.

### Verified vs. not yet verified in this pass

Verified end-to-end with a Playwright smoke test against the dev build: loading the default
8-table schema, native Tab traversal landing correctly on the foreign-key cell, the Enter-to-
cycle interaction changing a reference, "Generate architecture diagram" running all 24
resulting decisions through confirmation and rendering an 8-node/13-edge diagram, "Describe
diagram" logging a GenAssist-style summary, PNG export triggering a real file download, and
the Settings panel opening with the API-key field present — zero console errors throughout.
**Not** verified: the two Gemini-backed engines (no API key available in this environment)
and the schema pane's own HTML-to-image export path (`exportHtmlElementAsImage`) beyond a
type-check — `foreignObject`-based rasterization is a known-finicky browser feature and
should be spot-checked in a real browser before relying on it.
