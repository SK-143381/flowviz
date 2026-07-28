import { useEffect, useState } from 'react';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SchemaSessionState } from '../../application/schemaTypes';

interface Props {
  state: SchemaSessionState;
  service: SchemaSessionService;
}

/** Schema-pane counterpart to DecisionDialogue.tsx — same one-at-a-time HCXAI pattern, independent component. */
export function SchemaDecisionDialogue({ state, service }: Props) {
  const decision = state.pendingDecisions[state.activeDecisionIndex];
  const [chosen, setChosen] = useState<number | null>(null);

  useEffect(() => {
    setChosen(decision ? decision.assumedOptionIndex : null);
  }, [decision?.id]);

  if (state.mode !== 'confirming' || !decision) return null;

  return (
    <section className="decision-dialogue" aria-live="assertive" aria-label="Schema decision confirmation">
      <p className="decision-progress">
        Table decision {state.activeDecisionIndex + 1} of {state.pendingDecisions.length}
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
