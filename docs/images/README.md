# Screenshots

This folder holds the PNGs the main README embeds, produced by `npm run screenshots` (see
`app/scripts/capture-screenshots.mjs`). The same script also copies every file here into
`app/public/screenshots/`, which is where the in-app About panel
(`app/src/presentation/components/AboutPanel.tsx`) loads them from at runtime, so this folder
and that one should always be regenerated together, never hand-edited independently.

- `01-overview.png`: the three-pane layout on load (schema, canvas, chat).
- `02-decision-confirmation.png`: the HCXAI confirm/contest dialogue mid-generation.
- `03-architecture-diagram.png`: a confirmed diagram rendered through the layered SVG.
- `04-schema-er-view.png`: the ER-style schema canvas with the default 8-table schema.
- `05-export-menu.png`: the diagram fully confirmed with export controls enabled.
- `06-expanded-pane.png`: a pane zoomed to fill the viewport via keyboard.

Regenerate both copies after any UI change that would make these stale:

```bash
cd app
npm install
npx playwright install chromium   # once per machine
npm run screenshots
```

An animated walkthrough (GIF) isn't produced by this script, since this environment doesn't have
ffmpeg or ImageMagick available to stitch frames. If you want one, the simplest path is a
screen recording of the smoke-test suite running with `npm run smoke:headed`, converted with
any GIF tool (`ffmpeg -i recording.mov -vf "fps=12,scale=1000:-1" walkthrough.gif` works well),
saved here as `07-walkthrough.gif`. The About panel's caption for this is written to degrade
gracefully (a text link, not a broken embed) until one exists.
