import { useEffect, useState } from 'react';
import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SessionState } from '../../application/types';

interface Props {
  state: SessionState;
  service: DiagramSessionService;
}

/**
 * The HCXAI confirmation dialogue (write-up Task 2): one decision cluster at a time,
 * plain language, explicit alternatives, contestable before commitment. Also renders the
 * "propagated effects" confirmation step of the dependency-aware edit loop.
 */
export function DecisionDialogue({ state, service }: Props) {
  const decision = state.pendingDecisions[state.activeDecisionIndex];
  const [chosen, setChosen] = useState<number | null>(null);

  // Deliberately starts unselected (not pre-checked to the assumed option): a radio that's
  // already checked doesn't fire onChange when clicked again, which would silently swallow
  // the click meant to confirm the guess. Nothing is preselected, so every pick — including
  // the guess itself — is a real state change and reliably fires.
  useEffect(() => {
    setChosen(null);
  }, [decision?.id]);

  if (state.mode !== 'confirming_generation' && state.mode !== 'confirming_edit') return null;

  if (decision) {
    const choose = (i: number) => {
      if (state.thinking) return;
      setChosen(i);
      if (i === decision.assumedOptionIndex) service.confirmActiveDecision();
      else service.contestActiveDecision(i);
    };

    return (
      <section className="decision-dialogue" aria-live="assertive" aria-label="Decision confirmation">
        <p className="decision-progress">
          {state.pendingDecisions.length > 1
            ? `Quick check ${state.activeDecisionIndex + 1} of ${state.pendingDecisions.length}`
            : 'One thing to double-check'}
        </p>
        <p className="decision-description">{decision.description}</p>
        <fieldset>
          <legend>Did I get that right? Pick one to confirm it.</legend>
          {decision.options.map((opt, i) => (
            <label key={opt} className="decision-option">
              <input type="radio" name={decision.id} checked={chosen === i} disabled={state.thinking} onChange={() => choose(i)} />
              {opt}
              {i === decision.assumedOptionIndex ? ' (my guess)' : ''}
            </label>
          ))}
        </fieldset>
        {state.thinking && (
          <p role="status" className="decision-thinking">
            Thinking…
          </p>
        )}
      </section>
    );
  }

  if (state.mode === 'confirming_edit' && state.stagedRecords.length > 0) {
    return (
      <section className="decision-dialogue" aria-live="assertive" aria-label="Propagated effects confirmation">
        <p className="decision-description">That will also change:</p>
        <ul>
          {state.stagedRecords.map((r) => (
            <li key={r.id}>{r.effect}</li>
          ))}
        </ul>
        {state.thinking && (
          <p role="status" className="decision-thinking">
            Thinking…
          </p>
        )}
        <div className="decision-actions">
          <button type="button" onClick={() => service.confirmPropagatedEffects()} disabled={state.thinking}>
            Yes, make all these changes
          </button>
          <button type="button" onClick={() => service.cancelEdit()} disabled={state.thinking}>
            No, don't apply this
          </button>
        </div>
      </section>
    );
  }

  return null;
}
