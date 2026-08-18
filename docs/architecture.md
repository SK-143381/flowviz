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

## 7. Chat unification, Edit/Describe pipelines for schema, decision-UX fixes, and bidirectional schema↔diagram sync

A larger follow-up pass addressing: no single chat surface driving both panes, no NL edit
pipeline for schema (only diagram had one), no dialogic post-generation follow-up, a
confusing two-button decision-confirmation flow, diagram nodes rendering unlaid-out during
confirmation, no way to mute spoken output, and no propagation between the diagram and the
schema it was generated from when either is edited afterward.

### Unified `ChatPane.tsx`

`ChatPane` now drives **both** session services from one surface instead of `SchemaPane.tsx`
owning a second, weaker prompt row. Props changed from `{ state, service, stt }` to
`{ diagramState, diagramService, schemaState, schemaService, stt, onDiagramNeedsConfirmation? }`.
A `target: 'diagram' | 'schema'` radio toggle (`.chat-target-toggle`) at the top of the pane
selects which service the input/log/decision-dialogue below it is bound to; submit still
uses the same empty-graph/empty-schema heuristic to decide Create vs. Edit
(`isEmptyGraph`/`isEmptySchema`), just per-target now. `SchemaPane.tsx` lost its
`schema-prompt-row` form, `SchemaDecisionDialogue`, and error paragraph entirely — those are
now rendered by `ChatPane` when `target === 'schema'`; this is also the first time
`SchemaSessionState.log` (always populated, never previously rendered anywhere) becomes
visible in the UI. `ChatPane` also auto-switches `target` to `'diagram'` and calls
`onDiagramNeedsConfirmation()` — wired in `App.tsx` to un-expand any zoomed pane other than
`chat` — whenever the diagram enters `confirming_generation`/`confirming_edit`, so a decision
raised by clicking "Generate architecture diagram" in the schema pane is never silently
hidden behind the wrong toggle state or an unrelated expanded pane.

### Schema Edit pipeline (new)

`SchemaSessionService` previously only supported Create (`generateFromPrompt`); it had no
edit equivalent to `DiagramSessionService.requestEdit`. Added:
- `domain/ports.ts`: `ISchemaReasoningEngine.proposeEdit(instruction, currentSchema): Promise<{decisions, diff: SchemaDiff}>`.
- `GeminiSchemaReasoningEngine.proposeEdit` / `MockSchemaReasoningEngine.proposeEdit` —
  mirror the diagram engines' `proposeEdit`. The Gemini path reuses a new
  `SCHEMA_EDIT_CONTRACT` (a diff-shaped sibling of the existing full-schema
  `SCHEMA_CONTRACT`) and a new `coerceSchemaDiff(raw, currentSchema)` that fabricates real
  ids for brand-new tables/columns while reusing exact existing ids the model was told to
  reuse, resolving FK references across both in a second pass (mirrors `coerceGraph`'s
  two-pass approach in `GeminiReasoningEngine.ts`). The Mock path pattern-matches
  `delete/remove <table>`, `rename <table> to <name>`, `add <column> to <table>`, falling
  back to a disambiguating `Decision` (never a silent no-op), mirroring
  `MockReasoningEngine.proposeEdit`.
- `SchemaSessionService.requestEdit(instruction)` — applies the diff immediately (schema
  mutations are already synchronous, no staging system like the diagram's
  `expandDependencies` exists or is needed here) then reuses the existing decision-confirm
  loop if the engine raised any decisions.

### Dialogic Describe pipeline (new)

Previously "Describe" only existed as `describeGraph.ts`, a deterministic, non-conversational
summary behind a toolbar button. Added a second, LLM-driven, chat-based describe step that
fires automatically once generation finishes:
- `domain/ports.ts`: `IReasoningEngine.describe(graph): Promise<string>` /
  `ISchemaReasoningEngine.describeSchema(schema): Promise<string>` — return one short
  paragraph that summarizes the result and ends with a concrete follow-up question.
- `infrastructure/reasoning/geminiClient.ts` gained `callGeminiForText` (same request shape
  as `callGeminiForJson` minus `responseMimeType: "application/json"`, for plain prose).
- Mock engines answer deterministically from their own data (node/type counts;
  table/column counts) plus a static follow-up question, keeping the offline demo path
  free of any network dependency.
- `DiagramSessionService.finalizeGeneration()` and the two places `SchemaSessionService`
  transitions to `mode: 'ready'` now call a private `announceAndAsk()` that logs + speaks
  the result. Because the chat input already routes non-empty-graph/schema text through the
  Edit pipeline, "answering" the follow-up question *is* just the user's next chat message —
  no new state machine or UI was needed for the dialogic loop itself.
- The original toolbar `describeCurrentDiagram()` / **Describe diagram** button was left
  unchanged as a free, always-available, non-LLM fallback.

### `thinking` state (new)

Neither session's `mode` changes until an async reasoning/layout call actually resolves, so
the entire network round-trip previously had zero UI feedback. Added `thinking: boolean` to
both `SessionState` (`application/types.ts`) and `SchemaSessionState`
(`application/schemaTypes.ts`), set `true`/`false` around every method that awaits a
reasoning-engine or layout-engine call (`generateFromPrompt`, `generateFromSchema`,
`requestEdit`, `resolveActiveDecision`, `confirmPropagatedEffects` on the diagram side; the
schema-side equivalents). `ChatPane` folds `thinking` into its existing `busy` disablement and
renders a `"Thinking…"` status entry in the chat log (`role="status"`); both decision
dialogues render the same status text and disable their controls while `thinking`.

### TTS mute toggle (new)

The reported "audio clip image" during confirmations was diagnosed as the browser's own
tab-level "playing audio" indicator, triggered by `WebSpeechTTS.speak()` firing on every
confirmation/description with no way to turn it off. Added
`getSpeechEnabled`/`setSpeechEnabled` to `infrastructure/config/settingsStore.ts`
(localStorage-backed, default `true`), a checkbox in `SettingsPanel.tsx`, and a check in
`WebSpeechTTS.speak()` that no-ops when disabled.

### Decision-confirmation UX rewrite

Two related bugs in `DecisionDialogue.tsx` / `SchemaDecisionDialogue.tsx`:
1. The original "Confirm assumption" / "Use selected alternative" two-button layout ignored
   the radio selection when "Confirm assumption" was clicked — it always applied the
   originally-assumed option regardless of what was selected, discarding the user's choice.
   Fixed by removing both buttons: selecting a radio option now directly calls
   `confirmActiveDecision()` (if it matches the assumed option) or
   `contestActiveDecision(i)` (otherwise) — selecting *is* the action.
2. That fix initially still pre-checked the assumed option by default, which reintroduced a
   worse bug: clicking an *already-checked* radio never fires a DOM `change` event, so
   confirming the default guess silently did nothing (this is what broke
   `scripts/smoke-test.mjs`'s "dependency-aware edit" and "export" scenarios — the confirm
   loop stalled and left `#chat-input` permanently disabled). Fixed by starting `chosen` at
   `null` on every new decision instead of pre-selecting the guess — every pick, including
   the guess itself, is then a genuine unchecked→checked transition and reliably fires
   `onChange`. This also keeps full keyboard accessibility (arrow-key navigation between
   radios relies on `onChange`, not `onClick`/`click` synthesis).
   Copy was also reworded to read as dialogue rather than a form ("Quick check 1 of 3", "Did
   I get that right? Pick one to confirm it.", "(my guess)" instead of "(assumed)").
   `scripts/smoke-test.mjs` was updated to click the `.decision-option:has-text("(my guess)")
   input[type="radio"]` instead of a named confirm button.

### Unlaid-out node render during confirmation (bug fix)

`DiagramSessionService.beginGeneration()` previously put the raw draft graph straight into
`state.graph` — every node still at its parse-time default `(0, 0)` — for the entire
confirmation loop; `ElkLayoutEngine.layout()` only ran afterward in `finalizeGeneration()`.
The result was every node/label rendering stacked on top of each other, an illegible clump
mistaken for a stray image. Fixed by running `layoutEngine.layout(draftGraph)` immediately in
`beginGeneration()` (falling back to the raw positions if layout throws, since layout here is
a visual nicety, not load-bearing), so the canvas always shows a laid-out diagram even before
any decision is confirmed.

### Bidirectional schema ↔ diagram sync (new)

Previously `DiagramSessionService.generateFromSchema()` was a one-shot, one-way conversion —
after that call, `DiagramSessionService` and `SchemaSessionService` had no further knowledge
of each other (per the class docstrings, deliberately). Added real two-way sync: an edit on
either side of a *linked* pair — including a structural edit an LLM invents on its own, like
splitting one node/table into several — now propagates to the other side automatically.
Neither session service gained a reference to the other; a new coordinating class is the only
thing that reaches into both, same seam `App.tsx` already used for the one-shot conversion.

- **`domain/sync.ts`** (new) — `Correspondence { nodeToTable, tableToNode }` plus pure
  helpers `emptyCorrespondence()`, `addCorrespondencePairs()`, `removeCorrespondenceFor()`.
- **`domain/schema/schemaToGraph.ts`** — `schemaModelToDraftGraph()` now also returns
  `correspondence: Array<{ tableId, nodeId }>`, the table↔node id mapping it already built
  internally and previously discarded.
- **`domain/ports.ts`** — `TranslatedEdit<D> { diff: D; addCorrespondence?; removedNodeIds?;
  removedTableIds? }`, plus `IReasoningEngine.translateSchemaEdit(diff: SchemaDiff,
  correspondence, currentGraph): Promise<TranslatedEdit<GraphDiff>>` and
  `ISchemaReasoningEngine.translateDiagramEdit(diff: GraphDiff, correspondence, currentGraph,
  currentSchema): Promise<TranslatedEdit<SchemaDiff>>` — each engine translates *into* its
  own domain's diff shape. Implemented in all four reasoning engines
  (`GeminiReasoningEngine`, `GeminiSchemaReasoningEngine`, `MockReasoningEngine`,
  `MockSchemaReasoningEngine`); `GeminiSchemaReasoningEngine.coerceSchemaDiff` was changed to
  also return its internal `newTableIdMap` (model-placeholder-id → real generated table) so
  `translateDiagramEdit` can build `addCorrespondence` pairs directly from it. Mock engines
  special-case the "split" diff shape (one node/table removed, several added in the same
  diff) as a demoable offline heuristic; deterministic id-based removal is folded in on top
  of whatever each engine's own translation proposes, so a removed table/node is never missed
  even if the model forgets to mention it.
- **`DiagramSessionService`** — `onEditApplied(listener)` fires with the already
  dependency-expanded `GraphDiff` right when `applyStagedEdit()` applies it;
  `onGeneratedFromSchema(listener)` fires once with the correspondence right when
  `generateFromSchema()` computes the draft graph. New `applySyncedDiff(diff, summary)`
  applies an already-decided diff directly (re-running `expandDependencies` +
  `relayoutSubgraph`) and logs `"Synced from schema: <summary>"` — deliberately bypasses the
  normal decision-confirmation loop (the user already confirmed the original edit on the
  schema side) and does not itself emit `onEditApplied`, so it can never re-trigger a
  translation back the other way.
- **`SchemaSessionService`** — every method that used to call `applySchemaDiff` directly
  (`addTable`, `removeTable`, `renameTable`, `addColumn`, `removeColumn`, `updateColumn`,
  `requestEdit`) now routes through one new private `mutate(diff, extraPatch?)`, the single
  choke point that applies the diff, updates state, and emits `onEditApplied` — so both
  AI-driven and direct grid edits are covered, not just chat. `cycleColumnReference`
  deliberately still bypasses `mutate()` (it fires on every keystroke while browsing FK
  candidates, and a column-level FK change has no node-level diagram equivalent to sync
  anyway). `loadDefaultSchema`/`clearSchema` emit a new `onReset` event instead (a full
  replacement, not a diff — legitimately breaks any existing link). New
  `applySyncedDiff(diff, summary)` mirrors the diagram side: applies directly (also
  replicating `removeTable()`'s own FK-reference cleanup for any removed table, since this
  bypasses that method), logs `"Synced from diagram: <summary>"`, does not call `mutate()`.
- **`application/SyncCoordinator.ts`** (new) — constructed at the composition root with both
  session services and both reasoning engines. Subscribes to
  `diagramService.onGeneratedFromSchema` to establish `this.correspondence`, to
  `schemaService.onReset` to clear it, and to both `onEditApplied` hooks to translate and
  apply the change on the other side via the new port methods above. An `applying` boolean
  guards against re-entrant translation during an in-flight sync (belt-and-suspenders; the
  `applySyncedDiff` methods not emitting `onEditApplied` already prevents an infinite loop on
  their own). Failures are caught and logged to `console.error` — the original edit already
  succeeded, so a translation failure never blocks or rolls it back.
- **`App.tsx`** — `useComposedSession()` now also constructs one `SyncCoordinator` per
  composition (same `settingsVersion`-keyed `useMemo` as the two services), passing it the
  same `reasoningEngine`/`schemaReasoningEngine` instances already selected for the two
  services.

**Explicit scope for this pass** (see the plan this was built from,
`nested-soaring-moon.md`, for the reasoning): only a diagram generated **from** a schema is
linked — a diagram built from a free-text prompt has nothing to sync with, and works exactly
as before. Node/edge position (layout-only) changes never sync, only structural diffs do.
Translation is best-effort, especially on the Mock engines; a translation failure is logged,
never blocks the edit that already succeeded on its own side.
