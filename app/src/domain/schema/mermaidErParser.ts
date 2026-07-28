/**
 * Pure parser: Mermaid `erDiagram` DSL text -> SchemaModel. No I/O, no framework imports.
 * Used by (a) the default-schema loader, (b) MockSchemaReasoningEngine when the user
 * pastes/uploads a document that already contains an erDiagram block, and (c) available to
 * any future reasoning engine that wants a deterministic fallback parser.
 *
 * Supports the two erDiagram constructs that matter for this app:
 *   TABLE_A ||--o{ TABLE_B : "fk_column_name"      (relationship line)
 *   TABLE_NAME { type col_name PK|FK  ... }         (attribute block)
 */

import type { ColumnType, SchemaModel, SchemaTable, SchemaColumn } from './entities';
import { emptySchema } from './entities';
import { nextId } from '../idGenerator';

const TYPE_MAP: Record<string, ColumnType> = {
  int: 'int',
  integer: 'int',
  string: 'string',
  varchar: 'string',
  text: 'string',
  decimal: 'decimal',
  float: 'decimal',
  double: 'decimal',
  date: 'date',
  datetime: 'date',
  boolean: 'boolean',
  bool: 'boolean',
};

function normalizeType(raw: string): ColumnType {
  return TYPE_MAP[raw.toLowerCase()] ?? 'string';
}

interface RelationshipLine {
  fromTableName: string;
  toTableName: string;
  columnHint: string;
}

export function parseMermaidErDiagram(text: string): SchemaModel {
  const schema = emptySchema();
  const nameToTableId = new Map<string, string>();
  const relationships: RelationshipLine[] = [];

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Attribute block: "TABLE_NAME {"
    const blockStart = line.match(/^([A-Za-z_][\w]*)\s*\{\s*$/);
    if (blockStart) {
      const tableName = blockStart[1];
      const tableId = nameToTableId.get(tableName) ?? nextId('t');
      nameToTableId.set(tableName, tableId);
      const columns: SchemaColumn[] = [];
      i += 1;
      while (i < lines.length && lines[i] !== '}') {
        const colMatch = lines[i].match(/^(\S+)\s+(\S+)\s*(PK|FK)?/i);
        if (colMatch) {
          const [, rawType, colName, keyFlag] = colMatch;
          columns.push({
            id: nextId('col'),
            name: colName,
            type: normalizeType(rawType),
            isPrimaryKey: (keyFlag ?? '').toUpperCase() === 'PK',
            references: null,
          });
        }
        i += 1;
      }
      const table: SchemaTable = { id: tableId, name: tableName, columns };
      schema.tables[tableId] = table;
      if (!schema.tableOrder.includes(tableId)) schema.tableOrder.push(tableId);
      i += 1; // skip closing "}"
      continue;
    }

    // Relationship line: "A ||--o{ B : "label""
    const relMatch = line.match(/^([A-Za-z_][\w]*)\s+\S*--\S*\s+([A-Za-z_][\w]*)\s*:\s*"?([^"]+)"?\s*$/);
    if (relMatch) {
      const [, fromTableName, toTableName, columnHint] = relMatch;
      relationships.push({ fromTableName, toTableName, columnHint: columnHint.trim() });
    }

    i += 1;
  }

  // Resolve relationships into FK column `references`.
  for (const rel of relationships) {
    const fromId = nameToTableId.get(rel.fromTableName);
    const toId = nameToTableId.get(rel.toTableName);
    if (!fromId || !toId) continue;
    const fromTable = schema.tables[fromId];
    const toTable = schema.tables[toId];
    if (!fromTable || !toTable) continue;

    const targetPk =
      fromTable.columns.find((c) => c.isPrimaryKey && c.name.toLowerCase() === rel.columnHint.toLowerCase()) ??
      fromTable.columns.find((c) => c.isPrimaryKey);
    if (!targetPk) continue;

    const hint = rel.columnHint.toLowerCase();
    const matchingFkColumns = toTable.columns.filter(
      (c) => !c.isPrimaryKey && (c.name.toLowerCase() === hint || c.name.toLowerCase().includes(hint))
    );
    const columnsToLink = matchingFkColumns.length > 0 ? matchingFkColumns : toTable.columns.filter((c) => !c.isPrimaryKey && !c.references);

    for (const col of columnsToLink) {
      col.references = { tableId: fromTable.id, columnId: targetPk.id };
    }
  }

  return schema;
}

export function looksLikeMermaidErDiagram(text: string): boolean {
  return /\berDiagram\b/.test(text);
}
