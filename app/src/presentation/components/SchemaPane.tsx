import { useRef } from 'react';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SchemaSessionState } from '../../application/schemaTypes';
import type { SchemaModel } from '../../domain/schema/entities';
import { schemaTableList } from '../../domain/schema/entities';
import { SchemaDiagramCanvas } from '../schema/SchemaDiagramCanvas';
import { ExportMenu } from './ExportMenu';

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
  const contentRef = useRef<HTMLDivElement>(null);
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

      <SchemaDiagramCanvas schema={state.schema} service={service} contentRef={contentRef} />
    </div>
  );
}
