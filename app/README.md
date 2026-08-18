# FlowViz — preliminary architecture

Accessible, AI image generation for BLV users. Implements the two
mechanisms from the write-up: a decision-confirmation (HCXAI) loop for generation, and a
dependency-aware edit loop for collateral-free regional editing.

## Layout (Clean Architecture, dependencies point inward)

```
src/
  domain/            entities.ts, ports.ts, dependencyEngine.ts
                      Pure types + interfaces. No React, no I/O, no framework imports.
                      This is the only place "what a diagram is" is defined.

  application/         DiagramSessionService.ts, types.ts
                      The two loops, as an observable state machine. Depends only on
                      domain/ports.ts (IReasoningEngine, ILayoutEngine, ITextToSpeech) —
                      never on a concrete engine.

  infrastructure/       reasoning/MockReasoningEngine.ts
                      layout/ElkLayoutEngine.ts
                      speech/WebSpeechTTS.ts, WebSpeechSTT.ts
                      Concrete adapters implementing the domain ports. Swappable.

  presentation/         components/, hooks/useDiagramSession.ts
                      React only. Renders SessionState, calls service methods. Contains
                      no business logic beyond local form state.

  App.tsx             Composition root — the only file that names concrete
                      infrastructure classes and wires them into the service.
```

Dependency direction: `presentation -> application -> domain <- infrastructure`.
Nothing in `domain/` or `application/` imports from `infrastructure/` or `presentation/`.

## No live LLM connected (by design, for this milestone)

`MockReasoningEngine` implements `IReasoningEngine` with a small rule-based parser instead
of an API call, so the two loops are demoable offline. To connect a real model (Claude
Sonnet/Opus, GPT, Gemini — see write-up Section 4), write one new class implementing
`IReasoningEngine` and change one line in `App.tsx`'s `useComposedSession`. Nothing in
`application/` or `presentation/` needs to change — that's the point of the port.

## The layer model

Per the write-up: "nodes should be on layer, text should be one, the edges should be one."
This is enforced at the **entity level**, not just at render time:

- `NodeEntity` — geometry + type. No text field.
- `EdgeEntity` — topology (source/target/protocol/directionality). No text field.
- `LabelEntity` — the _only_ place text lives; it references a node or edge by id.

`DiagramCanvas.tsx` renders exactly three `<g role="img" aria-label="...">` groups, one per
layer, in paint order edges → nodes → labels. Renaming a node touches one `LabelEntity`;
it cannot move the node's rectangle or re-route an edge, because those live in disjoint
data structures rendered by disjoint components (`EdgesLayer`, `NodesLayer`, `LabelsLayer`).

## The two loops

**Decision-confirmation loop** (`DiagramSessionService.generateFromPrompt`): the reasoning
engine returns a draft graph _and_ a list of `Decision`s it had to assume to build it
(component type, cardinality, edge directionality, protocol, grouping, layout hierarchy).
These are presented one at a time (`DecisionDialogue.tsx`), spoken aloud (`ITextToSpeech`),
and can be confirmed or contested with an alternative before the graph is locked and laid
out (`ElkLayoutEngine.layout`).

**Dependency-aware edit loop** (`DiagramSessionService.requestEdit`): a free-text edit
instruction produces a _direct_ diff; `domain/dependencyEngine.ts` walks that diff to find
every element that structurally depends on it (an edge cannot outlive its endpoints, a
label cannot outlive its element) and turns each ripple into a human-readable
`DependencyRecord`. These are read aloud and confirmed before the diff is applied. Only the
affected nodes are re-laid-out (`ElkLayoutEngine.relayoutSubgraph`); everything else keeps
its exact position — the "spatial stability" metric from the write-up's evaluation plan.

## Three-pane layout, schema editing, and live models

The app is three panes: **schema** (left) → **diagram canvas** (center) →
**chat** (right). The schema pane is a fully editable relational-schema grid — Tab moves
cell to cell in native DOM order, Enter on a foreign-key cell cycles through candidate
primary keys elsewhere in the schema. "Load default schema" loads an 8-table retail/
warehouse sample; "Generate architecture diagram →" converts whatever's in the grid into a
draft node/edge graph and runs it through the _same_ HCXAI decision-confirmation loop
prompt-driven generation uses (see `docs/architecture.md` Section 6). Both the schema pane
and the chat pane accept a `.txt`/`.md` upload whose contents are prepended to the next
generation request — including a document that already contains a Mermaid `erDiagram`
block, which is parsed deterministically rather than guessed at.

Every pane with a canvas/grid has an **Export image** control (PNG / JPEG / SVG), plus the
diagram canvas keeps its JSON export and gained a **Describe diagram** button (a
GenAssist-style plain-language summary, read aloud).

## One chat pane, two pipelines, three modes (see `docs/architecture.md` Section 7)

The chat pane on the right drives **both** the diagram and the schema — a small toggle at
its top switches which one a message targets. For whichever is targeted: an empty
graph/schema routes the message through **Create**; a non-empty one routes it through
**Edit** (both panes now support natural-language edits, not just the diagram). Once
generation finishes, the assistant automatically posts a plain-language summary of what it
built and asks a follow-up question in the same chat log (**Describe**) — replying with a
correction is just the next chat message, routed straight through Edit. Every interpretive
decision it needs you to confirm is a single click/tap: select the option you want (your pick
doesn't have to match its guess) and it advances immediately — no separate confirm button.
A `"Thinking…"` status appears in the log during any network round-trip, and a **Settings**
checkbox lets you mute spoken confirmations if you don't want the browser's tab-level "playing
audio" indicator showing up while you work.

Once a diagram has been generated **from** a schema (via "Generate architecture diagram"),
the two stay in sync: editing either one — including a structural edit like "split
CUSTOMERS into VIP and non-VIP customers" — automatically reflects on the other side, logged
as a `"Synced from schema: …"` / `"Synced from diagram: …"` chat entry. A diagram built from
a free-text prompt instead of a schema has nothing to sync with and behaves exactly as
before.

**Bring your own Gemini key**: click **Settings** and paste an API key — nothing is
required to run the app, but once a key is saved, both the diagram and schema reasoning
engines switch from the offline mock parser to live Gemini generation automatically (no
reload). The key is stored in `localStorage` only; it never touches any server other than
Google's own API.

## Running it

```bash
npm install
npm run dev
```

Try: `a web app with a cache in front of the database` to generate, then (after
confirming) `delete cache` or `rename database to Orders DB` to edit. On the schema side,
click **Load default schema**, or type `Users: id PK, name, email` and **Generate schema**.
Screen-reader users should get full text/aria coverage from the toolbar, decision dialogue,
and layer groups; this has only been smoke-tested with the browser's accessibility tree
(Playwright) and manual keyboard traversal, not yet with NVDA/VoiceOver — that pass is the
immediate next step, not part of this milestone.

## Known simplifications in this preliminary pass

- `MockReasoningEngine` / `MockSchemaReasoningEngine` understand a small fixed vocabulary
  and a handful of edit verbs / a simple line DSL. This matches the write-up's month-one
  domain-vocabulary scope constraint (Section 4). `GeminiReasoningEngine` /
  `GeminiSchemaReasoningEngine` exist and are wired up, but have **not been exercised
  against a real API key** in this environment — treat as reviewed, not verified, until
  first live use.
- `relayoutSubgraph` pins unaffected nodes via `elk.position` rather than a full
  incremental-layout algorithm; good enough to validate the "unrelated nodes don't move"
  claim, not a production incremental layout.
- Schema-decision categorization (fact vs. dimension table) is informational only —
  `reviseSchemaDecision` doesn't yet change structure, matching the existing gap where the
  diagram loop's `cardinality`/`grouping` decisions are also no-ops today.
- `exportHtmlElementAsImage` (schema-pane PNG/JPEG/SVG export) uses an SVG
  `<foreignObject>` wrapper, a known-finicky browser feature; it type-checks and the
  direct-SVG diagram export path was verified against a real download, but the HTML path
  itself should be spot-checked in a real browser before relying on it.
- No persistence/backend yet — session state lives in memory for the tab's lifetime.
- No NVDA/VoiceOver pass yet on the new schema-grid controls (custom foreign-key cell,
  Tab/Enter interaction) — only keyboard-driven Playwright testing so far.
- Bidirectional schema↔diagram sync (`SyncCoordinator`) is best-effort, especially on the
  offline Mock engines — the "split one node/table into several" case is handled by a small
  heuristic, not real reasoning. A translation failure is caught and logged, never blocks or
  rolls back the edit that already succeeded on its own side. Only diagrams generated *from*
  a schema are linked; sync itself has not been exercised against a live Gemini key (same
  caveat as the rest of the Gemini-backed engines above).
- `translateDiagramEdit`/`translateSchemaEdit` only react to structural diffs (add/remove/
  rename/split-shaped changes) — node/edge position (layout-only) changes never sync, and
  schema-side column-level edits (add/remove/edit a column, cycle a foreign key) have no
  diagram-level equivalent to sync to.
