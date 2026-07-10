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

  useEffect(() => {
    setChosen(decision ? decision.assumedOptionIndex : null);
  }, [decision?.id]);

  if (state.mode !== 'confirming_generation' && state.mode !== 'confirming_edit') return null;

  if (decision) {
    return (
      <section className="decision-dialogue" aria-live="assertive" aria-label="Decision confirmation">
        <p className="decision-progress">
          Decision {state.activeDecisionIndex + 1} of {state.pendingDecisions.length}
        </p>
        <p className="decision-description">{decision.description}</p>
        <fieldset>
          <legend>Is this correct, or would you like a different alternative?</legend>
          {decision.options.map((opt, i) => (
            <label key={opt} className="decision-option">
              <input type="radio" name={decision.id} checked={chosen === i} onChange={() => setChosen(i)} />
              {opt}
              {i === decision.assumedOptionIndex ? ' (assumed)' : ''}
            </label>
          ))}
        </fieldset>
        <div className="decision-actions">
          <button type="button" onClick={() => service.confirmActiveDecision()}>
            Confirm assumption
          </button>
          <button
            type="button"
            onClick={() => service.contestActiveDecision(chosen ?? decision.assumedOptionIndex)}
            disabled={chosen === null || chosen === decision.assumedOptionIndex}
          >
            Use selected alternative
          </button>
        </div>
      </section>
    );
  }

  if (state.mode === 'confirming_edit' && state.stagedRecords.length > 0) {
    return (
      <section className="decision-dialogue" aria-live="assertive" aria-label="Propagated effects confirmation">
        <p className="decision-description">This change also causes:</p>
        <ul>
          {state.stagedRecords.map((r) => (
            <li key={r.id}>{r.effect}</li>
          ))}
        </ul>
        <div className="decision-actions">
          <button type="button" onClick={() => service.confirmPropagatedEffects()}>
            Apply all
          </button>
          <button type="button" onClick={() => service.cancelEdit()}>
            Cancel edit
          </button>
        </div>
      </section>
    );
  }

  return null;
}
