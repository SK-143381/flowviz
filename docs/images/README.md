# Screenshots

This folder is where `npm run screenshots` (see `app/scripts/capture-screenshots.mjs`) writes
the PNGs the main README embeds:

- `01-overview.png`: the three-pane layout on load (schema, canvas, chat).
- `02-decision-confirmation.png`: the HCXAI confirm/contest dialogue mid-generation.
- `03-architecture-diagram.png`: a confirmed diagram rendered through the layered SVG.
- `04-schema-er-view.png`: the ER-style schema canvas with the default 8-table schema.
- `05-export-menu.png`: the PNG/JPEG/SVG export controls.
- `06-expanded-pane.png`: a pane zoomed to fill the viewport via keyboard.

Run it locally once Node and the Playwright browser are installed:

```bash
cd app
npm install
npx playwright install chromium
npm run screenshots
```

The images aren't committed as placeholders because a blank or stock image would misrepresent
the app; the README links assume this folder is populated by that script before publishing.
An animated walkthrough (GIF) isn't produced by this script, since this environment doesn't have
ffmpeg or ImageMagick available to stitch frames. If you want one, the simplest path is a
screen recording of the smoke-test suite running with `npm run smoke:headed`, converted with
any GIF tool (`ffmpeg -i recording.mov -vf "fps=12,scale=1000:-1" walkthrough.gif` works well),
saved here as `07-walkthrough.gif`.
