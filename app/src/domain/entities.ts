/**
 * Domain entities. Pure data, no I/O, no framework imports.
 *
 * Layering rule (this is the accessibility contract, not a rendering detail):
 * - NodeEntity carries geometry/type only. It never carries display text.
 * - EdgeEntity carries topology (source/target/protocol) only. It never carries display text.
 * - LabelEntity is the ONLY place text lives, and it references an element by id.
 * This is what makes "edit the label without touching the node" or "move a node without
 * touching its text" true by construction instead of by convention.
 */

export type NodeType =
  | 'client'
  | 'server'
  | 'database'
  | 'load_balancer'
  | 'cache'
  | 'queue'
  | 'api_gateway'
  | 'external_service';

export type ProtocolType = 'HTTP' | 'gRPC' | 'SQL' | 'pub/sub';

export type Directionality = 'uni' | 'bi';

export interface NodeEntity {
  id: string;
  type: NodeType;
  groupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeEntity {
  id: string;
  sourceId: string;
  targetId: string;
  protocol: ProtocolType;
  directionality: Directionality;
}

export interface LabelEntity {
  id: string;
  /** id of the NodeEntity or EdgeEntity this text describes */
  elementId: string;
  elementKind: 'node' | 'edge';
  text: string;
  /** offset only used for rendering; layout engine may reposition this independently */
  dx: number;
  dy: number;
}

export interface GroupEntity {
  id: string;
  label: string;
  memberNodeIds: string[];
}

export interface DiagramGraph {
  nodes: Record<string, NodeEntity>;
  edges: Record<string, EdgeEntity>;
  labels: Record<string, LabelEntity>;
  groups: Record<string, GroupEntity>;
}

export function emptyGraph(): DiagramGraph {
  return { nodes: {}, edges: {}, labels: {}, groups: {} };
}

/** A single latent interpretive decision, surfaced for HCXAI confirmation. Mirrors write-up 4.1. */
export type DecisionCategory =
  | 'component_type'
  | 'cardinality'
  | 'edge_directionality'
  | 'protocol'
  | 'grouping'
  | 'layout_hierarchy';

export type DecisionStatus = 'pending' | 'confirmed' | 'contested';

export interface Decision {
  id: string;
  category: DecisionCategory;
  promptSpan: string;
  description: string;
  options: string[];
  /** index into options that the reasoning engine assumed by default */
  assumedOptionIndex: number;
  affects: string[]; // element ids (node/edge/label)
  status: DecisionStatus;
  chosenOptionIndex?: number;
}

/** A graph-diff, the atomic unit applied after a confirmation round. */
export interface GraphDiff {
  addNodes?: NodeEntity[];
  removeNodeIds?: string[];
  updateNodes?: Array<Partial<NodeEntity> & { id: string }>;
  addEdges?: EdgeEntity[];
  removeEdgeIds?: string[];
  updateEdges?: Array<Partial<EdgeEntity> & { id: string }>;
  addLabels?: LabelEntity[];
  removeLabelIds?: string[];
  updateLabels?: Array<Partial<LabelEntity> & { id: string }>;
}

/** An audit record of a propagated effect, mirrors write-up 4.1's dependency schema. */
export interface DependencyRecord {
  id: string;
  trigger: string; // e.g. "node_deleted:n_cache"
  effect: string; // human-readable, read aloud to the user before it is applied
}

export function applyGraphDiff(graph: DiagramGraph, diff: GraphDiff): DiagramGraph {
  const next: DiagramGraph = {
    nodes: { ...graph.nodes },
    edges: { ...graph.edges },
    labels: { ...graph.labels },
    groups: { ...graph.groups },
  };

  for (const id of diff.removeNodeIds ?? []) delete next.nodes[id];
  for (const id of diff.removeEdgeIds ?? []) delete next.edges[id];
  for (const id of diff.removeLabelIds ?? []) delete next.labels[id];

  for (const n of diff.addNodes ?? []) next.nodes[n.id] = n;
  for (const e of diff.addEdges ?? []) next.edges[e.id] = e;
  for (const l of diff.addLabels ?? []) next.labels[l.id] = l;

  for (const u of diff.updateNodes ?? []) {
    if (next.nodes[u.id]) next.nodes[u.id] = { ...next.nodes[u.id], ...u };
  }
  for (const u of diff.updateEdges ?? []) {
    if (next.edges[u.id]) next.edges[u.id] = { ...next.edges[u.id], ...u };
  }
  for (const u of diff.updateLabels ?? []) {
    if (next.labels[u.id]) next.labels[u.id] = { ...next.labels[u.id], ...u };
  }

  return next;
}
