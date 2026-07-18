# Smoke testing FlowViz

`app/scripts/smoke-test.mjs` is a permanent, repeatable end-to-end pipeline that drives the
real running app in a real (headless) browser and fails loudly if anything is actually
broken. It replaced a series of ad-hoc, hand-written, throwaway Playwright scripts used
during development — this is the same idea, kept around and organized instead of deleted
after each use.

## Why this exists

Type-checking and a production build prove the code compiles; they don't prove the decision-
confirmation loop actually confirms, that deleting a node actually leaves its neighbors in
place, or that the ER-diagram-style schema pane actually fits on screen. Several real bugs in
this project were only caught this way — not by `tsc`, not by `vite build` — including:

- surviving nodes drifting after an edit before the dependency engine's `affectedNodeIds`
  logic was fixed;
- a hidden pane's Toolbar visibly leaking through because `[hidden]` was losing a CSS
  specificity fight to a component's own `display: flex` rule;
- two independent module-level id counters producing the same string id (`col_002`) for two
  unrelated schema columns, which `scenarioNoDuplicateIdRegression` now guards against
  permanently.

None of those are the kind of thing a type system catches. This pipeline exists so they don't
have to be re-caught by hand every time.

## Running it

```bash
cd app
npm run smoke              # headless, exits non-zero on any failure
npm run smoke -- --headed  # watch it run in a real browser window, for debugging
npm run smoke -- --keep-server  # leave the dev server up afterward
```

No manual setup required beyond `npm install` (which pulls in `playwright` as a
devDependency) and, once per machine, `npx playwright install chromium` if the browser
binary isn't already cached locally. The script starts its **own** Vite dev server on a
fixed, isolated port (`4310`) so it never collides with a dev server you might already have
running on the default port, and shuts that server down when it finishes (unless you pass
`--keep-server`).

## What it actually checks

Every scenario runs against the live app — clicking real buttons, typing into real inputs,
reading real rendered DOM — never against internals directly. Every scenario also
automatically fails if the browser logs *any* console error or uncaught exception during it,
even if every explicit assertion passes; a clean console is a blanket assertion that applies
to all of them for free (see `scenario()`'s wrapper in the script).

| Scenario | What it proves |
|---|---|
| generates and confirms a diagram from a prompt | The decision-confirmation loop (write-up mechanism 1) runs end to end: prompt → decisions → confirm-all → rendered nodes/edges. |
| dependency-aware edit preserves unrelated node positions | The dependency-aware edit loop (mechanism 2): deleting a node removes exactly it, and every surviving node keeps its exact `(x, y)` — the "spatial stability" claim, checked as a hard assertion, not eyeballed from a screenshot. |
| export menu triggers a real PNG download | The SVG export pipeline produces an actual browser download event with the expected filename, not just code that type-checks. |
| default schema loads and fits the viewport without vertical scroll | The ER-diagram-style schema canvas's `useFitScale` mechanism actually keeps `scrollHeight <= clientHeight` — the literal "shouldn't have to scroll to see it" requirement. |
| foreign-key cell cycles on Enter, tab order stays inside the grid | The "tab through cells, Enter to cycle a relation" interaction actually changes the cell's displayed reference. |
| adding a table after loading the default schema has no id collisions | Regression test for the `col_002`/`col_002` duplicate-key bug — guards `domain/idGenerator.ts` staying the single shared id source. |
| schema converts into an architecture diagram via the HCXAI loop | `schemaModelToDraftGraph` + `DiagramSessionService.generateFromSchema` produce a real, confirmable, renderable diagram from the schema pane's own data. |
| Tab + Enter zooms into a pane, Escape returns from deep focus | The pane-zoom feature (`ExpandablePane.tsx`): reachable by keyboard, actually hides the other panes (not just marks them `hidden` while a CSS rule silently keeps them visible — this is exactly the class of bug that slipped through once already), and Escape from a deeply-focused child still collapses it. |
| Settings panel opens with the Gemini API key field | The bring-your-own-key entry point is present and reachable. |

## Adding a new scenario

1. Write an `async function scenarioYourThing(page) { ... }` using `assert(condition, message)`
   for explicit checks. Call `page = await freshPage(page.context().browser())` first if the
   scenario needs a clean app state (empty graph, empty schema) rather than continuing from
   whatever the previous scenario left behind — scenarios that don't call this deliberately
   chain off the prior scenario's state (e.g. the schema scenarios build on each other to
   avoid re-loading the default schema five times).
2. Register it in `main()` with `await scenario('a human-readable name', scenarioYourThing);`
   under whichever section heading fits, or a new one.
3. That's it — no test-runner config, no separate assertion library. `assert()` throws,
   `scenario()` catches, records, and prints; the run's exit code reflects the aggregate.

## Known limitations

- Scenarios run **sequentially against one shared browser** (new pages via `freshPage()`
  where needed) rather than in parallel — intentional, since several scenarios deliberately
  depend on state left by the one before them (documented per-scenario above). This keeps
  the pipeline simple at the cost of total runtime; fine for a suite this size.
- This is a smoke pipeline, not a full test suite: it proves the golden paths and the
  specific regressions listed above work, not exhaustive coverage of every edit verb, every
  Mermaid DSL edge case, or accessibility beyond keyboard traversal (no NVDA/VoiceOver
  automation — see `app/README.md`'s "known simplifications" for what still needs a manual
  screen-reader pass).
- The Gemini-backed reasoning engines are not exercised here (no API key in CI); only the
  offline mock engines are covered.
