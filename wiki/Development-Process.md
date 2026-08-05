# Development Process

FlowViz started life as a literature review, not a codebase. Before any code was written,
the project spent time establishing that the thing being proposed did not already exist in
the academic or commercial literature, because building an accessible authoring tool is
expensive enough in review cycles and participant time that it is worth spending a week up
front making sure the core idea is actually new. That review is preserved in full in
[`docs/write-up.md`](../docs/write-up.md), and its conclusions are summarized for a general
audience in [Accessibility and Novelty](./Accessibility-and-Novelty.md).

What follows is the build itself, in the order it actually happened, reconstructed from the
git history rather than written after the fact from memory.

## Week 1: scaffold, the two research mechanisms first

The very first commit after the literature review was not a UI. It was the domain layer:
`NodeEntity`, `EdgeEntity`, `LabelEntity`, the `Decision` and `GraphDiff` shapes, and the
pure `applyGraphDiff` function, with zero React and zero I/O. This ordering was deliberate.
The write-up's contribution is two specific mechanisms, a decision-confirmation loop and a
dependency-aware edit loop, and if those two loops are wrong, no amount of polish on top of
them matters. So the first working version of FlowViz was the two loops running against a
rule-based mock reasoning engine (`MockReasoningEngine`), with a bare-bones canvas and chat
pane, and no styling to speak of. This let the team validate the actual research claims,
that an interpretive decision never reaches the rendered diagram unconfirmed, and that
editing one node never silently moves an unrelated one, before spending any time on how the
app looked.

The mock reasoning engine exists specifically so this validation did not depend on having a
working LLM integration yet, or on paying for API calls during iteration. It implements the
exact same `IReasoningEngine` interface a real model-backed engine would, so replacing it
later would be a one-line change in the composition root, not a rewrite. That promise is
tested directly, `application/` and `presentation/` have zero references to
`MockReasoningEngine` anywhere in their source, so the mock cannot quietly leak assumptions
into the rest of the app.

Layout came from `elkjs` rather than a hand-rolled layout algorithm, and rendering went
straight to semantic SVG groups, one `<g>` per layer (edges, nodes, labels), rather than a
single flattened drawing surface. Both choices trace directly back to the write-up's claim
that a graph-first representation gives you accessible layer boundaries and dependency
structure for free, instead of needing a segmentation model to reconstruct them from pixels
after the fact.

Deployment was wired up early too, a GitHub Actions workflow builds the Vite app and
publishes it to GitHub Pages on every push to `main`. Getting a real, shareable URL working
in week one, instead of at the end, meant every subsequent change could be sanity-checked
against a live deployment, not just a local dev server.

## Week 2: the schema pane, document upload, export, and bring-your-own-key

The second phase added a second, parallel authoring surface: a schema pane where a user can
build or paste an entity-relationship model (tables, columns, primary and foreign keys) and
convert it into an architecture diagram through the same decision-confirmation loop the chat
pane uses. This was implemented as a genuinely separate vertical slice through
domain/application/infrastructure/presentation, not a variant of the diagram pane, because a
relational schema and a system-architecture diagram are different things with different edit
rules. The only bridge between them is `schemaToGraph.ts`, one explicit pure function that
turns a `SchemaModel` into a draft `DiagramGraph` and feeds it into the same confirmation
loop prompt-driven generation already used.

Three things shipped alongside the schema pane in this phase:

- **Document upload.** A plain `FileReader`-based `.txt`/`.md` file input, with no upload
  to any server, so a user can attach a design document's contents to a generation prompt.
  See [Privacy and Security](./Privacy-and-Security.md) for why this stayed entirely
  client-side rather than going through a backend.
- **Image export.** PNG, JPEG, and SVG export for both the diagram canvas and the schema
  grid, sharing one rasterization pipeline (`exportImage.ts`) so both panes export the same
  way instead of each growing its own export code.
- **Bring-your-own-key Gemini integration.** A settings panel where a user pastes their own
  Gemini API key, stored in `localStorage`, with the composition root swapping in a live
  `GeminiReasoningEngine` in place of the mock the moment a key is present. Left blank by
  default. This is discussed at length in
  [Privacy and Security](./Privacy-and-Security.md), because "who holds the API key and
  where does it go" is exactly the kind of decision that deserves to be written down rather
  than left implicit in the code.

The schema pane's first version rendered tables as a vertically scrolling list of cards.
That was later replaced with an ER-diagram-style canvas, colored table boxes connected by
relationship lines, laid out with the same `elkjs` approach as the architecture diagram and
scaled to fit the pane without vertical scrolling, while staying built entirely out of real
`<input>`, `<select>`, and `<button>` elements in native tab order. Nothing in the schema
pane is a picture of a diagram that a screen reader has to describe after the fact, it is
the diagram.

## Week 2, continued: pane-zoom navigation and a permanent smoke-test pipeline

Once there were three panes on screen at once (schema, canvas, chat), two problems showed
up that had not existed with a single pane: a small pane is hard to work in for anyone, not
just a screen reader user, and manual testing was starting to miss things. Both were
addressed together.

Pane-zoom navigation (`ExpandablePane.tsx`) lets a user tab to any of the three panes and
press Enter to expand it to fill the viewport, then Escape to collapse back, from any depth
of focus inside that pane. Two real bugs were caught while building this, not by the type
checker or the build, but by actually testing the feature in a browser:

1. A "hidden" pane was still visibly rendering underneath the expanded one, because the
   pane wrapper classes set `display: flex` unconditionally, and that rule had higher CSS
   specificity than the browser's own `[hidden] { display: none }` rule. Fixed with an
   explicit `!important` override, ordered ahead of the per-pane display rules.
2. Loading the default schema and then clicking "Add table" produced a React
   "duplicate key" warning on `col_002`. The root cause was three independent
   module-level id counters (`application/ids.ts`, a local one inside the Mermaid ER
   parser, and another inside the schema-to-graph converter) that could all legitimately
   mint the same bare, un-namespaced id. Fixed by moving id generation into one shared
   `domain/idGenerator.ts` that the whole app now calls, which also corrected a
   pre-existing layering violation where infrastructure code was importing from the
   application layer, backwards from the documented dependency direction.

Neither bug would have been caught by `tsc` or a production build. That is exactly why
`app/scripts/smoke-test.mjs` exists: a permanent, repeatable Playwright pipeline that drives
the real running app in a real headless browser, covering the decision-confirmation loop,
the spatial-stability guarantee, PNG export, the schema pane's fit-to-viewport behavior, the
foreign-key Enter-to-cycle interaction, the duplicate-id regression specifically, the
schema-to-diagram conversion, and pane-zoom keyboard navigation end to end. It fails loudly
on any assertion failure and, independently of any explicit assertion, on any browser
console error at all during any scenario. See
[`docs/smoke-testing.md`](../docs/smoke-testing.md) for the full scenario list.

## Week 3: wiring a real reasoning model

The final phase connected the schema pane and diagram pane to a live model, Gemini, behind
the bring-your-own-key setting added in week two. `geminiClient.ts` is deliberately the only
file in the codebase that knows Gemini's REST request and response shape, one `fetch` call
against the `generateContent` endpoint asking for JSON output, with no SDK dependency.
`GeminiReasoningEngine` and `GeminiSchemaReasoningEngine` implement the same
`IReasoningEngine` / `ISchemaReasoningEngine` ports the mock engines implement, and
defensively coerce whatever comes back, unknown node types, missing fields, dangling ids are
all normalized rather than trusted, because an LLM's output is never guaranteed to match
even a very explicit instruction on every call.

This integration is honestly flagged in `docs/architecture.md` as reviewed but not yet
exercised against a real key in this environment, correctness rests on matching the
documented Gemini contract and the app's own domain shapes, not on a live end-to-end run.
That distinction, reviewed versus verified, matters enough that we keep it explicit rather
than letting "we wired it up" imply "we watched it work."

## What this ordering bought us

Building the two research mechanisms first, against a mock engine, meant the hardest and
most novel part of the project (confirm-before-render, dependency-aware collateral-free
editing) got validated before any time went into a second pane, file upload, export, or a
live model call. Every later phase added a new capability without needing to touch the
domain layer's core shapes, which is the direct payoff of having drawn the Clean
Architecture boundaries in `docs/architecture.md` on day one rather than after a rewrite.
