# Feature Decisions

Every feature in FlowViz exists because it tests one of the two research mechanisms from
the write-up, the decision-confirmation loop or the dependency-aware edit loop, or because
it removes a barrier that would otherwise keep a BLV user from reaching those mechanisms in
the first place. Anything that didn't clearly do one of those two things was either cut or
pushed to future work. This page lays out both lists, and the reasoning behind each entry,
so the "why" isn't only recoverable by reading commit history.

## Included, and why

**Decision-confirmation dialogue, one decision at a time.** The core claim of the write-up
is that a model's latent interpretive decisions, what type a node is, which way an edge
points, what protocol a label implies, should never reach a rendered diagram without being
either confirmed or corrected first. This had to be the very first thing built, before any
UI polish, because it's the actual thesis being tested. It's presented one decision at a
time rather than as a batch, because a screen reader user working through a list of
unrelated decisions strung together in one block loses track of which option belongs to
which decision. One at a time keeps each confirmation a single, unambiguous unit of work.

**Dependency-aware editing with spatial stability.** Deleting a node should not silently
rearrange the rest of the canvas. This is tested directly by the smoke suite, not just
asserted, editing one element and checking that every unrelated node keeps its exact
coordinates afterward. A sighted user glancing at a diagram can tolerate everything shifting
around after a small edit. A BLV user who has built a mental map of the diagram through
sequential exploration cannot, that map becomes wrong the moment anything moves that they
weren't told about.

**Nodes, edges, and labels as three independently toggleable layers.** Splitting geometry
(nodes), topology (edges), and text (labels) into three separate SVG groups, each with its
own `aria-label` and its own visibility toggle, means a screen reader user can silence the
noise and focus on one kind of information at a time, for example listening to just the
labels to get every component's name in sequence, without wading through geometry
announcements for every node in between. This layering is enforced in the domain entities
themselves (`NodeEntity` and `EdgeEntity` carry no text field at all), not just at render
time, specifically so a future contributor can't accidentally reintroduce text into the
wrong layer without the type system objecting.

**The schema pane and ER-to-architecture conversion.** Database schema design is one of the
most common places system architecture actually starts, and entity-relationship modeling
has its own, mostly unsolved accessibility literature (see
[Accessibility and Novelty](./Accessibility-and-Novelty.md)). Letting a user build or paste
a schema and convert it into an architecture diagram through the same confirmation loop
tests the mechanism against a second, structurally different kind of diagram, not just the
one domain the write-up's month-one vocabulary targeted.

**Document upload for prompt context.** Architecture and schema decisions rarely start from
a blank page, they usually start from an existing design doc. Attaching a document's text to
a generation request removes a real barrier (retyping or describing a document's contents by
hand) without adding any new interpretive decisions the confirmation loop doesn't already
cover, the uploaded text is just more prompt context, so it didn't need a new mechanism.

**Pane-zoom keyboard navigation.** Three panes on one screen is a lot of surface area to
navigate by Tab alone. Letting any pane expand to fill the viewport and collapse back, fully
keyboard-driven, addresses a barrier that exists for any keyboard user, not only BLV users,
which is exactly the kind of feature that earns its place: it removes friction on the way to
the actual mechanisms rather than being decoration.

**PNG/JPEG/SVG export.** Not every consumer of a finished diagram is BLV. A diagram built
non-visually still frequently needs to be dropped into a slide deck or a design doc for a
sighted collaborator, so export was treated as a requirement, not an afterthought, once the
core loops worked.

**Bring-your-own-key model integration, left blank by default.** Once the two mechanisms
were validated against a mock engine, connecting a real model was necessary to claim the
system actually works end to end rather than only in a scripted demo. Bring-your-own-key,
rather than a shared or bundled key, was the deliberate choice here, see
[Privacy and Security](./Privacy-and-Security.md) for the full reasoning.

## Deliberately left out, and why

**Fine-tuning a custom model.** The write-up's own scope statement says this directly: the
contribution being tested is an interaction and representation design, not a new model.
Fine-tuning would have burned a disproportionate share of a four-week, two-person budget on
infrastructure instead of on the two mechanisms that actually needed validating. Any
capable off-the-shelf model with structured JSON output and function calling was always
going to be sufficient, so building one from scratch was never on the table.

**A stylization or icon-skinning pass (Nano Banana Pro / Gemini image generation).** This
was considered and explicitly scoped out of the core build. The write-up cites Google's own
model documentation for Gemini's image model, which cautions that when "generating
infographics, annotating diagrams, or representing complex data, it may misinterpret
information or produce factually incorrect results." A model with that documented weakness
must never be allowed to touch topology or layout, only surface style, applied after the
structural graph and layout are already locked. Since the structural pipeline is the actual
contribution and a stylization pass is purely cosmetic, it was flagged as future work rather
than pulled into scope this build had to defend.

**A shared or team-funded API key.** Considered and rejected in favor of bring-your-own-key.
A shared key on a client-side, statically hosted app has no way to stay secret, anyone
could extract it from the deployed bundle and use it without limit, so the only honest
options were "no live model by default" (what shipped) or "a backend that proxies requests
and holds the key server-side" (a real backend, with its own hosting, logging, and privacy
surface to build and document). For a research prototype whose actual contribution is the
interaction design, adding a backend to protect a shared key was scope the project didn't
need.

**Absolute-position tiles or a free-form drawing canvas.** AltCanvas, the closest prior
work on constructive BLV authoring (see [Accessibility and Novelty](./Accessibility-and-Novelty.md)),
tried an absolute-grid design early on and abandoned it as too inconsistent for non-visual
placement, settling on relative positioning instead. FlowViz doesn't expose manual
positioning to the user at all, layout is always computed by `elkjs` from the graph
structure, specifically because free-form spatial placement is a sighted-user affordance
that doesn't translate to a non-visual workflow, and reproducing AltCanvas's own
abandoned approach would have been a known dead end.

**Real-time multi-user collaboration.** No shared session state, no live cursors, no
concurrent editing. Nothing about the write-up's two mechanisms requires more than one user
per session, and multi-user editing raises its own hard problems, conflict resolution,
presence, permissions, that are unrelated to the accessibility question this project is
actually about. Left out entirely rather than half-built.

**A native mobile app or dedicated screen-reader plugin.** FlowViz targets the browser and
the two screen readers most represented in the BLV creative-tool literature reviewed for
this project, NVDA and VoiceOver, both usable against a standard web page. Building a native
app or an OS-level accessibility plugin would have meant maintaining an entirely separate
platform surface for a one-month, two-person prototype whose job was to test an interaction
model, not to ship a production accessibility tool across every platform at once.

**A fixed or unbounded open vocabulary of diagram component types.** The write-up
deliberately scoped month one to roughly six to eight architecture primitives (client,
server, database, load balancer, cache, queue, API gateway, external service) and about four
edge/protocol types. An open vocabulary would make the decision taxonomy and the dependency
rules combinatorially harder to reason about and confirm correctly within a one-month build,
generalizing the vocabulary is explicitly future work, not a month-one requirement.
