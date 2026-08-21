# FlowViz — Competition Submission

## Basic info

**Project Title:** FlowViz

**Team Name:**
FlowViz

**Student Name(s):**
Sanchita S. Kamath, Azucena Ventimilla

**Institution(s):**
University of Illinois Urbana-Champaign
Macalester College

**City and State:**
Champaign, Illinois
St Paul,Minnesota

**Mentor(s):**
Ricky Fok

**Mentor email address(es):**
rfok@hacker.fund

**Primary contact email:**
ssk11@illinois.ed

---

## Project Overview

**What problem does your project address?**

System architecture diagrams and entity-relationship (database schema) diagrams are almost entirely visual — boxes and lines connected by relationships. Screen readers routinely skip them or announce nothing more useful than "image." A blind or low-vision (BLV) person can be a working software engineer or database designer and still have no practical way to draft one of these diagrams themselves — only to have an existing one described to them after a sighted colleague already made it. Two lines of research back this up directly: a 2024 study benchmarking seven text-to-image models against 2,240 generated images concluded none were ready for unsupervised use, and separate work has shown the same class of models silently encodes decisions a user never asked for and has no way to catch. FlowViz asks: if a sighted researcher can't yet trust an AI model's unsupervised output, what does a BLV user — who can't glance at the result to catch an error — actually need underneath it?

**Who is your project designed to help?**

People with visual disabilities specifically — blind and low-vision (BLV) users, particularly those working as (or training to become) software engineers or database designers, who need to author system-architecture and entity-relationship diagrams themselves, not just have existing ones read aloud to them.

**What does your project do?**

FlowViz lets you describe a system out loud or in text ("a web app with a cache in front of the database"), or build/paste a database schema, and it builds a diagram from that — but it never silently guesses. Every interpretive decision it makes (what type a component is, which way a connection points, what a relationship means) is stated in plain language and confirmed or corrected before anything is drawn. Diagrams are represented as three separate, independently readable layers — shapes, connections, and text — so a screen reader user can listen to just one kind of information at a time instead of everything at once. Editing one part of a diagram (like deleting a component) never silently moves or breaks something unrelated — every downstream effect is shown and confirmed first. A chat panel drives both the diagram and the schema editor, walks you through follow-up questions after generation, and supports natural-language edits on either side; edit one and the other stays in sync automatically. Every pane is fully keyboard-operable (including zooming any pane to fill the screen and back), supports spoken output and voice input, and can export to PNG/JPEG/SVG.

**Why is this project important?**

As far as the project's literature review could establish, no existing academic or commercial system — including the closest prior work on accessible AI-generated imagery (GenAssist), constructive BLV-authored canvases (AltCanvas), and every ER/UML diagram accessibility tool found (TeDUB, UML4ALL, AWMo, sonification-based approaches) — combines all of: an AI system that explicitly states its own interpretive decisions, a confirm-or-correct step before anything renders, a dependency-aware structure so edits can't have silent collateral effects, and BLV users as the actual target population, for node-edge or entity-relationship diagrams specifically. Existing ER/UML accessibility work makes an already-designed diagram perceivable (through sonification, tactile output, or specialized notations); FlowViz targets the authoring step itself.

**Anything to add to your current project if given more time?**

The most important gap: this build has not yet been tested with actual blind or low-vision users, or with assistive technology beyond the team's own manual keyboard testing and an automated Playwright test suite (NVDA/VoiceOver have not been run against it). That would be the first priority with more time. After that: a broader diagram-component vocabulary (the current build deliberately scopes to ~6–8 architecture primitives and ~4 connection types for a one-month prototype), and validating the live Gemini-backed reasoning engines end-to-end against a real API key (they're implemented and reviewed but not yet exercised live in this environment).

**Project Category:**
Assistive technology
\*(secondary fits: Artificial intelligence or machine learning; Accessibility testing tool)

---

## Design and Technical Details

### Technical details — languages, tools, platforms, main technical features, hardest part, testing/debugging:\*\*

Built with TypeScript and React 19 on Vite, deployed as a static site to GitHub Pages via GitHub Actions. Diagram layout is computed by `elkjs`; spoken output and voice input use the browser's native Web Speech API; an optional live reasoning engine calls Google's Gemini API directly from the browser using a user-supplied API key (no backend, no shared key — see below). The codebase follows a strict Clean/Hexagonal Architecture: a pure `domain/` layer (no framework, no I/O) defines what a diagram and a schema _are_; an `application/` layer implements the actual mechanisms (the decision-confirmation loop, the dependency-aware edit loop, and a `SyncCoordinator` that keeps a diagram and the schema it was generated from in sync) against interfaces only; concrete `infrastructure/` adapters (an offline rule-based engine and a live Gemini-backed engine, interchangeable by swapping one line at the composition root) implement those interfaces; a `presentation/` React layer renders state and calls service methods, with zero business logic of its own.

The most challenging technical part was the bidirectional schema↔diagram sync: a relational schema (tables/columns/foreign keys) and an architecture diagram (nodes/edges/labels) are genuinely different data models, so an edit made in one — including a structural edit an AI model invents on its own, like "split this customer table into VIP and non-VIP" — has to be re-interpreted into an equivalent change in the other model via a maintained node-to-table correspondence map and a second reasoning-engine call, without looping edits back and forth or losing the "collateral-free" editing guarantee the rest of the app relies on. A close second: getting the interpretive-decision confirmation flow to actually be a single, unambiguous action — an earlier version's "confirm" button silently ignored whichever option a user had selected, and the first fix for that introduced a worse bug (a browser radio input doesn't fire a change event when you click one that's already selected by default), which was only caught because an automated end-to-end test — not the type checker, not a production build — started failing.

Testing/debugging: a permanent Playwright-driven end-to-end smoke-test suite drives the real running app in a real headless browser (not unit tests against internals) and fails on any assertion failure or any browser console error during any scenario. This caught several real bugs that `tsc`/`vite build` never would have: a hidden pane still visibly rendering underneath an expanded one (a CSS specificity conflict with the browser's own `[hidden]` rule), two independent id-generation counters minting the same id for unrelated schema columns, and the
decision-confirmation stall described above.

### Accessibility design:

- **Keyboard navigation:** every control is a real, native `<input>`/`<select>`/`<button>` — nothing is a styled `<div>` standing in for a form control. Tab order is native DOM order throughout, including the schema-editing grid. Any of the three panes can be expanded to fill the whole screen with Tab + Enter and collapsed back with Escape from any depth of focus inside it.
- **Screen reader support:** the diagram is built from three separate, semantically labeled SVG groups (shapes, connections, text) each independently toggleable, so a screen reader user can silence everything but, say, the text layer and hear just the component names in sequence. Decision-confirmation dialogues and the chat log use ARIA live regions so updates are announced as they happen.
- **Plain language / reduced cognitive load:** interpretive decisions are surfaced one at a time, not as a batch, and phrased conversationally ("Did I get that right? Pick one to confirm it," "(my guess)") rather than as a technical form. Confirming a decision is a single action — select the option you want and it's applied immediately.
- **Text-to-speech / speech-to-text:** decision descriptions, propagated-edit summaries, and post-generation descriptions are read aloud via the Web Speech API (with a mute toggle in Settings); prompts can be spoken instead of typed via the browser's speech recognition.
- **No silent visual-only signal:** relationship lines in the schema view are marked `aria-hidden` because everything they show is already stated in accessible text elsewhere — they're decorative, not a second source of truth a screen-reader user would miss.

Guideline/framework used: the decision-confirmation loop is explicitly grounded in
Human-Centered Explainable AI (Ehsan & Riedl, 2020), which frames explainability as a two-way, contestable process tailored to the person asking rather than a one-shot summary.

### Accessibility testing with people with disabilities / feedback incorporated:

None yet. Testing so far has been an automated Playwright end-to-end suite plus the team's own manual keyboard-only testing; a pass with NVDA/VoiceOver and with actual BLV users has not happened yet and is the top item under "if given more time" above.

### Technical challenges overcome:

- Translating edits between two structurally different domain models (relational schema vs. architecture graph) for live bidirectional sync, including edits an AI model invents on its own (e.g. splitting one entity into two).
- A browser radio-input quirk that silently stalled the decision-confirmation loop (clicking an already-selected option doesn't fire a change event), caught by an automated test rather than manual testing.
- A CSS specificity bug where a "hidden" pane kept rendering underneath an expanded one.
- Two independent, un-namespaced id-generation counters producing duplicate ids for unrelated schema columns.
- Defensively coercing live LLM JSON output (unknown types, missing fields, dangling ids) since a model's output is never guaranteed to match even a very explicit contract on every call.

---

## Demo and Presentation

### Project Deliverable (video demo / slides link):

https://youtu.be/W8HPosc2n0U

### Project GitHub URL:

https://github.com/SK-143381/flowviz

### Short project summary for judges:

FlowViz is a browser-based tool that lets blind and low-vision users author system architecture diagrams and database schemas themselves — not just have existing ones described to them. Every interpretive decision an AI model makes is stated in plain language and confirmed before it's drawn, edits never have silent collateral effects, and the diagram is built from independently readable layers instead of one flat image, closing a gap that (per our literature review) no existing accessible-diagramming or accessible-image-generation system currently addresses for this domain.

### Anything else you'd like the judges to know?

The app runs entirely client-side (no FlowViz backend, no account, nothing FlowViz-operated ever sees what you type) and works fully offline against a built-in rule-based engine with no API key required; connecting a live Gemini model is optional and bring-your-own-key. Live demo: https://sanchitakamath.com/flowviz/

### Attend Inclusive Coding Festival (Oct 10, UC Irvine)?

Maybe

---

## Permission and Agreements

### Use of AI tools disclosure:

We used AI tools for coding help; see `NOTICE.md` for the specific disclosed commit and files.

### Media Permission:

Yes
