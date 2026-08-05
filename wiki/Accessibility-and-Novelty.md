# Accessibility and Novelty

This page explains why FlowViz exists in the first place, and where it actually sits
relative to prior work. The full literature review that motivated the project is preserved
verbatim in [`docs/write-up.md`](../docs/write-up.md); this page summarizes that review for
a general reader and adds a second, more focused pass specifically on entity-relationship
(ER) diagram accessibility, since FlowViz's schema pane targets that domain directly and it
turned out to have its own, separate body of prior work worth checking against.

## The problem, briefly

Diagrams that connect labeled shapes with lines, system architecture diagrams, flowcharts,
UML diagrams, entity-relationship diagrams, are everywhere in software work and almost
entirely visual. Screen readers routinely skip them or announce nothing more useful than
"image." A blind or low-vision (BLV) person can be a working software engineer or database
designer and still have no practical way to draft one of these diagrams themselves, only to
have an existing one described to them after a sighted colleague made it.

Two separate lines of evidence in the literature back this up directly. Anschütz, Sylaj, and
Groh (TSAR 2024) benchmarked seven text-to-image models against 2,240 generated images and a
user study with the target accessibility group, and concluded that none of the models tested
were ready for larger-scale use without human supervision. Bianchi, Kalluri, Durmus, and
colleagues (FaccT 2023) showed separately that the same class of models silently encodes
demographic and content decisions a user never asked for and, critically, cannot see to catch
after the fact. Put together: if a sighted researcher cannot yet trust an AI model's
unsupervised output, a BLV user, who cannot glance at the result to catch an error, needs
something more reliable underneath, not just a nicer voice reading the same unreliable
output back to them. That is the starting premise FlowViz's decision-confirmation loop is
built to answer.

## What FlowViz actually does differently

Two mechanisms, tested together:

1. **Decision-confirmation loop.** Before any interpretive choice, what type a component is,
   which way an edge points, what a label implies, is committed to the rendered diagram, the
   system states it in plain language and the user confirms or corrects it. This is grounded
   in Human-Centered Explainable AI (Ehsan and Riedl, 2020), which frames explainability as a
   two-way, contestable, sociotechnical process tailored to the person asking, not a one-shot
   summary of what a model did.
2. **Dependency-aware layers.** Nodes, edges, and labels are represented and rendered as
   three separate, addressable layers with explicit dependency links between them (an edge
   cannot outlive the node it connects to; a label cannot outlive its element). Editing one
   part of the diagram only ever touches what's actually downstream of that edit, checked
   directly by the smoke suite as a spatial-stability guarantee, not eyeballed from a
   screenshot.

## Closest prior work, and how it differs

**GenAssist** (Huh, Peng, and Pavel, UIST 2023, Best Paper) makes AI-generated images
describable to BLV users by having GPT-4 and BLIP-2 answer structured questions about
candidate images and present the answers in a screen-reader-navigable comparison table. It
is thorough and well evaluated, but it operates entirely after generation: it tells a user
what a model already produced, with no mechanism to confirm an interpretive decision before
it's rendered, and no layer or dependency model at all, the underlying image stays a flat
raster it never decomposes.

**AltCanvas** (Lee, Kohga, Landau, O'Modhrain, and Subramonyam, ASSETS 2024) is the closest
work on constructive, BLV-authored generation, a tile-per-object canvas where blind creators
place independent illustration objects at relative positions using speech and sonification.
Its tiles are genuinely independent, though, moving or deleting one never affects another,
because there's no dependency model connecting them at all. It also explicitly targets scene
illustration (a dog, a ball, a park), not node-edge diagrams, where the actual structure that
needs preserving is relationships between elements, not just the elements themselves.

**The DeepMind proactive T2I agent** (Hahn et al., ICML 2025) is the nearest match on
mechanism one, it asks clarifying questions and represents intent as an editable "belief
graph." But it targets sighted general users with no accessibility framing at all, is
holistic with no layer concept, and its editable-graph interface is explicitly described by
its own authors as a simple, hypothetical research prototype rather than an evaluated
accessible interface.

No system found in this review combines a model that explicitly enumerates and confirms its
own interpretive decisions through an accessible dialogue, a dependency-aware layer
representation with confirmable, collateral-free propagation, BLV users as the actual target
population, and node-edge diagrams as the domain. That four-way combination is what this
project tests. The full annotated bibliography, twenty-three papers across six themes, is in
[`docs/write-up.md`](../docs/write-up.md).

## A closer look: entity-relationship diagram accessibility specifically

FlowViz's schema pane converts a relational schema into an architecture diagram through the
same confirmation loop, which means the schema pane is really an ER diagram authoring tool
wearing a database-design skin. That's a narrower, older research niche than general
system-architecture diagrams, so it's worth checking separately.

The existing work here is almost entirely about **making an already-designed diagram
perceivable**, not about generating or authoring one:

- **TeDUB** (King and Blenkhorn, 2004, "Presenting UML Software Engineering Diagrams to
  Blind People") was an early, fully automated attempt at making UML diagrams accessible to
  blind software engineers without requiring a sighted person to pre-prepare the diagram.
  By most later accounts the project did not gain traction and has not been maintained.
- **UML4ALL** proposed a syntax specifically designed around the sequential way screen
  reader users work through content, rather than the two-dimensional way a sighted person
  scans a diagram. It was evaluated with both sighted and visually impaired participants and
  found usable by both, but it is a notation for reading and hand-authoring diagrams
  textually, not a system that proposes a diagram from a description and asks the user to
  confirm what it inferred.
- **AWMo (Accessible Web Modeling Tool)** gives blind users access to UML class diagrams
  through a specialized textual language, again a textual-access layer over diagrams a user
  writes by hand in that language, not an AI-generative authoring loop.
- A 2024 ACM paper, "A Method for Presenting UML Class Diagrams with Audio for Blind and
  Visually Impaired Students," uses sonification, distinct tones and audio cues, to convey
  relationships between classes. This is squarely a consumption/description technique: it
  makes an existing diagram's relationships audible, it doesn't help a blind user build a
  diagram from a description and correct the tool's assumptions about cardinality or
  direction.
- Bienhaus and Kreutzer (EuroPLoP 2025), "A Pattern Collection for Generating Accessible
  Teaching Materials for Blind and Visually Impaired Students in Computer Science and
  Electrical Engineering," is the most recent and most relevant adjacent work found. It
  proposes reusable design patterns, text-first authoring, accessible diagram generation via
  textual modeling, tactile and haptic rendering workflows, human-in-the-loop generation of
  explanatory descriptions, explicitly including UML diagrams, for instructors preparing
  accessible course material. It is a pedagogical pattern collection for teachers producing
  materials in advance, not an interactive tool putting the generation loop directly in a
  BLV user's own hands with a live confirm-or-correct dialogue.
- **Umwelt** (Pedraza Pineros, Chen, Hajas, and Satyanarayan, CHI 2024) is the closest
  precedent for BLV users authoring their own accessible representations from scratch rather
  than having an existing one converted for them, but it targets statistical charts
  (scatterplots and the like) built from a tabular dataset, not entity-relationship or
  node-edge diagrams, and it has no equivalent of a dependency-aware structural model or an
  interpretive-decision confirmation step, the user directly specifies the visual encoding
  rather than the tool inferring structure and asking for confirmation.

Commercial "AI ER diagram generator" tools (Miro, Cloudairy, and similar products) are worth
naming directly because their own marketing uses the word "accessible," and it means
something different from what this project means by it. Their accessibility claims are
about output conformance, generating a diagram that is screen-reader-parseable or
WCAG-compliant once it exists, not about the authoring process itself being non-visual, and
none of them include an interactive step where the tool explains what it inferred about
cardinality or foreign-key direction and lets a blind user confirm or correct it before the
diagram is finalized.

**Novelty statement.** No academic or commercial work found treats entity-relationship
diagram generation as an interactive, non-visual authoring process where an AI system
proposes a schema-derived diagram, explicitly states the interpretive decisions it made
(component type per table, protocol or relationship type per foreign key), and lets a BLV
user confirm or correct each one before it renders, with edits afterward propagating only
through explicit, confirmable dependency links. Existing ER and UML accessibility work
makes already-designed diagrams perceivable, through sonification, tactile output, or
specialized textual notations. FlowViz's schema pane is, as far as this review could
establish, the first system to bring an HCXAI-style decision-confirmation loop to
entity-relationship diagram generation specifically, rather than to diagram consumption or
to a different diagram type entirely.

## A caveat worth stating plainly

This novelty claim rests on a literature review, not a systematic one conducted with
formal search protocols and multiple independent reviewers, and it reflects what was
findable through web and database search up to this project's build date. It is entirely
possible a closer match exists in a venue or a language this review didn't reach. The
review is written to be checkable: every claim above about a specific paper cites who wrote
it, where it was published, and what it actually does, specifically so a reader can go
verify or challenge any individual comparison rather than take the summary on faith.
