import { useEffect, useRef, useState } from 'react';
import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SessionState } from '../../application/types';
import type { SchemaSessionState } from '../../application/schemaTypes';
import type { ISpeechToText } from '../../domain/ports';
import { schemaTableList } from '../../domain/schema/entities';
import { DecisionDialogue } from './DecisionDialogue';
import { SchemaDecisionDialogue } from './SchemaDecisionDialogue';
import { DocumentUpload } from './DocumentUpload';

type ChatTarget = 'diagram' | 'schema';

interface Props {
  diagramState: SessionState;
  diagramService: DiagramSessionService;
  schemaState: SchemaSessionState;
  schemaService: SchemaSessionService;
  stt: ISpeechToText;
  /** Called whenever the diagram has new decisions to confirm, so the composition root can
   *  make sure the chat pane is actually visible (e.g. un-expand a different pane). */
  onDiagramNeedsConfirmation?: () => void;
}

const isEmptyGraph = (state: SessionState) => Object.keys(state.graph.nodes).length === 0;
const isEmptySchema = (state: SchemaSessionState) => schemaTableList(state.schema).length === 0;

export function ChatPane({ diagramState, diagramService, schemaState, schemaService, stt, onDiagramNeedsConfirmation }: Props) {
  const [target, setTarget] = useState<ChatTarget>('diagram');
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const wasConfirmingDiagram = useRef(false);

  // Whenever the diagram gets new interpretive decisions to confirm — whether from typing a
  // prompt here, or from "Generate architecture diagram" in the schema pane — bring that
  // confirmation to the front: switch this pane to Diagram and ask the composition root to
  // make sure it's actually visible, rather than leaving it silently hidden.
  useEffect(() => {
    const isConfirmingDiagram = diagramState.mode === 'confirming_generation' || diagramState.mode === 'confirming_edit';
    if (isConfirmingDiagram && !wasConfirmingDiagram.current) {
      setTarget('diagram');
      onDiagramNeedsConfirmation?.();
    }
    wasConfirmingDiagram.current = isConfirmingDiagram;
  }, [diagramState.mode, onDiagramNeedsConfirmation]);

  const thinking = target === 'diagram' ? diagramState.thinking : schemaState.thinking;
  const busy =
    (target === 'diagram'
      ? diagramState.mode === 'confirming_generation' || diagramState.mode === 'confirming_edit'
      : schemaState.mode === 'confirming') || thinking;

  const targetIsEmpty = target === 'diagram' ? isEmptyGraph(diagramState) : isEmptySchema(schemaState);

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && !documentContext) || busy) return;
    const combined = [documentContext, trimmed].filter(Boolean).join('\n\n');
    if (target === 'diagram') {
      if (isEmptyGraph(diagramState)) {
        diagramService.generateFromPrompt(combined);
      } else {
        diagramService.requestEdit(combined, diagramState.selectedElementId ?? undefined);
      }
    } else {
      if (isEmptySchema(schemaState)) {
        schemaService.generateFromPrompt(combined);
      } else {
        schemaService.requestEdit(combined);
      }
    }
    setText('');
    setDocumentContext(null);
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

  const activeLog = target === 'diagram' ? diagramState.log : schemaState.log;
  const activeError = target === 'diagram' ? diagramState.error : schemaState.error;

  return (
    <div className="chat-pane">
      <fieldset className="chat-target-toggle" role="radiogroup" aria-label="Which pane the chat applies to">
        <legend className="visually-hidden">Chat target</legend>
        {(['diagram', 'schema'] as const).map((t) => (
          <label key={t} className="toolbar-item">
            <input type="radio" name="chat-target" checked={target === t} onChange={() => setTarget(t)} />
            {t === 'diagram' ? 'Diagram' : 'Schema'}
          </label>
        ))}
      </fieldset>

      <div className="chat-log" ref={logRef} aria-live="polite" aria-label="Conversation log">
        {activeLog.map((entry) => (
          <p key={entry.id} className={`chat-entry chat-entry--${entry.role}`}>
            <strong>{entry.role === 'user' ? 'You' : 'System'}:</strong> {entry.text}
          </p>
        ))}
        {thinking && (
          <p className="chat-entry chat-entry--system chat-entry--thinking" role="status">
            <strong>System:</strong> Thinking…
          </p>
        )}
      </div>

      {target === 'diagram' ? (
        <DecisionDialogue state={diagramState} service={diagramService} />
      ) : (
        <SchemaDecisionDialogue state={schemaState} service={schemaService} />
      )}

      {activeError && <p className="chat-error" role="alert">{activeError}</p>}
      {documentContext && (
        <p className="doc-context-chip">Document attached ({documentContext.length} chars) — will be sent with the next message.</p>
      )}

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          {target === 'diagram'
            ? targetIsEmpty
              ? 'Describe the system architecture diagram you want'
              : 'Describe an edit to the diagram'
            : targetIsEmpty
              ? 'Describe the database schema you want'
              : 'Describe an edit to the schema'}
        </label>
        <input
          id="chat-input"
          type="text"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            target === 'diagram'
              ? targetIsEmpty
                ? "e.g. 'a web app with a cache in front of the database'"
                : "e.g. 'delete cache' or 'rename database to Orders DB'"
              : targetIsEmpty
                ? 'e.g. "Users: id PK, name, email" or paste an erDiagram block'
                : 'e.g. "rename Users to Customers" or "remove table Orders"'
          }
        />
        <button type="button" onClick={toggleMic} aria-pressed={listening} disabled={busy || !stt.isSupported()}>
          {listening ? 'Stop mic' : 'Speak'}
        </button>
        <DocumentUpload label="Upload notes" onLoaded={(content) => setDocumentContext(content)} />
        <button type="submit" disabled={busy || (!text.trim() && !documentContext)}>
          Send
        </button>
      </form>
    </div>
  );
}
