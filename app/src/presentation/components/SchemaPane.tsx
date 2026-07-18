import { useRef, useState } from 'react';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SchemaSessionState } from '../../application/schemaTypes';
import type { ColumnType, SchemaModel } from '../../domain/schema/entities';
import { schemaTableList } from '../../domain/schema/entities';
import { DocumentUpload } from './DocumentUpload';
import { ExportMenu } from './ExportMenu';
import { SchemaDecisionDialogue } from './SchemaDecisionDialogue';

interface Props {
  state: SchemaSessionState;
  service: SchemaSessionService;
  onGenerateDiagram: (schema: SchemaModel) => void;
}

const COLUMN_TYPES: ColumnType[] = ['int', 'string', 'decimal', 'date', 'boolean'];

/**
 * The schema pane: an editable, tab-navigable relational-schema grid. Native DOM tab order
 * (inputs rendered in table -> column order, no custom tabIndex) gives "tab through cells"
 * for free. The foreign-key cell is the one non-native-input control: Enter cycles it
 * through primary-key candidates (SchemaSessionService.cycleColumnReference), Tab moves on —
 * exactly the interaction the feature request asked for.
 */
export function SchemaPane({ state, service, onGenerateDiagram }: Props) {
  const [prompt, setPrompt] = useState('');
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
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
        <ExportMenu kind="html" getElement={() => gridRef.current} filenamePrefix="schema" disabled={tables.length === 0} label="Export schema image" />
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

      <div className="schema-grid" ref={gridRef}>
        {tables.length === 0 && <p className="schema-empty-hint">No tables yet. Load the default schema, describe one above, or add a table.</p>}
        {tables.map((table) => (
          <div className="schema-table-card" key={table.id}>
            <div className="schema-table-header">
              <input
                aria-label={`Table name for ${table.name}`}
                className="schema-table-name"
                value={table.name}
                onChange={(e) => service.renameTable(table.id, e.target.value)}
              />
              <button type="button" onClick={() => service.removeTable(table.id)} aria-label={`Remove table ${table.name}`}>
                ✕
              </button>
            </div>
            <div className="schema-column-rows">
              {table.columns.map((column) => (
                <div className="schema-column-row" key={column.id}>
                  <input
                    aria-label={`Column name`}
                    value={column.name}
                    onChange={(e) => service.updateColumn(table.id, column.id, { name: e.target.value })}
                  />
                  <select
                    aria-label="Column type"
                    value={column.type}
                    onChange={(e) => service.setColumnType(table.id, column.id, e.target.value as ColumnType)}
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <label className="schema-pk-toggle">
                    <input
                      type="checkbox"
                      checked={column.isPrimaryKey}
                      onChange={(e) => service.updateColumn(table.id, column.id, { isPrimaryKey: e.target.checked })}
                    />
                    PK
                  </label>
                  <div
                    className="schema-fk-cell"
                    tabIndex={0}
                    role="button"
                    aria-label={
                      column.references
                        ? `Foreign key referencing ${state.schema.tables[column.references.tableId]?.name}. Press Enter to change.`
                        : 'Not a foreign key. Press Enter to link to a primary key.'
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        service.cycleColumnReference(table.id, column.id);
                      }
                    }}
                    onClick={() => service.cycleColumnReference(table.id, column.id)}
                  >
                    {column.references
                      ? `→ ${state.schema.tables[column.references.tableId]?.name}.${
                          state.schema.tables[column.references.tableId]?.columns.find((c) => c.id === column.references!.columnId)?.name
                        }`
                      : '— (Enter to link)'}
                  </div>
                  <button type="button" onClick={() => service.removeColumn(table.id, column.id)} aria-label="Remove column">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => service.addColumn(table.id)} className="schema-add-column">
              + Column
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
