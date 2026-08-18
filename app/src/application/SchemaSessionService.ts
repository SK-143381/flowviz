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
  type SchemaDiff,
  type SchemaModel,
  type SchemaTable,
} from '../domain/schema/entities';
import { loadDefaultSchema } from '../domain/schema/defaultSchema';
import { nextId } from './ids';
import { initialSchemaSessionState, type SchemaSessionState } from './schemaTypes';

type Listener = () => void;
type EditAppliedListener = (diff: SchemaDiff) => void;
type ResetListener = () => void;

export class SchemaSessionService {
  private state: SchemaSessionState;
  private listeners = new Set<Listener>();
  private editListeners = new Set<EditAppliedListener>();
  private resetListeners = new Set<ResetListener>();
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

  /** Fires with the diff every time a schema mutation (chat-driven or a direct grid edit) is
   *  actually applied — used by SyncCoordinator to translate the change into a linked diagram. */
  onEditApplied = (listener: EditAppliedListener): (() => void) => {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  };

  /** Fires on a full schema replacement (load default / clear) — these legitimately break any
   *  existing correspondence with a linked diagram rather than translating as a diff. */
  onReset = (listener: ResetListener): (() => void) => {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  };

  /** Applies a diff, updates state, and notifies edit listeners — the single choke point every
   *  structural mutation (AI-driven or direct grid edit) routes through. */
  private mutate(diff: SchemaDiff, extraPatch?: Partial<SchemaSessionState>): SchemaModel {
    const schema = applySchemaDiff(this.state.schema, diff);
    this.setState({ schema, ...extraPatch });
    for (const l of this.editListeners) l(diff);
    return schema;
  }

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
    this.setState({ error: null, thinking: true });
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
      else await this.announceAndAsk(draftSchema);
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  /** Dialogic post-generation description: summarizes the result and asks a follow-up, so
   *  confirming it is just the user's next chat message (routed through requestEdit). */
  private async announceAndAsk(schema: SchemaModel): Promise<void> {
    try {
      const message = await this.reasoningEngine.describeSchema(schema);
      this.log('system', message);
      this.tts.speak(message);
    } catch (err) {
      this.setState({ error: (err as Error).message });
    }
  }

  // ---------------------------------------------------------------------
  // AI-driven edit (same decision-confirmation shape; the diff applies immediately since
  // schema mutations are already synchronous — see the class docstring)
  // ---------------------------------------------------------------------

  async requestEdit(instruction: string): Promise<void> {
    this.log('user', instruction);
    this.setState({ error: null, thinking: true });
    try {
      const { decisions, diff } = await this.reasoningEngine.proposeEdit(instruction, this.state.schema);
      this.mutate(diff, {
        mode: decisions.length > 0 ? 'confirming' : 'ready',
        pendingDecisions: decisions,
        activeDecisionIndex: 0,
      });
      if (decisions.length > 0) {
        this.speakActive(this.state);
      } else {
        this.log('system', 'Edit applied.');
        this.tts.speak('Edit applied.');
      }
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
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

    this.setState({ thinking: true });
    try {
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
        this.log('system', 'All schema decisions locked.');
        await this.announceAndAsk(schema);
      } else {
        this.speakActive(next);
      }
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  // ---------------------------------------------------------------------
  // Direct grid editing (no confirmation needed — literal spreadsheet edits)
  // ---------------------------------------------------------------------

  loadDefaultSchema(): void {
    this.setState({ schema: loadDefaultSchema(), mode: 'ready', pendingDecisions: [], activeDecisionIndex: 0, error: null });
    this.log('system', 'Loaded the default retail/warehouse sample schema.');
    for (const l of this.resetListeners) l();
  }

  clearSchema(): void {
    this.setState({ schema: emptySchema(), mode: 'idle', pendingDecisions: [], activeDecisionIndex: 0, error: null, log: [] });
    for (const l of this.resetListeners) l();
  }

  addTable(): SchemaTable {
    const table: SchemaTable = {
      id: nextId('t'),
      name: `NEW_TABLE_${schemaTableList(this.state.schema).length + 1}`,
      columns: [{ id: nextId('col'), name: 'id', type: 'int', isPrimaryKey: true, references: null }],
    };
    this.mutate({ addTables: [table] }, { mode: 'ready' });
    return table;
  }

  removeTable(tableId: string): void {
    // Clear any FK columns elsewhere that pointed at this table (structural dependency,
    // same "an edge cannot outlive its endpoints" principle as the diagram's dependencyEngine).
    const tables = schemaTableList(this.state.schema).map((t) => ({
      ...t,
      columns: t.columns.map((c) => (c.references?.tableId === tableId ? { ...c, references: null } : c)),
    }));
    const replaceColumns = tables.filter((t) => t.id !== tableId).map((t) => ({ tableId: t.id, columns: t.columns }));
    this.mutate({ removeTableIds: [tableId], replaceColumns });
  }

  renameTable(tableId: string, name: string): void {
    this.mutate({ updateTables: [{ id: tableId, name }] });
  }

  addColumn(tableId: string): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    const column: SchemaColumn = { id: nextId('col'), name: 'new_column', type: 'string', isPrimaryKey: false, references: null };
    this.mutate({ replaceColumns: [{ tableId, columns: [...table.columns, column] }] });
  }

  removeColumn(tableId: string, columnId: string): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    this.mutate({ replaceColumns: [{ tableId, columns: table.columns.filter((c) => c.id !== columnId) }] });
  }

  updateColumn(tableId: string, columnId: string, patch: Partial<Pick<SchemaColumn, 'name' | 'type' | 'isPrimaryKey'>>): void {
    const table = this.state.schema.tables[tableId];
    if (!table) return;
    const columns = table.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c));
    this.mutate({ replaceColumns: [{ tableId, columns }] });
  }

  setColumnType(tableId: string, columnId: string, type: ColumnType): void {
    this.updateColumn(tableId, columnId, { type });
  }

  /**
   * The "press Enter to cycle candidates, Tab to move on" relation-picker: each Enter press
   * on a foreign-key cell advances `references` to the next primary-key candidate in the
   * schema (excluding the column's own table), wrapping back to null (unset) after the last.
   * Deliberately bypasses mutate()/onEditApplied: this fires on every keystroke while
   * browsing candidates, and a column-level FK change has no node-level diagram equivalent
   * to sync anyway (SyncCoordinator only reacts to table/column-list-shaped changes).
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

  /**
   * Applies a diff that SyncCoordinator already decided (translated from a linked diagram
   * edit) without going through the decision-confirmation loop — the user already confirmed
   * the original edit on the diagram side; this is its mechanical consequence here. Does NOT
   * call mutate()/emit onEditApplied, so this never re-triggers a translation back the other
   * way. Mirrors DiagramSessionService.applySyncedDiff.
   */
  async applySyncedDiff(diff: SchemaDiff, summary: string): Promise<void> {
    let combinedDiff = diff;
    if (diff.removeTableIds && diff.removeTableIds.length > 0) {
      const removedIds = new Set(diff.removeTableIds);
      const tables = schemaTableList(this.state.schema).map((t) => ({
        ...t,
        columns: t.columns.map((c) => (c.references && removedIds.has(c.references.tableId) ? { ...c, references: null } : c)),
      }));
      const replaceColumns = tables.filter((t) => !removedIds.has(t.id)).map((t) => ({ tableId: t.id, columns: t.columns }));
      combinedDiff = { ...diff, replaceColumns: [...(diff.replaceColumns ?? []), ...replaceColumns] };
    }
    const schema = applySchemaDiff(this.state.schema, combinedDiff);
    this.setState({ schema });
    this.log('system', `Synced from diagram: ${summary}`);
    this.tts.speak(`Synced from diagram: ${summary}`);
  }
}

export type { Decision };
