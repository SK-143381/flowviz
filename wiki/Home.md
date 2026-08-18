# FlowViz Wiki

This wiki is drafted as plain markdown inside the repository, under `wiki/`, rather than
pushed to the GitHub wiki yet. GitHub wikis live in their own separate git repository
(`github.com/SK-143381/flowviz.wiki.git`), so these pages are staged here until we decide
they're worth maintaining in two places at once. If you want them live, clone the wiki repo
and copy these files in, the content and file names are already wiki-shaped (one page per
file, page titles as `#` headings).

## Pages

- [Development Process](./Development-Process.md): how FlowViz actually got built, in
  order, including the two real bugs we hit and fixed.
- [Feature Decisions](./Feature-Decisions.md): what made it in, what didn't, and why, for
  every feature we considered.
- [Accessibility and Novelty](./Accessibility-and-Novelty.md): the academic grounding for
  why this project exists, and a focused look at where entity-relationship diagram
  accessibility research stands and what FlowViz's schema pane adds to it.
- [Privacy and Security](./Privacy-and-Security.md): exactly what data FlowViz touches,
  where it goes, and the deliberate choices behind that.

## Where the rest of the documentation lives

The wiki is for narrative and decision-making context. Technical reference lives in the
main repository so it stays next to the code it describes:

- [`docs/write-up.md`](../docs/write-up.md): the original literature review and project
  plan this build implements.
- [`docs/architecture.md`](../docs/architecture.md): file-by-file reference for
  `app/src`, kept current as the source of truth for how the codebase is laid out.
- [`docs/smoke-testing.md`](../docs/smoke-testing.md): what the Playwright smoke suite
  covers and why it exists.
