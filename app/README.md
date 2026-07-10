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

## The layer model (why edits don't have collateral damage)

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

## Running it

```bash
npm install
npm run dev
```

Try: `a web app with a cache in front of the database` to generate, then (after
confirming) `delete cache` or `rename database to Orders DB` to edit. Screen-reader users
should get full text/aria coverage from the toolbar, decision dialogue, and layer groups;
this has only been smoke-tested with the browser's accessibility tree, not yet with
NVDA/VoiceOver — that pass is the immediate next step, not part of this milestone.

## Known simplifications in this preliminary pass

- `MockReasoningEngine` understands a small fixed vocabulary (client, server, database,
  load balancer, cache, queue, api gateway, external service) and a handful of edit verbs
  (delete/remove, rename ... to, add ... called ...). This matches the write-up's
  month-one domain-vocabulary scope constraint (Section 4).
- `relayoutSubgraph` pins unaffected nodes via `elk.position` rather than a full
  incremental-layout algorithm; good enough to validate the "unrelated nodes don't move"
  claim, not a production incremental layout.
- No persistence/backend yet — session state lives in memory for the tab's lifetime.
- No tactile/raster export yet, only JSON graph export (`Toolbar.tsx`), scoped as the
  first tracer round-trip through the architecture.
