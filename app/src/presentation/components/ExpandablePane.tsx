import { useEffect, useRef } from 'react';

interface Props {
  /** Human-readable name announced to screen readers, e.g. "Database schema panel". */
  label: string;
  isExpanded: boolean;
  /** True when a *different* pane is expanded — this one is hidden (not just visually). */
  isHidden: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Generic "tab to a pane, Enter to zoom into it, Escape to return to the three-pane view"
 * wrapper — used identically by all three top-level panes in App.tsx. Pure presentation, no
 * service dependency, so it's independently reusable/testable.
 *
 * Hidden panes use the native `hidden` attribute rather than being unmounted: the browser
 * removes them from layout, the tab order, and the accessibility tree for free, while the
 * pane's own component (and its session-service subscription + any in-progress typed draft)
 * stays mounted underneath.
 */
export function ExpandablePane({ label, isExpanded, isHidden, onExpand, onCollapse, className, children }: Props) {
  const wrapperRef = useRef<HTMLElement>(null);
  const wasExpanded = useRef(isExpanded);

  useEffect(() => {
    if (wasExpanded.current && !isExpanded) {
      // Just collapsed (possibly via a global Escape while focus was deep inside) — return
      // focus to the pane wrapper itself so keyboard users land somewhere sensible.
      wrapperRef.current?.focus();
    }
    wasExpanded.current = isExpanded;
  }, [isExpanded]);

  if (isHidden) {
    return (
      <section ref={wrapperRef} className={className} aria-label={label} hidden>
        {children}
      </section>
    );
  }

  return (
    <section
      ref={wrapperRef}
      className={`${className ?? ''} ${isExpanded ? 'pane-wrapper--expanded' : 'pane-wrapper--collapsible'}`.trim()}
      aria-label={isExpanded ? `${label}, expanded. Press Escape to return to the three-pane view.` : `${label}. Press Enter to expand.`}
      tabIndex={isExpanded ? undefined : 0}
      onKeyDown={(e) => {
        // Escape collapses from anywhere inside the expanded pane (any focused descendant);
        // Enter only expands when the wrapper itself is the focused element, so pressing
        // Enter inside a text input or on a button never gets hijacked into a zoom.
        if (e.key === 'Escape' && isExpanded) {
          e.preventDefault();
          e.stopPropagation();
          onCollapse();
          return;
        }
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' && !isExpanded) {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      {isExpanded && (
        <div className="pane-expanded-bar">
          <span>{label} — expanded</span>
          <button type="button" onClick={onCollapse}>
            Collapse (Esc)
          </button>
        </div>
      )}
      {children}
    </section>
  );
}
