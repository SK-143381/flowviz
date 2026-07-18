import { schemaTableList, type SchemaModel } from '../../domain/schema/entities';
import { headerHeight, rowHeight, type TableBoxLayout } from './layoutSchemaTables';

interface Props {
  schema: SchemaModel;
  boxes: Record<string, TableBoxLayout>;
  width: number;
  height: number;
}

/**
 * Crow's-foot-style relationship overlay — purely decorative (every relationship it draws
 * is already stated in the accessible foreign-key cell text), so it's aria-hidden and
 * pointer-events: none. Rendered as its own component/layer, same "layers are independent"
 * principle as the architecture diagram's EdgesLayer.
 */
export function SchemaConnectors({ schema, boxes, width, height }: Props) {
  const tables = schemaTableList(schema);
  const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];

  for (const table of tables) {
    const fromBox = boxes[table.id];
    if (!fromBox) continue;
    table.columns.forEach((column, rowIndex) => {
      if (!column.references) return;
      const targetTable = schema.tables[column.references.tableId];
      const targetBox = boxes[column.references.tableId];
      if (!targetTable || !targetBox) return;
      const targetRowIndex = targetTable.columns.findIndex((c) => c.id === column.references!.columnId);
      const fromY = fromBox.y + headerHeight() + rowIndex * rowHeight() + rowHeight() / 2;
      const toY = targetBox.y + headerHeight() + Math.max(targetRowIndex, 0) * rowHeight() + rowHeight() / 2;
      const fromOnLeft = fromBox.x < targetBox.x;
      const x1 = fromOnLeft ? fromBox.x : fromBox.x + fromBox.width;
      const x2 = fromOnLeft ? targetBox.x + targetBox.width : targetBox.x;
      lines.push({ key: `${table.id}-${column.id}`, x1, y1: fromY, x2, y2: toY });
    });
  }

  return (
    <svg
      className="schema-connectors"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      role="presentation"
    >
      {lines.map((line) => (
        <path
          key={line.key}
          d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`}
          fill="none"
          stroke="var(--schema-connector, #9aa3b2)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}
