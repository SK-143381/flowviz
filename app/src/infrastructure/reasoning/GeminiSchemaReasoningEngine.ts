/**
 * Live ISchemaReasoningEngine backed by Gemini — the schema-pane counterpart to
 * GeminiReasoningEngine.ts. Turns free text or an uploaded document into tables/columns/
 * foreign keys. See geminiClient.ts for the shared request plumbing.
 */

import { nextId } from '../../domain/idGenerator';
import type { Decision, DecisionCategory, DiagramGraph, GraphDiff } from '../../domain/entities';
import type { ISchemaReasoningEngine, ParseSchemaResult, ProposeSchemaEditResult, TranslatedEdit } from '../../domain/ports';
import type { Correspondence } from '../../domain/sync';
import { emptySchema, type ColumnType, type SchemaColumn, type SchemaDiff, type SchemaModel, type SchemaTable } from '../../domain/schema/entities';
import { callGeminiForJson, callGeminiForText } from './geminiClient';

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

const SCHEMA_EDIT_CONTRACT = `
Respond with ONLY a JSON object, no prose, matching exactly:
{
  "addTables": [{ "id": string, "name": string,
                   "columns": [{ "id": string, "name": string, "type": one of ${JSON.stringify(COLUMN_TYPES)},
                                 "isPrimaryKey": boolean, "referencesTableId": string | null, "referencesColumnId": string | null }] }],
  "removeTableIds": string[],
  "updateTables": [{ "id": string, "name": string }],
  "replaceColumns": [{ "tableId": string,
                        "columns": [{ "id": string, "name": string, "type": one of ${JSON.stringify(COLUMN_TYPES)},
                                      "isPrimaryKey": boolean, "referencesTableId": string | null, "referencesColumnId": string | null }] }],
  "decisions": [{ "id": string, "category": "grouping", "promptSpan": string, "description": string,
                   "options": string[], "assumedOptionIndex": 0, "affects": string[] (table ids) }]
}
For anything that already exists in the current schema, reuse its exact id — do not invent a
new one. Only invent new ids for brand-new tables/columns. "removeTableIds", "updateTables",
and the "tableId" of "replaceColumns" must reference existing table ids. Only include the
diff fields that actually change.
`;

/** Resolves a (tableId, columnId) pair from the model's output against the current schema plus any brand-new tables/columns just introduced by this same diff. */
function resolveColumnRef(
  targetTableId: string | null | undefined,
  targetColumnId: string | null | undefined,
  currentSchema: SchemaModel,
  newTableIdMap: Map<string, SchemaTable>,
  newColumnIdMap: Map<string, string>
): { tableId: string; columnId: string } | null {
  if (!targetTableId) return null;
  const existingTable = currentSchema.tables[targetTableId];
  const newTable = newTableIdMap.get(targetTableId);
  const table = existingTable ?? newTable;
  if (!table) return null;

  const wantedColumnId = targetColumnId ? (newColumnIdMap.get(targetColumnId) ?? targetColumnId) : undefined;
  const column = (wantedColumnId && table.columns.find((c) => c.id === wantedColumnId)) ?? table.columns.find((c) => c.isPrimaryKey) ?? table.columns[0];
  if (!column) return null;
  return { tableId: table.id, columnId: column.id };
}

function coerceRawColumns(
  rawColumns: unknown[] | undefined,
  newColumnIdMap: Map<string, string>
): SchemaColumn[] {
  return (rawColumns ?? []).map((c) => {
    const col = c as { id?: string; name?: string; type?: string; isPrimaryKey?: boolean };
    const id = nextId('gcol');
    if (col.id) newColumnIdMap.set(String(col.id), id);
    return {
      id,
      name: col.name ?? 'column',
      type: COLUMN_TYPES.includes(col.type as ColumnType) ? (col.type as ColumnType) : 'string',
      isPrimaryKey: Boolean(col.isPrimaryKey),
      references: null,
    };
  });
}

interface CoercedSchemaDiff {
  diff: SchemaDiff;
  /** The model's own placeholder id for each brand-new table -> the real generated table. */
  newTableIdMap: Map<string, SchemaTable>;
}

function coerceSchemaDiff(raw: unknown, currentSchema: SchemaModel): CoercedSchemaDiff {
  const obj = raw as {
    addTables?: Array<{ id?: string; name?: string; columns?: unknown[] }>;
    removeTableIds?: string[];
    updateTables?: Array<{ id?: string; name?: string }>;
    replaceColumns?: Array<{ tableId?: string; columns?: unknown[] }>;
  };

  const newColumnIdMap = new Map<string, string>();
  const newTableIdMap = new Map<string, SchemaTable>();
  const addTables: SchemaTable[] = (obj.addTables ?? []).map((t) => {
    const id = nextId('gt');
    const table: SchemaTable = { id, name: t.name ?? 'TABLE', columns: coerceRawColumns(t.columns, newColumnIdMap) };
    if (t.id) newTableIdMap.set(String(t.id), table);
    return table;
  });

  const replaceColumns = (obj.replaceColumns ?? [])
    .filter((r) => r.tableId && currentSchema.tables[r.tableId])
    .map((r) => ({ tableId: r.tableId as string, columns: coerceRawColumns(r.columns, newColumnIdMap) }));

  // Second pass: resolve FK references now every table/column id in this diff is known.
  const resolveTableColumns = (rawColumns: unknown[] | undefined, resolvedColumns: SchemaColumn[]) => {
    (rawColumns ?? []).forEach((c, index) => {
      const col = c as { referencesTableId?: string | null; referencesColumnId?: string | null };
      resolvedColumns[index].references = resolveColumnRef(col.referencesTableId, col.referencesColumnId, currentSchema, newTableIdMap, newColumnIdMap);
    });
  };
  (obj.addTables ?? []).forEach((t, i) => resolveTableColumns(t.columns, addTables[i].columns));
  (obj.replaceColumns ?? [])
    .filter((r) => r.tableId && currentSchema.tables[r.tableId])
    .forEach((r, i) => resolveTableColumns(r.columns, replaceColumns[i].columns));

  const removeTableIds = (obj.removeTableIds ?? []).filter((id) => currentSchema.tables[id]);
  const updateTables = (obj.updateTables ?? []).filter((u) => u.id && currentSchema.tables[u.id]) as Array<{ id: string; name?: string }>;

  const diff: SchemaDiff = {};
  if (addTables.length > 0) diff.addTables = addTables;
  if (removeTableIds.length > 0) diff.removeTableIds = removeTableIds;
  if (updateTables.length > 0) diff.updateTables = updateTables;
  if (replaceColumns.length > 0) diff.replaceColumns = replaceColumns;
  return { diff, newTableIdMap };
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
      `You design relational database schemas for whatever domain the user describes — you are
not a literal text-extraction tool. If the input already contains explicit schema
information (a Mermaid erDiagram block, or lines naming tables/columns), extract it
faithfully. Otherwise — a vague or creative description ("a flower shop selling handmade
goodies"), or an open-ended instruction ("you pick") — use your own domain knowledge to
design a sensible schema from scratch: invent table and column names appropriate to the
domain, with primary keys and foreign keys wired up. Never return zero tables for a
non-empty input; if a choice is genuinely ambiguous, make a reasonable assumption and
surface it as a decision rather than returning nothing. ${SCHEMA_CONTRACT}`,
      `Input:\n${prompt}`
    );
    const draftSchema = coerceSchema(raw);
    const decisions = coerceSchemaDecisions(raw, draftSchema);
    return { decisions, draftSchema };
  }

  async proposeEdit(instruction: string, currentSchema: SchemaModel): Promise<ProposeSchemaEditResult> {
    const raw = await callGeminiForJson(
      this.apiKey,
      `You edit an existing relational database schema. ${SCHEMA_EDIT_CONTRACT}`,
      `Current schema: ${JSON.stringify(currentSchema)}\nEdit instruction: "${instruction}"`
    );
    const { diff } = coerceSchemaDiff(raw, currentSchema);
    const decisions = coerceSchemaDecisions(raw, currentSchema);
    return { decisions, diff };
  }

  async reviseSchemaDecision(): Promise<SchemaDiff> {
    // Table categorization is informational only in this milestone (see MockSchemaReasoningEngine).
    return {};
  }

  async describeSchema(schema: SchemaModel): Promise<string> {
    return callGeminiForText(
      this.apiKey,
      `You describe a relational database schema to a blind or low-vision user in plain,
conversational language (Dialogic HCXAI — this is spoken and read as chat, not a report).
In 2-4 sentences: summarize the tables and how they relate, then end with one concrete
follow-up question asking whether it matches what they had in mind, or what they'd like
changed. Plain prose only, no markdown, no bullet points.`,
      `Schema: ${JSON.stringify(schema)}`
    );
  }

  async translateDiagramEdit(
    diff: GraphDiff,
    correspondence: Correspondence,
    currentGraph: DiagramGraph,
    currentSchema: SchemaModel
  ): Promise<TranslatedEdit<SchemaDiff>> {
    const deterministicRemoveTableIds = (diff.removeNodeIds ?? [])
      .map((nodeId) => correspondence.nodeToTable[nodeId])
      .filter((id): id is string => Boolean(id));

    const raw = await callGeminiForJson(
      this.apiKey,
      `This schema's diagram (generated from it) just changed. Translate the diagram change
into an equivalent change to this schema so the two stay in sync — including structural
edits the diagram edit invented on its own, e.g. splitting one node into several should
become splitting one table into several new tables that between them cover the original
table's columns. For every brand-new table you add, set its "id" field to the exact diagram
node id it represents (from the diagram diff's addNodes) — not an id you invent — so the
correspondence between the two stays intact. ${SCHEMA_EDIT_CONTRACT}`,
      `Correspondence (nodeId -> tableId): ${JSON.stringify(correspondence.nodeToTable)}\nCurrent schema: ${JSON.stringify(currentSchema)}\nCurrent diagram: ${JSON.stringify(currentGraph)}\nDiagram change: ${JSON.stringify(diff)}`
    );
    const { diff: schemaDiff, newTableIdMap } = coerceSchemaDiff(raw, currentSchema);
    const removeTableIds = Array.from(new Set([...(schemaDiff.removeTableIds ?? []), ...deterministicRemoveTableIds]));

    return {
      diff: { ...schemaDiff, ...(removeTableIds.length ? { removeTableIds } : {}) },
      addCorrespondence: Array.from(newTableIdMap.entries()).map(([nodeId, table]) => ({ nodeId, tableId: table.id })),
      removedNodeIds: diff.removeNodeIds ?? [],
      removedTableIds: removeTableIds,
    };
  }
}
