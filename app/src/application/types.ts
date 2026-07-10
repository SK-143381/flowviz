import type { DependencyRecord, DiagramGraph, GraphDiff } from '../domain/entities';

export type SessionMode =
  | 'idle'
  | 'confirming_generation'
  | 'confirming_edit'
  | 'ready';

export interface LogEntry {
  id: string;
  role: 'user' | 'system';
  text: string;
}

export interface SessionState {
  mode: SessionMode;
  graph: DiagramGraph;
  /** decisions awaiting confirmation, presented one at a time (HCXAI: one cluster at a time) */
  pendingDecisions: import('../domain/entities').Decision[];
  activeDecisionIndex: number;
  /** the diff a confirmed decision-round will apply once all decisions are resolved */
  stagedDiff: GraphDiff | null;
  stagedRecords: DependencyRecord[];
  log: LogEntry[];
  layerVisibility: { nodes: boolean; edges: boolean; labels: boolean };
  selectedElementId: string | null;
  error: string | null;
}

export function initialSessionState(graph: DiagramGraph): SessionState {
  return {
    mode: 'idle',
    graph,
    pendingDecisions: [],
    activeDecisionIndex: 0,
    stagedDiff: null,
    stagedRecords: [],
    log: [],
    layerVisibility: { nodes: true, edges: true, labels: true },
    selectedElementId: null,
    error: null,
  };
}
