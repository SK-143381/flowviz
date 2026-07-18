import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { ColumnType, SchemaModel, SchemaTable } from '../../domain/schema/entities';
import type { TableBoxLayout } from './layoutSchemaTables';
import { tableColor } from './tablePalette';

interface Props {
  table: SchemaTable;
  colorIndex: number;
  box: TableBoxLayout;
  schema: SchemaModel;
  service: SchemaSessionService;
}

const COLUMN_TYPES: ColumnType[] = ['int', 'string', 'decimal', 'date', 'boolean'];

/**
 * One ER-style table box: colored header (per-table palette, tablePalette.ts) + editable
 * column rows — the visual language of the reference ER diagram, kept fully interactive
 * (real <input>/<select>/<button> elements, native tab order, ARIA labels) rather than a
 * static picture of one.
 */
export function SchemaTableBox({ table, colorIndex, box, schema, service }: Props) {
  const color = tableColor(colorIndex);

  return (
    <section
      className="schema-table-box"
      style={{ left: box.x, top: box.y, width: box.width, borderColor: color.border }}
      aria-label={`Table ${table.name}, ${table.columns.length} columns`}
    >
      <div className="schema-table-box-header" style={{ background: color.header, color: color.text }}>
        <input
          aria-label={`Table name for ${table.name}`}
          className="schema-table-box-name"
          value={table.name}
          onChange={(e) => service.renameTable(table.id, e.target.value)}
          style={{ color: color.text }}
        />
        <button type="button" className="schema-icon-btn" onClick={() => service.addColumn(table.id)} aria-label={`Add column to ${table.name}`}>
          +
        </button>
        <button type="button" className="schema-icon-btn" onClick={() => service.removeTable(table.id)} aria-label={`Remove table ${table.name}`}>
          ✕
        </button>
      </div>
      <div className="schema-table-box-rows">
        {table.columns.map((column) => (
          <div className="schema-table-box-row" key={column.id}>
            <select
              aria-label={`Type of column ${column.name}`}
              className="schema-box-type"
              value={column.type}
              onChange={(e) => service.setColumnType(table.id, column.id, e.target.value as ColumnType)}
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              aria-label="Column name"
              className="schema-box-name"
              value={column.name}
              onChange={(e) => service.updateColumn(table.id, column.id, { name: e.target.value })}
            />
            <label className="schema-box-pk" title="Primary key">
              <input
                type="checkbox"
                checked={column.isPrimaryKey}
                onChange={(e) => service.updateColumn(table.id, column.id, { isPrimaryKey: e.target.checked })}
                aria-label={`${column.name} is primary key`}
              />
              PK
            </label>
            <div
              className="schema-box-fk"
              tabIndex={0}
              role="button"
              aria-label={
                column.references
                  ? `Foreign key referencing ${schema.tables[column.references.tableId]?.name}. Press Enter to change.`
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
              {column.references ? `FK → ${schema.tables[column.references.tableId]?.name}` : '—'}
            </div>
            <button
              type="button"
              className="schema-icon-btn"
              onClick={() => service.removeColumn(table.id, column.id)}
              aria-label={`Remove column ${column.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
