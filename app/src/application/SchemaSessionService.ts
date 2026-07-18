/**
 * Application service for the schema pane. Mirrors DiagramSessionService's shape (plain
 * observable, subscribe/notify, one-decision-at-a-time HCXAI loop for AI-driven parsing) but
 * is an independent, self-contained service: the schema pane and the diagram pane can be
 * developed, tested, and reasoned about without either one importing the other. The only
 * place they meet is DiagramSessionService.generateFromSchema(), which takes a *snapshot* of
 * SchemaModel — SchemaSessionService never reaches into DiagramSessionService or vice versa.
 *
 * Direct grid edits (add/remove/rename table or column) apply immediately — those are literal
 * spreadsheet edits, not model interpretations, so they don't need HCXAI confirmation.
 * Only parseSchemaPrompt()-driven generation (free text or an uploaded document) produces
 * Decisions that go through the confirm/contest loop.
 */

import type { Decision } from '../domain/entities';
import type { ISchemaReasoningEngine, ITextToSpeech } from '../domain/ports';
import {
  applySchemaDiff,
  emptySchema,
  primaryKeyCandidates,
  schemaTableList,
  type ColumnType,
  type SchemaColumn,
  type SchemaModel,
  type SchemaTable,
} from '../domain/schema/entities';
import { loadDefaultSchema } from '../domain/schema/defaultSchema';
import { nextId } from './ids';
import { initialSchemaSessionState, type SchemaSessionState } from './schemaTypes';

type Listener = () => void;

export class SchemaSessionService {
  private state: SchemaSessionState;
  private listeners = new Set<Listener>();
  private readonly reasoningEngine: ISchemaReasoningEngine;
  private readonly tts: ITextToSpeech;

  constructor(reasoningEngine: ISchemaReasoningEngine, tts: ITextToSpeech) {
    this.reasoningEngine = reasoningEngine;
    this.tts = tts;
    this.state = initialSchemaSessionState();
  }

  getState = (): SchemaSessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<SchemaSessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private log(role: 'user' | 'system', text: string) {
    this.setState({ log: [...this.state.log, { id: nextId('slog'), role, text }] });
  }

  // ---------------------------------------------------------------------
  // AI-driven generation (decision-confirmation loop, same shape as diagrams)
  // ---------------------------------------------------------------------

  async generateFromPrompt(prompt: string): Promise<void> {
    this.log('user', prompt);
    this.setState({ error: null });
    try {
      const { decisions, draftSchema } = await this.reasoningEngine.parseSchemaPrompt(prompt, this.state.schema);
      this.log(
        'system',
        `I parsed this into ${schemaTableList(draftSchema).length} table(s) and made ${decisions.length} interpretive decision(s).`
      );
      const next: SchemaSessionState = {
        ...this.state,
        mode: decisions.length > 0 ? 'confirming' : 'ready',
        schema: draftSchema,
        pendingDecisions: decisions,
        activeDecisionIndex: 0,
      };
      this.setState(next);
      if (decisions.length > 0) this.speakActive(next);
      else this.tts.speak('Schema ready.');
    } catch (err) {
      this.setState({ error: (err as Error).message });
    }
  }

  private speakActive(state: SchemaSessionState) {
    const d = state.pendingDecisions[state.activeDecisionIndex];
    if (d) this.tts.speak(`${d.description} Alternatives: ${d.options.map((o, i) => `${i + 1}: ${o}`).join('. ')}`);
  }

  confirmActiveDecision(): void {
    this.resolveActiveDecision('confirmed');
  }

  contestActiveDecision(chosenOptionIndex: number): void {
    this.resolveActiveDecision('contested', chosenOptionIndex);
  }

  private async resolveActiveDecision(status: 'confirmed' | 'contested', chosenOptionIndex?: number) {
    const { pendingDecisions, activeDecisionIndex } = this.state;
    const decision = pendingDecisions[activeDecisionIndex];
    if (!decision) return;

    let schema = this.state.schema;
    if (status === 'contested' && chosenOptionIndex !== undefined && chosenOptionIndex !== decision.assumedOptionIndex) {
      const diff = await this.reasoningEngine.reviseSchemaDecision(decision, chosenOptionIndex, schema);
      schema = applySchemaDiff(schema, diff);
      this.log('system', `Updated: ${decision.description} -> "${decision.options[chosenOptionIndex]}".`);
    } else {
      this.log('user', `Confirmed: ${decision.options[decision.assumedOptionIndex]}`);
    }

    const updatedDecisions = pendingDecisions.map((d, i) => (i === activeDecisionIndex ? { ...d, status, chosenOptionIndex } : d));
    const nextIndex = activeDecisionIndex + 1;
    const next: SchemaSessionState = { ...this.state, schema, pendingDecisions: updatedDecisions, activeDecisionIndex: nextIndex };
    this.setState(next);

    if (nextIndex >= updatedDecisions.length) {
      this.setState({ mode: 'ready' });
      this.tts.speak('All schema decisions confirmed.');
      this.log('system', 'All schema decisions locked.');
    } else {
      this.speakActive(next);
    }
  }

  // ---------------------------------------------------------------------
  // Direct grid editing (no confirmation needed — literal spreadsheet edits)
  // ---------------------------------------------------------------------

  loadDefaultSchema(): void {
    this.setState({ schema: loadDefaultSchema(), mode: 'ready', pendingDecisions: [], activeDecisionIndex: 0, error: null });
    this.log('system', 'Loaded the default retail/warehouse sample schema.');
  }

  clearSchema(): void {
    this.setState({ schema: emptySchema(), mode: 'idle', pendingDecisions: [], activeDecisionIndex: 0, error: null, log: [] });
  }

  addTable(): SchemaTable {
    const table: SchemaTable = {
      id: nextId('t'),
      name: `NEW_TABLE_${schemaTableList(this.state.schema).length + 1}`,
      columns: [{ id: nextId('col'), name: 'id', type: 'int', isPrimaryKey: true, references: null }],
    };
    const schema = applySchemaDiff(this.state.schema, { addTables: [table] });
    this.setState({ schema, mode: 'ready' });
    return table;
  }

  removeTable(tableId: string): void {
    // Clear any FK columns elsewhere that pointed at this table (structural dependency,
    // same "an edge cannot outlive its endpoints" principle as the diagram's dependencyEngine).
    const tables = schemaTableList(this.state.schema).map((t) => ({
      ...t,
      columns: t.columns.map((c) => (c.references?.tableId === tableId ? { ...c, references: null } : c)),
    }));
    let schema = applySchemaDiff(this.state.schema, { removeTableIds: [tableId] });
    schema = applySchemaDiff(schema, { replaceColumns: tables.filter((t) => t.id !== tableId).map((t) => ({ tableId: t.id, columns: t.columns })) });
    this.setState({ schema });
  }

  renameTable(tableId: string, name: string): void {
    const schema = applySchemaDiff(this.state.schema, { updateTables: [{ id: tableId, name }] });
    this.setState({ schema });
  }

  addColumn(tableId: string): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    const column: SchemaColumn = { id: nextId('col'), name: 'new_column', type: 'string', isPrimaryKey: false, references: null };
    const schema = applySchemaDiff(this.state.schema, { replaceColumns: [{ tableId, columns: [...table.columns, column] }] });
    this.setState({ schema });
  }

  removeColumn(tableId: string, columnId: string): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    const schema = applySchemaDiff(this.state.schema, {
      replaceColumns: [{ tableId, columns: table.columns.filter((c) => c.id !== columnId) }],
    });
    this.setState({ schema });
  }

  updateColumn(tableId: string, columnId: string, patch: Partial<Pick<SchemaColumn, 'name' | 'type' | 'isPrimaryKey'>>): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    const columns = table.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c));
    const schema = applySchemaDiff(this.state.schema, { replaceColumns: [{ tableId, columns }] });
    this.setState({ schema });
  }

  setColumnType(tableId: string, columnId: string, type: ColumnType): void {
    this.updateColumn(tableId, columnId, { type });
  }

  /**
   * The "press Enter to cycle candidates, Tab to move on" relation-picker: each Enter press
   * on a foreign-key cell advances `references` to the next primary-key candidate in the
   * schema (excluding the column's own table), wrapping back to null (unset) after the last.
   */
  cycleColumnReference(tableId: string, columnId: string): void {
    const table = this.state.schema.tables[tableId];
    const column = table?.columns.find((c) => c.id === columnId);
    if (!table || !column) return;

    const candidates = primaryKeyCandidates(this.state.schema).filter((c) => c.tableId !== tableId);
    if (candidates.length === 0) return;

    const currentIndex = column.references
      ? candidates.findIndex((c) => c.tableId === column.references!.tableId && c.column.id === column.references!.columnId)
      : -1;
    const nextIndex = currentIndex + 1;
    const nextRef = nextIndex < candidates.length ? { tableId: candidates[nextIndex].tableId, columnId: candidates[nextIndex].column.id } : null;

    const columns = table.columns.map((c) => (c.id === columnId ? { ...c, references: nextRef } : c));
    const schema = applySchemaDiff(this.state.schema, { replaceColumns: [{ tableId, columns }] });
    this.setState({ schema, focusedFkCell: { tableId, columnId } });
  }

  exportSchema(): SchemaModel {
    return this.state.schema;
  }
}

export type { Decision };
