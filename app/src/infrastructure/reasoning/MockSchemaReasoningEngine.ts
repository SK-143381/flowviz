/**
 * Rule-based, offline ISchemaReasoningEngine — the schema-pane counterpart to
 * MockReasoningEngine.ts. Handles two input shapes: (1) text containing a Mermaid
 * `erDiagram` block (parsed deterministically via mermaidErParser.ts — this is what makes
 * pasting/uploading the exact DSL from a design doc work out of the box), and (2) a simple
 * line-based fallback DSL for freehand typing: `TableName: col1 PK, col2, col3 FK->Other.col`.
 */

import { nextId } from '../../application/ids';
import type { Decision } from '../../domain/entities';
import type { ISchemaReasoningEngine, ParseSchemaResult } from '../../domain/ports';
import { looksLikeMermaidErDiagram, parseMermaidErDiagram } from '../../domain/schema/mermaidErParser';
import {
  emptySchema,
  schemaTableList,
  type ColumnType,
  type SchemaColumn,
  type SchemaDiff,
  type SchemaModel,
  type SchemaTable,
} from '../../domain/schema/entities';

const TYPE_WORDS: Record<string, ColumnType> = {
  int: 'int',
  integer: 'int',
  string: 'string',
  str: 'string',
  text: 'string',
  decimal: 'decimal',
  float: 'decimal',
  date: 'date',
  bool: 'boolean',
  boolean: 'boolean',
};

/** `TableName: col1 PK, col2 string, col3 FK->Other.col` line-based fallback DSL. */
function parseLineDsl(text: string): SchemaModel {
  const schema = emptySchema();
  const nameToId = new Map<string, string>();
  const pendingRefs: Array<{ tableId: string; columnId: string; targetTable: string; targetColumn?: string }> = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z_][\w]*)\s*:\s*(.+)$/);
    if (!match) continue;
    const [, tableName, rest] = match;
    const tableId = nameToId.get(tableName) ?? nextId('t');
    nameToId.set(tableName, tableId);

    const columns: SchemaColumn[] = [];
    for (const part of rest.split(',')) {
      const token = part.trim();
      if (!token) continue;
      const fkMatch = token.match(/^([\w]+)\s+FK\s*->\s*([\w]+)(?:\.([\w]+))?$/i);
      const pkMatch = token.match(/^([\w]+)\s+PK$/i);
      const typedMatch = token.match(/^([\w]+)\s+(\w+)$/);
      const bareMatch = token.match(/^([\w]+)$/);

      const columnId = nextId('col');
      if (fkMatch) {
        const [, colName, targetTable, targetColumn] = fkMatch;
        columns.push({ id: columnId, name: colName, type: 'int', isPrimaryKey: false, references: null });
        pendingRefs.push({ tableId, columnId, targetTable, targetColumn });
      } else if (pkMatch) {
        columns.push({ id: columnId, name: pkMatch[1], type: 'int', isPrimaryKey: true, references: null });
      } else if (typedMatch && TYPE_WORDS[typedMatch[2].toLowerCase()]) {
        columns.push({ id: columnId, name: typedMatch[1], type: TYPE_WORDS[typedMatch[2].toLowerCase()], isPrimaryKey: false, references: null });
      } else if (bareMatch) {
        columns.push({ id: columnId, name: bareMatch[1], type: 'string', isPrimaryKey: false, references: null });
      }
    }

    const table: SchemaTable = { id: tableId, name: tableName, columns };
    schema.tables[tableId] = table;
    if (!schema.tableOrder.includes(tableId)) schema.tableOrder.push(tableId);
  }

  for (const ref of pendingRefs) {
    const targetTableId = nameToId.get(ref.targetTable);
    if (!targetTableId) continue;
    const targetTable = schema.tables[targetTableId];
    const targetColumn = ref.targetColumn
      ? targetTable.columns.find((c) => c.name === ref.targetColumn)
      : targetTable.columns.find((c) => c.isPrimaryKey);
    if (!targetColumn) continue;
    const sourceTable = schema.tables[ref.tableId];
    const col = sourceTable.columns.find((c) => c.id === ref.columnId);
    if (col) col.references = { tableId: targetTableId, columnId: targetColumn.id };
  }

  return schema;
}

export class MockSchemaReasoningEngine implements ISchemaReasoningEngine {
  async parseSchemaPrompt(prompt: string): Promise<ParseSchemaResult> {
    const draftSchema = looksLikeMermaidErDiagram(prompt) ? parseMermaidErDiagram(prompt) : parseLineDsl(prompt);

    const decisions: Decision[] = [];
    for (const table of schemaTableList(draftSchema)) {
      const fkCount = table.columns.filter((c) => !c.isPrimaryKey && c.references).length;
      const assumedFact = fkCount >= 2;
      decisions.push({
        id: nextId('sd'),
        category: 'grouping',
        promptSpan: table.name,
        description: `I read "${table.name}" as a ${assumedFact ? 'fact' : 'dimension'} table (it has ${fkCount} foreign key column${fkCount === 1 ? '' : 's'}).`,
        options: assumedFact
          ? ['fact table (assumed)', 'dimension table', 'junction table']
          : ['dimension table (assumed)', 'fact table', 'junction table'],
        assumedOptionIndex: 0,
        affects: [table.id],
        status: 'pending',
      });
    }

    return { decisions, draftSchema };
  }

  async reviseSchemaDecision(): Promise<SchemaDiff> {
    // Table categorization is informational for this milestone — it doesn't change
    // structure, only what gets logged/spoken. See docs/architecture.md "known gaps".
    return {};
  }
}
