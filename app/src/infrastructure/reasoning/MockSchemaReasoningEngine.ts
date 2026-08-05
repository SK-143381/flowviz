/**
 * Rule-based, offline ISchemaReasoningEngine — the schema-pane counterpart to
 * MockReasoningEngine.ts. Handles two input shapes: (1) text containing a Mermaid
 * `erDiagram` block (parsed deterministically via mermaidErParser.ts — this is what makes
 * pasting/uploading the exact DSL from a design doc work out of the box), and (2) a simple
 * line-based fallback DSL for freehand typing: `TableName: col1 PK, col2, col3 FK->Other.col`.
 */

import { nextId } from '../../domain/idGenerator';
import type { Decision, DiagramGraph, GraphDiff } from '../../domain/entities';
import type { ISchemaReasoningEngine, ParseSchemaResult, ProposeSchemaEditResult, TranslatedEdit } from '../../domain/ports';
import type { Correspondence } from '../../domain/sync';
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

function findTableByText(schema: SchemaModel, text: string): SchemaTable | undefined {
  const needle = text.trim().toLowerCase();
  return schemaTableList(schema).find((t) => t.name.toLowerCase().includes(needle));
}

function titleCaseTableName(s: string): string {
  return s.trim().replace(/\s+/g, '_').toUpperCase();
}

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

  async proposeEdit(instruction: string, schema: SchemaModel): Promise<ProposeSchemaEditResult> {
    const lower = instruction.toLowerCase().trim();

    const deleteMatch = lower.match(/^(delete|remove)\s+(?:table\s+)?(.+)$/);
    if (deleteMatch) {
      const table = findTableByText(schema, deleteMatch[2]);
      if (table) return { decisions: [], diff: { removeTableIds: [table.id] } };
    }

    const renameMatch = lower.match(/^rename(?:\s+(?:table\s+)?(.+?))?\s+to\s+(.+)$/);
    if (renameMatch) {
      const [, oldName, newName] = renameMatch;
      const table = oldName ? findTableByText(schema, oldName) : undefined;
      if (table) return { decisions: [], diff: { updateTables: [{ id: table.id, name: titleCaseTableName(newName) }] } };
    }

    const addColumnMatch = lower.match(/^add\s+(?:column\s+)?(\w+)\s+to\s+(.+)$/);
    if (addColumnMatch) {
      const [, columnName, tableName] = addColumnMatch;
      const table = findTableByText(schema, tableName);
      if (table) {
        const column: SchemaColumn = { id: nextId('col'), name: columnName, type: 'string', isPrimaryKey: false, references: null };
        return { decisions: [], diff: { replaceColumns: [{ tableId: table.id, columns: [...table.columns, column] }] } };
      }
    }

    const decision: Decision = {
      id: nextId('sd'),
      category: 'grouping',
      promptSpan: instruction,
      description: `I couldn't confidently map "${instruction}" to a schema change. Did you want to delete, rename, or add a table/column?`,
      options: ['delete', 'rename', 'add'],
      assumedOptionIndex: 0,
      affects: [],
      status: 'pending',
    };
    return { decisions: [decision], diff: {} };
  }

  async reviseSchemaDecision(): Promise<SchemaDiff> {
    // Table categorization is informational for this milestone — it doesn't change
    // structure, only what gets logged/spoken. See docs/architecture.md "known gaps".
    return {};
  }

  async describeSchema(schema: SchemaModel): Promise<string> {
    const tables = schemaTableList(schema);
    if (tables.length === 0) return 'The schema is empty. What entities would you like to model?';
    const columnCount = tables.reduce((sum, t) => sum + t.columns.length, 0);
    const names = tables.map((t) => t.name).join(', ');
    return `I built ${tables.length} table${tables.length === 1 ? '' : 's'} (${names}) with ${columnCount} column${columnCount === 1 ? '' : 's'} total. Does this match what you had in mind, or is there anything you'd like changed?`;
  }

  async translateDiagramEdit(
    diff: GraphDiff,
    correspondence: Correspondence,
    graph: DiagramGraph,
    schema: SchemaModel
  ): Promise<TranslatedEdit<SchemaDiff>> {
    const addedNodes = diff.addNodes ?? [];
    const removedNodeIds = diff.removeNodeIds ?? [];

    // "split" shape: exactly one node removed and multiple added in the same diff — treat it
    // as splitting that table into N new tables, each cloning the original's columns. This is
    // a demoable offline heuristic, not meant to match a live model's judgment exactly.
    if (removedNodeIds.length === 1 && addedNodes.length > 1) {
      const oldTableId = correspondence.nodeToTable[removedNodeIds[0]];
      const oldTable = oldTableId ? schema.tables[oldTableId] : undefined;
      if (oldTable) {
        const addTables: SchemaTable[] = [];
        const addCorrespondence: Array<{ nodeId: string; tableId: string }> = [];
        for (const node of addedNodes) {
          const label = (diff.addLabels ?? []).find((l) => l.elementId === node.id);
          const tableId = nextId('t');
          const columns = oldTable.columns.map((c) => ({ ...c, id: nextId('col') }));
          addTables.push({ id: tableId, name: label?.text ? titleCaseTableName(label.text) : `${oldTable.name}_SPLIT`, columns });
          addCorrespondence.push({ nodeId: node.id, tableId });
        }
        return {
          diff: { addTables, removeTableIds: [oldTable.id] },
          addCorrespondence,
          removedNodeIds,
          removedTableIds: [oldTable.id],
        };
      }
    }

    const addTables: SchemaTable[] = [];
    const addCorrespondence: Array<{ nodeId: string; tableId: string }> = [];
    for (const node of addedNodes) {
      const label = (diff.addLabels ?? []).find((l) => l.elementId === node.id);
      const tableId = nextId('t');
      addTables.push({
        id: tableId,
        name: label?.text ? titleCaseTableName(label.text) : 'NEW_TABLE',
        columns: [{ id: nextId('col'), name: 'id', type: 'int', isPrimaryKey: true, references: null }],
      });
      addCorrespondence.push({ nodeId: node.id, tableId });
    }

    const removeTableIds: string[] = [];
    for (const nodeId of removedNodeIds) {
      const tableId = correspondence.nodeToTable[nodeId];
      if (tableId) removeTableIds.push(tableId);
    }

    const updateTables: Array<{ id: string; name?: string }> = [];
    for (const labelUpdate of diff.updateLabels ?? []) {
      if (!labelUpdate.text) continue;
      const label = graph.labels[labelUpdate.id];
      if (!label || label.elementKind !== 'node') continue;
      const tableId = correspondence.nodeToTable[label.elementId];
      if (tableId) updateTables.push({ id: tableId, name: titleCaseTableName(labelUpdate.text) });
    }

    return {
      diff: {
        ...(addTables.length ? { addTables } : {}),
        ...(removeTableIds.length ? { removeTableIds } : {}),
        ...(updateTables.length ? { updateTables } : {}),
      },
      addCorrespondence,
      removedNodeIds,
      removedTableIds: removeTableIds,
    };
  }
}
