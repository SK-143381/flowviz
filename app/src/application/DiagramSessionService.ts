/**
 * Application service — the two research mechanisms from the write-up, as code:
 *
 *   generateFromPrompt()   -> the decision-confirmation loop (write-up Section 3, top loop)
 *   requestEdit()          -> the dependency-aware edit loop (write-up Section 3, bottom loop)
 *
 * This class depends only on domain types and the ports (IReasoningEngine, ILayoutEngine,
 * ITextToSpeech). It knows nothing about React or SVG. It is a plain observable so any UI
 * (React today, something else tomorrow) can subscribe to it via useSyncExternalStore.
 */

import { applyGraphDiff, emptyGraph, type Decision, type DiagramGraph, type GraphDiff } from '../domain/entities';
import { expandDependencies } from '../domain/dependencyEngine';
import type { IReasoningEngine, ILayoutEngine, ITextToSpeech } from '../domain/ports';
import type { SchemaModel } from '../domain/schema/entities';
import { schemaModelToDraftGraph } from '../domain/schema/schemaToGraph';
import { describeGraph } from './describeGraph';
import { nextId } from './ids';
import { initialSessionState, type SessionState } from './types';

type Listener = () => void;
type EditAppliedListener = (diff: GraphDiff) => void;
type GeneratedFromSchemaListener = (correspondence: Array<{ tableId: string; nodeId: string }>) => void;

export class DiagramSessionService {
  private state: SessionState;
  private listeners = new Set<Listener>();
  private editListeners = new Set<EditAppliedListener>();
  private generatedFromSchemaListeners = new Set<GeneratedFromSchemaListener>();
  private readonly reasoningEngine: IReasoningEngine;
  private readonly layoutEngine: ILayoutEngine;
  private readonly tts: ITextToSpeech;

  constructor(reasoningEngine: IReasoningEngine, layoutEngine: ILayoutEngine, tts: ITextToSpeech) {
    this.reasoningEngine = reasoningEngine;
    this.layoutEngine = layoutEngine;
    this.tts = tts;
    this.state = initialSessionState(emptyGraph());
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Fires with the diff every time a diagram edit is actually applied — used by
   *  SyncCoordinator to translate the change into the linked schema, if any. */
  onEditApplied = (listener: EditAppliedListener): (() => void) => {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  };

  /** Fires once, right when generateFromSchema establishes the node<->table correspondence —
   *  SyncCoordinator uses this to link the two sessions. */
  onGeneratedFromSchema = (listener: GeneratedFromSchemaListener): (() => void) => {
    this.generatedFromSchemaListeners.add(listener);
    return () => this.generatedFromSchemaListeners.delete(listener);
  };

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private log(role: 'user' | 'system', text: string) {
    this.setState({ log: [...this.state.log, { id: nextId('log'), role, text }] });
  }

  private speakActiveItem(state: SessionState) {
    const d = state.pendingDecisions[state.activeDecisionIndex];
    if (d) {
      const optionText = d.options.map((o, i) => `${i + 1}: ${o}`).join('. ');
      this.tts.speak(`${d.description} Alternatives: ${optionText}`);
    }
  }

  // ---------------------------------------------------------------------
  // Mechanism 1: decision-confirmation loop (initial generation)
  // ---------------------------------------------------------------------

  async generateFromPrompt(prompt: string): Promise<void> {
    this.log('user', prompt);
    this.setState({ error: null, thinking: true });
    try {
      const { decisions, draftGraph } = await this.reasoningEngine.parsePrompt(prompt, this.state.graph);
      await this.beginGeneration(draftGraph, decisions);
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  /**
   * The schema-pane entry point into the same decision-confirmation loop: converts a
   * SchemaModel snapshot into a draft graph + decisions (domain/schema/schemaToGraph.ts,
   * pure, deterministic) and drives it through the identical confirm/contest/lock/layout
   * pipeline generateFromPrompt() uses. This is what makes "the database schema is
   * automatically converted into a system architecture diagram" true without a second,
   * parallel confirmation UI having to be built.
   */
  async generateFromSchema(schema: SchemaModel): Promise<void> {
    this.log('user', 'Generate architecture diagram from schema.');
    this.setState({ error: null, thinking: true });
    try {
      const { decisions, draftGraph, correspondence } = schemaModelToDraftGraph(schema);
      if (Object.keys(draftGraph.nodes).length === 0) {
        this.setState({ error: 'Add at least one table to the schema first.' });
        return;
      }
      for (const l of this.generatedFromSchemaListeners) l(correspondence);
      await this.beginGeneration(draftGraph, decisions);
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  private async beginGeneration(draftGraph: DiagramGraph, decisions: Decision[]): Promise<void> {
    this.log(
      'system',
      `I parsed this into ${Object.keys(draftGraph.nodes).length} components and made ` +
        `${decisions.length} interpretive decision(s). Let's confirm them one at a time.`
    );
    // Lay the draft out immediately, before any decision is confirmed — otherwise every node
    // sits stacked at its raw (0,0) parse position for the whole confirmation loop, rendering
    // as an illegible clump of overlapping labels on the canvas.
    let graph = draftGraph;
    try {
      const layout = await this.layoutEngine.layout(draftGraph);
      graph = applyLayout(draftGraph, layout.positions);
    } catch {
      // Layout is a visual nicety here, not load-bearing — fall back to the raw draft
      // positions rather than blocking the confirmation loop on a layout-engine failure.
    }
    const next: SessionState = {
      ...this.state,
      mode: 'confirming_generation',
      graph,
      pendingDecisions: decisions,
      activeDecisionIndex: 0,
      stagedDiff: null,
      stagedRecords: [],
    };
    this.setState(next);
    if (decisions.length === 0) {
      await this.finalizeGeneration();
    } else {
      this.speakActiveItem(next);
    }
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
      let graph = this.state.graph;
      if (status === 'contested' && chosenOptionIndex !== undefined && chosenOptionIndex !== decision.assumedOptionIndex) {
        const diff = await this.reasoningEngine.reviseForDecision(decision, chosenOptionIndex, graph);
        graph = applyGraphDiff(graph, diff);
        this.log('system', `Updated: ${decision.description} -> "${decision.options[chosenOptionIndex]}".`);
      } else {
        this.log('user', `Confirmed: ${decision.options[decision.assumedOptionIndex]}`);
      }

      const updatedDecisions = pendingDecisions.map((d, i) =>
        i === activeDecisionIndex ? { ...d, status, chosenOptionIndex } : d
      );
      const nextIndex = activeDecisionIndex + 1;
      const next: SessionState = {
        ...this.state,
        graph,
        pendingDecisions: updatedDecisions,
        activeDecisionIndex: nextIndex,
      };
      this.setState(next);

      if (nextIndex >= updatedDecisions.length) {
        if (this.state.mode === 'confirming_generation') await this.finalizeGeneration();
        else if (this.state.mode === 'confirming_edit') await this.presentPropagatedEffects();
      } else {
        this.speakActiveItem(next);
      }
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  private async finalizeGeneration(): Promise<void> {
    const layout = await this.layoutEngine.layout(this.state.graph);
    const graph = applyLayout(this.state.graph, layout.positions);
    this.setState({ graph, mode: 'ready' });
    this.log('system', 'All decisions locked. Diagram is ready.');
    await this.announceAndAsk(graph);
  }

  /** Dialogic post-generation description: summarizes the result and asks a follow-up, so
   *  confirming it is just the user's next chat message (routed through requestEdit). */
  private async announceAndAsk(graph: DiagramGraph): Promise<void> {
    try {
      const message = await this.reasoningEngine.describe(graph);
      this.log('system', message);
      this.tts.speak(message);
    } catch (err) {
      this.setState({ error: (err as Error).message });
    }
  }

  // ---------------------------------------------------------------------
  // Mechanism 2: dependency-aware edit loop
  // ---------------------------------------------------------------------

  async requestEdit(instruction: string, targetElementId?: string): Promise<void> {
    this.log('user', instruction);
    this.setState({ error: null, thinking: true });
    try {
      const { decisions, diff } = await this.reasoningEngine.proposeEdit(instruction, targetElementId, this.state.graph);
      const expanded = expandDependencies(this.state.graph, diff);

      const next: SessionState = {
        ...this.state,
        mode: 'confirming_edit',
        pendingDecisions: decisions,
        activeDecisionIndex: 0,
        stagedDiff: expanded.diff,
        stagedRecords: expanded.records,
      };
      this.setState(next);

      if (decisions.length === 0) {
        await this.presentPropagatedEffects();
      } else {
        this.speakActiveItem(next);
      }
    } catch (err) {
      this.setState({ error: (err as Error).message });
    } finally {
      this.setState({ thinking: false });
    }
  }

  private async presentPropagatedEffects(): Promise<void> {
    const { stagedRecords } = this.state;
    if (stagedRecords.length === 0) {
      await this.applyStagedEdit();
      return;
    }
    const summary = stagedRecords.map((r) => r.effect).join('. ');
    this.log('system', `This also affects: ${summary}`);
    this.tts.speak(`This edit also causes: ${summary}. Say apply to confirm, or cancel to discard.`);
  }

  async confirmPropagatedEffects(): Promise<void> {
    this.setState({ thinking: true });
    try {
      await this.applyStagedEdit();
    } finally {
      this.setState({ thinking: false });
    }
  }

  cancelEdit(): void {
    this.log('system', 'Edit discarded; no changes applied.');
    this.setState({ mode: 'ready', pendingDecisions: [], stagedDiff: null, stagedRecords: [], activeDecisionIndex: 0 });
  }

  private async applyStagedEdit(): Promise<void> {
    const { stagedDiff, graph } = this.state;
    if (!stagedDiff) {
      this.setState({ mode: 'ready' });
      return;
    }
    const expanded = expandDependencies(graph, stagedDiff);
    const updatedGraph = applyGraphDiff(graph, stagedDiff);
    const layout = await this.layoutEngine.relayoutSubgraph(updatedGraph, expanded.affectedNodeIds);
    const finalGraph = applyLayout(updatedGraph, layout.positions);

    this.setState({
      graph: finalGraph,
      mode: 'ready',
      pendingDecisions: [],
      stagedDiff: null,
      stagedRecords: [],
      activeDecisionIndex: 0,
    });
    this.log('system', 'Edit applied. Unrelated elements were not moved.');
    this.tts.speak('Edit applied.');
    for (const l of this.editListeners) l(stagedDiff);
  }

  /**
   * Applies a diff that SyncCoordinator already decided (translated from a linked schema
   * edit) without going through the decision-confirmation loop — the user already confirmed
   * the original edit on the schema side; this is its mechanical consequence here. Does NOT
   * emit onEditApplied, so this never re-triggers a translation back the other way.
   */
  async applySyncedDiff(diff: GraphDiff, summary: string): Promise<void> {
    const expanded = expandDependencies(this.state.graph, diff);
    const updatedGraph = applyGraphDiff(this.state.graph, expanded.diff);
    try {
      const layout = await this.layoutEngine.relayoutSubgraph(updatedGraph, expanded.affectedNodeIds);
      this.setState({ graph: applyLayout(updatedGraph, layout.positions) });
    } catch {
      this.setState({ graph: updatedGraph });
    }
    this.log('system', `Synced from schema: ${summary}`);
    this.tts.speak(`Synced from schema: ${summary}`);
  }

  // ---------------------------------------------------------------------
  // Misc UI-facing state
  // ---------------------------------------------------------------------

  selectElement(id: string | null): void {
    this.setState({ selectedElementId: id });
  }

  toggleLayer(layer: 'nodes' | 'edges' | 'labels'): void {
    this.setState({ layerVisibility: { ...this.state.layerVisibility, [layer]: !this.state.layerVisibility[layer] } });
  }

  exportGraph(): DiagramGraph {
    return this.state.graph;
  }

  /** GenAssist-style post-generation description, read aloud and logged (see describeGraph.ts). */
  describeCurrentDiagram(): void {
    const bullets = describeGraph(this.state.graph);
    this.log('system', bullets.join(' '));
    this.tts.speak(bullets.join(' '));
  }
}

function applyLayout(graph: DiagramGraph, positions: { id: string; x: number; y: number; width: number; height: number }[]): DiagramGraph {
  const diff: GraphDiff = {
    updateNodes: positions
      .filter((p) => graph.nodes[p.id])
      .map((p) => ({ id: p.id, x: p.x, y: p.y, width: p.width, height: p.height })),
  };
  return applyGraphDiff(graph, diff);
}

export type { Decision };
