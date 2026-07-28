/**
 * Domain entities for the relational-schema pane. Kept separate from diagram entities
 * (domain/entities.ts) on purpose: a schema (tables/columns/keys) and an architecture
 * diagram (nodes/edges/labels) are different models with different editing rules. The
 * conversion between them is one explicit, pure function (schemaToGraph.ts), not an
 * implicit coupling.
 */

export type ColumnType = 'int' | 'string' | 'decimal' | 'date' | 'boolean';

export interface SchemaColumn {
  id: string;
  name: string;
  type: ColumnType;
  isPrimaryKey: boolean;
  /** Set when this column is a foreign key; null while unresolved. */
  references: { tableId: string; columnId: string } | null;
}

export interface SchemaTable {
  id: string;
  name: string;
  columns: SchemaColumn[];
}

export interface SchemaModel {
  tables: Record<string, SchemaTable>;
  /** Preserves table entry order for stable tab-order rendering. */
  tableOrder: string[];
}

export function emptySchema(): SchemaModel {
  return { tables: {}, tableOrder: [] };
}

export function schemaTableList(schema: SchemaModel): SchemaTable[] {
  return schema.tableOrder.map((id) => schema.tables[id]).filter(Boolean);
}

/** A patch to a SchemaModel, mirrors domain/entities.ts's GraphDiff shape/semantics. */
export interface SchemaDiff {
  addTables?: SchemaTable[];
  removeTableIds?: string[];
  updateTables?: Array<Partial<Omit<SchemaTable, 'columns'>> & { id: string }>;
  /** Full replacement of one table's column list (simplest correct semantics for column edits). */
  replaceColumns?: Array<{ tableId: string; columns: SchemaColumn[] }>;
}

export function applySchemaDiff(schema: SchemaModel, diff: SchemaDiff): SchemaModel {
  const tables = { ...schema.tables };
  let tableOrder = [...schema.tableOrder];

  for (const id of diff.removeTableIds ?? []) {
    delete tables[id];
    tableOrder = tableOrder.filter((t) => t !== id);
  }
  for (const t of diff.addTables ?? []) {
    tables[t.id] = t;
    if (!tableOrder.includes(t.id)) tableOrder.push(t.id);
  }
  for (const u of diff.updateTables ?? []) {
    if (tables[u.id]) tables[u.id] = { ...tables[u.id], ...u };
  }
  for (const r of diff.replaceColumns ?? []) {
    if (tables[r.tableId]) tables[r.tableId] = { ...tables[r.tableId], columns: r.columns };
  }

  return { tables, tableOrder };
}

/** Every primary-key column across the schema, as candidate foreign-key targets. */
export function primaryKeyCandidates(schema: SchemaModel): Array<{ tableId: string; tableName: string; column: SchemaColumn }> {
  const out: Array<{ tableId: string; tableName: string; column: SchemaColumn }> = [];
  for (const table of schemaTableList(schema)) {
    for (const column of table.columns) {
      if (column.isPrimaryKey) out.push({ tableId: table.id, tableName: table.name, column });
    }
  }
  return out;
}
