# Privacy and Security

FlowViz is a static, client-side application. There is no FlowViz backend, no FlowViz
account, and no FlowViz-operated server that ever sees anything you type into it. This page
explains exactly where your data goes, what's stored and where, and the reasoning behind
each of those choices, so nobody has to take that claim on faith or go read the source to
verify it.

## Where the app runs and what that means

FlowViz builds to a static site (Vite's production build) and deploys via GitHub Actions
straight to GitHub Pages, see `.github/workflows/deploy.yml`. A static site has no server
process of its own that requests pass through, there is nothing running that could log a
prompt, retain a diagram, or store an API key server-side, because there is no server. Every
computation, parsing a prompt with the mock engine, laying out the graph, rendering the SVG,
exporting a PNG, happens in your own browser tab.

This is also a real limitation worth being upfront about: a static, client-side app has no
way to add its own authentication, rate limiting, or audit logging later without introducing
a backend. That tradeoff was made deliberately, see the "no shared API key" reasoning below,
but it means FlowViz today is a research prototype, not a hardened production product, and
should be treated that way.

## What's stored, and where

**Diagram and schema data.** Lives only in the browser tab's memory (React/JavaScript state)
for the duration of the session. Closing the tab or reloading the page discards it, unless
you've exported it. Nothing is written to disk or sent anywhere unless you explicitly click
an export button.

**The Gemini API key.** If you choose to use live AI generation instead of the offline mock
engine, you paste your own Gemini API key into the Settings panel. It's stored in your
browser's `localStorage` under the key `flowviz.geminiApiKey` (see
`infrastructure/config/settingsStore.ts`) and nowhere else. It is never transmitted to
anything FlowViz controls, requests go directly from your browser to Google's
`generativelanguage.googleapis.com` endpoint (see `infrastructure/reasoning/geminiClient.ts`).
Leaving the field blank means the app runs entirely offline against the mock reasoning
engine and no key ever exists anywhere.

`localStorage` is not a secure secret store; anything with script execution in that browser
tab, a malicious browser extension, for instance, could in principle read it. This is a
known and accepted limitation of the bring-your-own-key, client-side pattern, not an
oversight, see the reasoning below for why the alternative (a backend holding a shared key)
was rejected instead.

**Uploaded documents.** Read entirely client-side through the browser's `FileReader` API
(see `presentation/components/DocumentUpload.tsx`). A file you attach never leaves your
machine except as text folded into a prompt you then choose to send to Gemini, if and only
if you've configured a key. There is no file upload endpoint anywhere in this project.

**Everything else.** No analytics, no telemetry, no error-reporting service, no cookies
beyond what GitHub Pages itself may set for its own hosting purposes. `package.json` has
exactly two runtime dependencies beyond React itself, `elkjs` for layout and `zustand`
(unused directly by the current build's session services, which use a hand-rolled observable
pattern instead), neither of which does any networking.

## Why bring-your-own-key instead of a shared key

This was an explicit decision, not a default. A shared or team-funded API key baked into a
statically hosted, client-side app has no way to stay secret, the bundle ships to every
visitor's browser, and anyone can extract a key from it and use it without limit. There were
really only two honest ways to offer live AI generation from a static site: bring-your-own-
key, what shipped, or standing up a backend that holds the key server-side and proxies
requests. The second option is not just "add a server," it's also now responsible for its
own authentication, rate limiting, logging policy, and its own privacy story about what it
retains from each request. For a research prototype whose actual contribution is the
interaction design (the two loops described in
[Accessibility and Novelty](./Accessibility-and-Novelty.md)), adding and then having to
secure a backend just to protect a shared credential was scope the project didn't need, and
every hour spent on it would have been an hour not spent validating the two mechanisms that
are the point of the build. Bring-your-own-key keeps the trust boundary exactly where a user
already expects it: you and Google, with FlowViz never in the middle.

## Why the reasoning engine is swappable at all

The Dependency Inversion boundary described in
[`docs/architecture.md`](../docs/architecture.md), `IReasoningEngine` as a port, concrete
engines behind it, is itself a privacy-relevant decision, not just a clean-architecture
nicety. It means nothing in `application/` or `presentation/` is written against Gemini
specifically, or against any particular vendor's data-handling terms. Swapping in a
different provider, or a locally-run model with no network calls at all, is a matter of
implementing one interface and changing one line in `App.tsx`. A user or contributor who
doesn't want their prompts leaving their machine at all could implement `IReasoningEngine`
against a local model and never touch a cloud API, without changing anything else in the
codebase.

## Threat model, stated plainly

FlowViz is built to protect against the failure modes that actually matter for its intended
use, an individual user drafting diagrams, not against an adversarial multi-tenant
environment:

- **Data exfiltration by FlowViz itself:** not possible in the current build, there is
  nothing to exfiltrate to, no backend exists.
- **A malicious FlowViz deployment:** since the source is public and the build is
  reproducible from it via the same GitHub Actions workflow that deploys the real site,
  anyone can audit exactly what code the hosted app runs, or build and self-host it, rather
  than trusting the hosted instance blindly.
- **Your API key leaking via `localStorage` to other code running in the same browser tab:**
  a real, accepted risk of the bring-your-own-key pattern, mitigated by keeping the key
  strictly optional and off by default, not by any additional encryption, since encrypting a
  key that JavaScript in the same origin can always decrypt again provides no real
  protection against that specific threat.
- **A malicious or compromised uploaded document:** treated as inert text. It's read as a
  string and folded into a prompt, never executed, evaluated, or rendered as HTML/SVG
  markup anywhere in the pipeline.
- **Injection through diagram content into the rendered SVG:** diagram text (labels) is
  rendered through React's normal JSX text interpolation, not `dangerouslySetInnerHTML` or
  any raw-markup insertion path, so a node named `<script>` or similar renders as literal
  text, not executable markup.

If you find a gap in any of this, or a place where the code doesn't actually match what this
page claims, please open an issue, this page is meant to be a checkable description of the
system's actual behavior, not a policy document that exists independently of the code.
