import { useRef, useState } from 'react';
import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SessionState } from '../../application/types';
import type { ISpeechToText } from '../../domain/ports';
import { DecisionDialogue } from './DecisionDialogue';

interface Props {
  state: SessionState;
  service: DiagramSessionService;
  stt: ISpeechToText;
}

const isEmptyGraph = (state: SessionState) => Object.keys(state.graph.nodes).length === 0;

export function ChatPane({ state, service, stt }: Props) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const busy = state.mode === 'confirming_generation' || state.mode === 'confirming_edit';

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (isEmptyGraph(state)) {
      service.generateFromPrompt(trimmed);
    } else {
      service.requestEdit(trimmed, state.selectedElementId ?? undefined);
    }
    setText('');
  };

  const toggleMic = () => {
    if (!stt.isSupported()) return;
    if (listening) {
      stt.stop();
      setListening(false);
      return;
    }
    setListening(true);
    stt.start(
      (result) => {
        setText(result);
        setListening(false);
      },
      () => setListening(false)
    );
  };

  return (
    <div className="chat-pane">
      <div className="chat-log" ref={logRef} aria-live="polite" aria-label="Conversation log">
        {state.log.map((entry) => (
          <p key={entry.id} className={`chat-entry chat-entry--${entry.role}`}>
            <strong>{entry.role === 'user' ? 'You' : 'System'}:</strong> {entry.text}
          </p>
        ))}
      </div>

      <DecisionDialogue state={state} service={service} />

      {state.error && <p className="chat-error" role="alert">{state.error}</p>}

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          {isEmptyGraph(state) ? 'Describe the system architecture diagram you want' : 'Describe an edit to the diagram'}
        </label>
        <input
          id="chat-input"
          type="text"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isEmptyGraph(state)
              ? "e.g. 'a web app with a cache in front of the database'"
              : "e.g. 'delete cache' or 'rename database to Orders DB'"
          }
        />
        <button type="button" onClick={toggleMic} aria-pressed={listening} disabled={busy || !stt.isSupported()}>
          {listening ? 'Stop mic' : 'Speak'}
        </button>
        <button type="submit" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
