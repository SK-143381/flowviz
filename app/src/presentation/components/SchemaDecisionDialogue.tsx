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

  // See DecisionDialogue.tsx for why this starts unselected rather than pre-checked to the
  // assumed option (a re-click on an already-checked radio never fires onChange).
  useEffect(() => {
    setChosen(null);
  }, [decision?.id]);

  if (state.mode !== 'confirming' || !decision) return null;

  const choose = (i: number) => {
    if (state.thinking) return;
    setChosen(i);
    if (i === decision.assumedOptionIndex) service.confirmActiveDecision();
    else service.contestActiveDecision(i);
  };

  return (
    <section className="decision-dialogue" aria-live="assertive" aria-label="Schema decision confirmation">
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
