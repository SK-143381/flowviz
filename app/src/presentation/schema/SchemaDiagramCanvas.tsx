import { useEffect, useRef, useState } from 'react';
import type { SchemaSessionService } from '../../application/SchemaSessionService';
import { schemaTableList, type SchemaModel } from '../../domain/schema/entities';
import { layoutSchemaTables, type SchemaLayoutResult } from './layoutSchemaTables';
import { SchemaConnectors } from './SchemaConnectors';
import { SchemaTableBox } from './SchemaTableBox';
import { useFitScale } from './useFitScale';

interface Props {
  schema: SchemaModel;
  service: SchemaSessionService;
  /** Exposed so the pane's ExportMenu can rasterize exactly this element. */
  contentRef?: React.Ref<HTMLDivElement>;
}

/**
 * The schema-as-ER-diagram canvas: table boxes laid out and connected like the reference
 * ER diagram, but every box is real interactive HTML (not a picture of one) and the whole
 * thing is scaled with useFitScale() to fit the pane's viewport height — no vertical
 * scrolling required, matching the "shouldn't have to scroll to see it" requirement. The
 * layout recomputes whenever the schema's table/column/reference shape changes.
 */
export function SchemaDiagramCanvas({ schema, service, contentRef }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SchemaLayoutResult>({ boxes: {}, contentWidth: 0, contentHeight: 0 });
  const tables = schemaTableList(schema);

  useEffect(() => {
    let cancelled = false;
    layoutSchemaTables(schema).then((result) => {
      if (!cancelled) setLayout(result);
    });
    return () => {
      cancelled = true;
    };
    // Re-layout whenever table/column/reference shape changes (not on every keystroke of
    // unrelated fields — but re-running is cheap and correctness-first for this milestone).
  }, [schema]);

  const scale = useFitScale(outerRef, layout.contentWidth, layout.contentHeight);

  if (tables.length === 0) {
    return <p className="schema-empty-hint">No tables yet. Load the default schema, describe one above, or add a table.</p>;
  }

  return (
    <div className="schema-diagram-viewport" ref={outerRef}>
      <div
        className="schema-diagram-content"
        ref={contentRef}
        style={{
          width: layout.contentWidth * scale,
          height: layout.contentHeight * scale,
        }}
      >
        <div
          className="schema-diagram-scaled"
          style={{ width: layout.contentWidth, height: layout.contentHeight, transform: `scale(${scale})` }}
        >
          <SchemaConnectors schema={schema} boxes={layout.boxes} width={layout.contentWidth} height={layout.contentHeight} />
          {tables.map((table, index) => {
            const box = layout.boxes[table.id];
            if (!box) return null;
            return <SchemaTableBox key={table.id} table={table} colorIndex={index} box={box} schema={schema} service={service} />;
          })}
        </div>
      </div>
    </div>
  );
}
