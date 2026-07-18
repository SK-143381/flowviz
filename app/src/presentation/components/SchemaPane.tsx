import { useRef, useState } from 'react';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SchemaSessionState } from '../../application/schemaTypes';
import type { SchemaModel } from '../../domain/schema/entities';
import { schemaTableList } from '../../domain/schema/entities';
import { SchemaDiagramCanvas } from '../schema/SchemaDiagramCanvas';
import { DocumentUpload } from './DocumentUpload';
import { ExportMenu } from './ExportMenu';
import { SchemaDecisionDialogue } from './SchemaDecisionDialogue';

interface Props {
  state: SchemaSessionState;
  service: SchemaSessionService;
  onGenerateDiagram: (schema: SchemaModel) => void;
}

/**
 * The schema pane: an editable ER-diagram-style canvas (SchemaDiagramCanvas), styled and
 * laid out like the reference ER diagram — colored table boxes connected by relationship
 * lines — but fully interactive and screen-reader accessible, and scaled to fit the pane's
 * height so there's no vertical scrolling. Tab order across cells is native DOM order
 * (inputs rendered in table -> column order, no custom tabIndex). The foreign-key cell is
 * the one non-native-input control: Enter cycles it through primary-key candidates
 * (SchemaSessionService.cycleColumnReference), Tab moves on.
 */
export function SchemaPane({ state, service, onGenerateDiagram }: Props) {
  const [prompt, setPrompt] = useState('');
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const busy = state.mode === 'confirming';

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed && !documentContext) return;
    const combined = [documentContext, trimmed].filter(Boolean).join('\n\n');
    service.generateFromPrompt(combined);
    setPrompt('');
    setDocumentContext(null);
  };

  const tables = schemaTableList(state.schema);

  return (
    <div className="schema-pane">
      <div className="schema-toolbar" role="toolbar" aria-label="Schema controls">
        <button type="button" onClick={() => service.loadDefaultSchema()}>
          Load default schema
        </button>
        <button type="button" onClick={() => service.clearSchema()}>
          Clear schema
        </button>
        <button type="button" onClick={() => service.addTable()}>
          Add table
        </button>
        <button type="button" onClick={() => onGenerateDiagram(state.schema)} disabled={tables.length === 0}>
          Generate architecture diagram →
        </button>
        <ExportMenu kind="html" getElement={() => contentRef.current} filenamePrefix="schema" disabled={tables.length === 0} label="Export schema image" />
      </div>

      <form
        className="schema-prompt-row"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <label htmlFor="schema-prompt" className="visually-hidden">
          Describe the entities you want, or type e.g. "Users: id PK, name, email"
        </label>
        <input
          id="schema-prompt"
          type="text"
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Users: id PK, name, email" or paste an erDiagram block'
        />
        <DocumentUpload
          label="Upload notes"
          onLoaded={(text) => {
            setDocumentContext(text);
          }}
        />
        <button type="submit" disabled={busy || (!prompt.trim() && !documentContext)}>
          Generate schema
        </button>
      </form>
      {documentContext && <p className="doc-context-chip">Document attached ({documentContext.length} chars) — will be sent with the next generate.</p>}

      <SchemaDecisionDialogue state={state} service={service} />
      {state.error && (
        <p className="chat-error" role="alert">
          {state.error}
        </p>
      )}

      <SchemaDiagramCanvas schema={state.schema} service={service} contentRef={contentRef} />
    </div>
  );
}
