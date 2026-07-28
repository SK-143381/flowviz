/**
 * Ports (Dependency Inversion boundary). The application layer depends only on these
 * interfaces; concrete implementations live in src/infrastructure and are wired up at
 * the composition root (App.tsx). Swapping the mock reasoning engine for Claude/GPT/Gemini
 * means writing one new class here and changing one line in App.tsx — nothing else moves.
 */

import type { Decision, DiagramGraph, GraphDiff } from './entities';
import type { SchemaDiff, SchemaModel } from './schema/entities';
import type { Correspondence } from './sync';

export interface ParsePromptResult {
  decisions: Decision[];
  /** The graph as the engine currently believes it should be, pre-layout, pre-confirmation. */
  draftGraph: DiagramGraph;
}

export interface ProposeEditResult {
  decisions: Decision[];
  /** The direct change plus everything the dependency engine determines it ripples into. */
  diff: GraphDiff;
}

/** The outcome of translating an edit from one domain (diagram/schema) into the other, for
 *  SyncCoordinator. `diff` is in the *target* domain's shape; the correspondence fields let
 *  the coordinator keep its node<->table map consistent with what the translation invented. */
export interface TranslatedEdit<D> {
  diff: D;
  addCorrespondence?: Array<{ nodeId: string; tableId: string }>;
  removedNodeIds?: string[];
  removedTableIds?: string[];
}

export interface IReasoningEngine {
  /** Turns a free-text diagram request into a draft graph + the interpretive decisions it made. */
  parsePrompt(prompt: string, currentGraph: DiagramGraph): Promise<ParsePromptResult>;

  /** Turns a free-text (or targeted) edit instruction into a diff + decisions to confirm. */
  proposeEdit(
    instruction: string,
    targetElementId: string | undefined,
    currentGraph: DiagramGraph
  ): Promise<ProposeEditResult>;

  /** Re-resolves a single contested decision against the user's chosen alternative. */
  reviseForDecision(decision: Decision, chosenOptionIndex: number, graph: DiagramGraph): Promise<GraphDiff>;

  /**
   * Dialogic post-generation description (HCXAI): summarizes what was built and ends with a
   * concrete follow-up question, so confirming the result is a chat reply rather than a
   * one-shot button. The user's reply is routed back through proposeEdit like any other edit.
   */
  describe(graph: DiagramGraph): Promise<string>;

  /** Translates a just-applied schema edit into an equivalent diagram change, for two-way
   *  sync when this diagram was generated from a schema (see SyncCoordinator). */
  translateSchemaEdit(diff: SchemaDiff, correspondence: Correspondence, currentGraph: DiagramGraph): Promise<TranslatedEdit<GraphDiff>>;
}

export interface ParseSchemaResult {
  decisions: Decision[];
  /** The schema as the engine currently believes it should be, pre-confirmation. */
  draftSchema: SchemaModel;
}

export interface ProposeSchemaEditResult {
  decisions: Decision[];
  diff: SchemaDiff;
}

export interface ISchemaReasoningEngine {
  /**
   * Turns free text (a description, or the raw contents of an uploaded .txt/.md file — the
   * engine itself decides how to read it, e.g. detecting an embedded erDiagram block) into a
   * draft schema + the interpretive decisions it made (mirrors IReasoningEngine.parsePrompt).
   */
  parseSchemaPrompt(prompt: string, currentSchema: SchemaModel): Promise<ParseSchemaResult>;

  /** Turns a free-text edit instruction into a schema diff + decisions to confirm (mirrors IReasoningEngine.proposeEdit). */
  proposeEdit(instruction: string, currentSchema: SchemaModel): Promise<ProposeSchemaEditResult>;

  /** Re-resolves a single contested schema decision against the user's chosen alternative. */
  reviseSchemaDecision(decision: Decision, chosenOptionIndex: number, schema: SchemaModel): Promise<SchemaDiff>;

  /** Dialogic post-generation description (mirrors IReasoningEngine.describe). */
  describeSchema(schema: SchemaModel): Promise<string>;

  /**
   * Translates a just-applied diagram edit into an equivalent schema change (mirrors
   * IReasoningEngine.translateSchemaEdit). `currentGraph` is the diagram *after* the edit —
   * needed because a label-rename diff only carries `{id, text}`, not which node it belongs
   * to; resolving that requires looking the label up in the graph.
   */
  translateDiagramEdit(
    diff: GraphDiff,
    correspondence: Correspondence,
    currentGraph: DiagramGraph,
    currentSchema: SchemaModel
  ): Promise<TranslatedEdit<SchemaDiff>>;
}

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: NodePosition[];
}

export interface ILayoutEngine {
  /** Full layout, used right after initial generation. */
  layout(graph: DiagramGraph): Promise<LayoutResult>;

  /**
   * Re-layout only the nodes in `affectedNodeIds` (plus edges touching them); every other
   * node keeps its existing (x, y). This is the "spatial stability" guarantee from write-up
   * Section 4.1 (metric 3).
   */
  relayoutSubgraph(graph: DiagramGraph, affectedNodeIds: string[]): Promise<LayoutResult>;
}

export interface ITextToSpeech {
  speak(text: string): void;
  cancel(): void;
}

export interface ISpeechToText {
  isSupported(): boolean;
  start(onResult: (text: string) => void, onEnd?: () => void): void;
  stop(): void;
}
