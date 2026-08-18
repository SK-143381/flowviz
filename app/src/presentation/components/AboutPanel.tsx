interface Props {
  open: boolean;
  onClose: () => void;
}

const SCREENSHOTS = [
  { file: '01-overview.png', caption: 'The three-pane layout: schema editor, diagram canvas, chat.' },
  { file: '02-decision-confirmation.png', caption: 'The decision-confirmation dialogue, one assumption at a time, before anything renders.' },
  { file: '03-architecture-diagram.png', caption: 'A confirmed diagram, described back in plain language and ready to edit or export.' },
  { file: '04-schema-er-view.png', caption: "The schema pane's ER-diagram-style canvas: real form controls, not a picture." },
  { file: '06-expanded-pane.png', caption: 'Any pane can zoom to fill the viewport with Tab and Enter, and back out with Escape.' },
];

const REPO_URL = 'https://github.com/SK-143381/flowviz';

/**
 * "About" modal: the problem statement and a screenshot walkthrough, surfaced in the app
 * itself rather than only in the README, so a visitor who lands on the live deploy without
 * reading GitHub first still gets the context for why the app behaves the way it does.
 * Images come from public/screenshots/, kept in sync with docs/images/ by
 * scripts/capture-screenshots.mjs (see that file's header for how to regenerate both).
 */
export function AboutPanel({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="About FlowViz" onClick={onClose}>
      <div className="about-panel" onClick={(e) => e.stopPropagation()}>
        <div className="about-panel-header">
          <h2>About FlowViz</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <section className="about-section">
          <h3>The problem</h3>
          <p>
            System architecture and database diagrams are almost entirely visual. Screen readers routinely skip them or
            announce nothing more useful than &ldquo;image.&rdquo; A blind or low-vision person can be a working engineer or
            database designer and still have no practical way to draft one of these diagrams themselves, only to have an
            existing one described to them after a sighted colleague made it.
          </p>
          <p>
            FlowViz tests whether that has to be true. Before any interpretive decision, what type a component is, which
            way an edge points, what a label implies, is committed to a diagram, the system states it in plain language
            and asks the user to confirm or correct it. Nodes, edges, and labels are three separately addressable layers,
            so editing one part never silently moves or removes something else. Neither idea is decoration; both are
            tested directly by the project's automated smoke suite, not just claimed.
          </p>
        </section>

        <section className="about-section">
          <h3>Screenshots</h3>
          <div className="about-gallery">
            {SCREENSHOTS.map((shot) => (
              <figure key={shot.file} className="about-gallery-item">
                <img src={`${import.meta.env.BASE_URL}screenshots/${shot.file}`} alt={shot.caption} loading="lazy" />
                <figcaption>{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
          <p className="settings-hint">
            A recorded walkthrough isn't linked here yet. See the project&apos;s{' '}
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
              README
            </a>{' '}
            for the current status of that.
          </p>
        </section>

        <section className="about-section">
          <h3>Read more</h3>
          <ul className="about-links">
            <li>
              <a href={`${REPO_URL}/blob/main/docs/write-up.md`} target="_blank" rel="noreferrer">
                Literature review and project plan
              </a>
              , why this idea is new, checked against 23 papers across six themes.
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/wiki/Accessibility-and-Novelty.md`} target="_blank" rel="noreferrer">
                Accessibility and novelty
              </a>
              , a focused pass on entity-relationship diagram accessibility specifically.
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/wiki/Feature-Decisions.md`} target="_blank" rel="noreferrer">
                Feature decisions
              </a>
              , what shipped, what didn't, and why, for every feature considered.
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/wiki/Privacy-and-Security.md`} target="_blank" rel="noreferrer">
                Privacy and security
              </a>
              , exactly what data this app touches and where it goes.
            </li>
            <li>
              <a href={`${REPO_URL}/blob/main/docs/architecture.md`} target="_blank" rel="noreferrer">
                Architecture reference
              </a>
              , a file-by-file map of the codebase.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
