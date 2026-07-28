/**
 * Ports (Dependency Inversion boundary). The application layer depends only on these
 * interfaces; concrete implementations live in src/infrastructure and are wired up at
 * the composition root (App.tsx). Swapping the mock reasoning engine for Claude/GPT/Gemini
 * means writing one new class here and changing one line in App.tsx — nothing else moves.
 */

import type { Decision, DiagramGraph, GraphDiff } from './entities';
import type { SchemaDiff, SchemaModel } from './schema/entities';

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
}

export interface ParseSchemaResult {
  decisions: Decision[];
  /** The schema as the engine currently believes it should be, pre-confirmation. */
  draftSchema: SchemaModel;
}

export interface ISchemaReasoningEngine {
  /**
   * Turns free text (a description, or the raw contents of an uploaded .txt/.md file — the
   * engine itself decides how to read it, e.g. detecting an embedded erDiagram block) into a
   * draft schema + the interpretive decisions it made (mirrors IReasoningEngine.parsePrompt).
   */
  parseSchemaPrompt(prompt: string, currentSchema: SchemaModel): Promise<ParseSchemaResult>;

  /** Re-resolves a single contested schema decision against the user's chosen alternative. */
  reviseSchemaDecision(decision: Decision, chosenOptionIndex: number, schema: SchemaModel): Promise<SchemaDiff>;
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
