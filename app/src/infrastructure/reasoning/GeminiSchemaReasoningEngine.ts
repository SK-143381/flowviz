/**
 * Live ISchemaReasoningEngine backed by Gemini — the schema-pane counterpart to
 * GeminiReasoningEngine.ts. Turns free text or an uploaded document into tables/columns/
 * foreign keys. See geminiClient.ts for the shared request plumbing.
 */

import { nextId } from '../../application/ids';
import type { Decision, DecisionCategory } from '../../domain/entities';
import type { ISchemaReasoningEngine, ParseSchemaResult } from '../../domain/ports';
import { emptySchema, type ColumnType, type SchemaDiff, type SchemaModel } from '../../domain/schema/entities';
import { callGeminiForJson } from './geminiClient';

const COLUMN_TYPES: ColumnType[] = ['int', 'string', 'decimal', 'date', 'boolean'];

const SCHEMA_CONTRACT = `
Respond with ONLY a JSON object, no prose, matching exactly:
{
  "tables": [{
    "id": string,
    "name": string (SQL-style, e.g. CUSTOMER_DIMENSION),
    "columns": [{ "id": string, "name": string, "type": one of ${JSON.stringify(COLUMN_TYPES)},
                  "isPrimaryKey": boolean, "referencesTableId": string | null, "referencesColumnId": string | null }]
  }],
  "decisions": [{
    "id": string, "category": "grouping", "promptSpan": string, "description": string,
    "options": string[], "assumedOptionIndex": 0, "affects": string[] (table ids)
  }]
}
Every referencesTableId/referencesColumnId must point at ids that exist in "tables".
`;

function coerceSchema(raw: unknown): SchemaModel {
  const schema = emptySchema();
  const obj = raw as { tables?: unknown[] };
  const idMap = new Map<string, string>();

  for (const t of obj.tables ?? []) {
    const table = t as { id?: string; name?: string };
    const id = nextId('gt');
    idMap.set(String(table.id ?? id), id);
  }

  const tablesRaw = (obj.tables ?? []) as Array<{ id?: string; name?: string; columns?: unknown[] }>;
  for (const table of tablesRaw) {
    const tableId = idMap.get(String(table.id))!;
    const columns = (table.columns ?? []).map((c) => {
      const col = c as { id?: string; name?: string; type?: string; isPrimaryKey?: boolean; referencesTableId?: string | null; referencesColumnId?: string | null };
      return {
        id: nextId('gcol'),
        name: col.name ?? 'column',
        type: COLUMN_TYPES.includes(col.type as ColumnType) ? (col.type as ColumnType) : 'string',
        isPrimaryKey: Boolean(col.isPrimaryKey),
        references: null as SchemaModel['tables'][string]['columns'][number]['references'],
      };
    });
    schema.tables[tableId] = { id: tableId, name: table.name ?? 'TABLE', columns };
    schema.tableOrder.push(tableId);
  }

  // Second pass: resolve references now that every table/column id is known.
  for (const table of tablesRaw) {
    const tableId = idMap.get(String(table.id))!;
    const localColumns = (table.columns ?? []) as Array<{ id?: string; referencesTableId?: string | null; referencesColumnId?: string | null }>;
    localColumns.forEach((col, index) => {
      if (!col.referencesTableId) return;
      const targetTableId = idMap.get(String(col.referencesTableId));
      const targetTable = targetTableId ? schema.tables[targetTableId] : undefined;
      if (!targetTable) return;
      const targetColumn = targetTable.columns.find((c) => c.isPrimaryKey) ?? targetTable.columns[0];
      if (!targetColumn) return;
      schema.tables[tableId].columns[index].references = { tableId: targetTable.id, columnId: targetColumn.id };
    });
  }

  return schema;
}

function coerceSchemaDecisions(raw: unknown, schema: SchemaModel): Decision[] {
  const arr = (raw as { decisions?: unknown[] }).decisions ?? [];
  return arr.map((d) => {
    const decision = d as Partial<Decision>;
    const options = Array.isArray(decision.options) && decision.options.length > 0 ? decision.options : ['dimension table (assumed)', 'fact table'];
    return {
      id: nextId('gsd'),
      category: 'grouping' as DecisionCategory,
      promptSpan: decision.promptSpan ?? '',
      description: decision.description ?? 'I categorized this table.',
      options,
      assumedOptionIndex: 0,
      affects: (decision.affects ?? []).filter((id) => schema.tables[id as string]) as string[],
      status: 'pending' as const,
    };
  });
}

export class GeminiSchemaReasoningEngine implements ISchemaReasoningEngine {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async parseSchemaPrompt(prompt: string): Promise<ParseSchemaResult> {
    const raw = await callGeminiForJson(
      this.apiKey,
      `You design relational database schemas from free text or documents (which may contain
notes, a Mermaid erDiagram block, or a plain description of entities). Extract tables,
columns, primary keys, and foreign keys. ${SCHEMA_CONTRACT}`,
      `Input:\n${prompt}`
    );
    const draftSchema = coerceSchema(raw);
    const decisions = coerceSchemaDecisions(raw, draftSchema);
    return { decisions, draftSchema };
  }

  async reviseSchemaDecision(): Promise<SchemaDiff> {
    // Table categorization is informational only in this milestone (see MockSchemaReasoningEngine).
    return {};
  }
}
