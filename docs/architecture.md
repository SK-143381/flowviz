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
