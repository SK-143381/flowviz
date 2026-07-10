/**
 * Deterministic layered layout via elkjs (write-up Section 4: "elkjs if the frontend is
 * React/JS-native, to avoid a server round-trip on every edit"). Runs fully client-side,
 * no worker file needed (the bundled build runs synchronously in the main thread).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import ELK from 'elkjs/lib/elk.bundled.js';
import type { DiagramGraph } from '../../domain/entities';
import type { ILayoutEngine, LayoutResult, NodePosition } from '../../domain/ports';

const elk = new ELK();

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '48',
};

export class ElkLayoutEngine implements ILayoutEngine {
  async layout(graph: DiagramGraph): Promise<LayoutResult> {
    return this.run(graph, Object.keys(graph.nodes));
  }

  async relayoutSubgraph(graph: DiagramGraph, affectedNodeIds: string[]): Promise<LayoutResult> {
    if (affectedNodeIds.length === 0) return { positions: [] };
    return this.run(graph, affectedNodeIds, /* fixOthers */ true);
  }

  private async run(graph: DiagramGraph, movableIds: string[], fixOthers = false): Promise<LayoutResult> {
    const movable = new Set(movableIds);
    const elkGraph = {
      id: 'root',
      layoutOptions: LAYOUT_OPTIONS,
      children: Object.values(graph.nodes).map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
        // Nodes outside the movable set keep their current position fixed.
        ...(fixOthers && !movable.has(n.id) ? { x: n.x, y: n.y, layoutOptions: { 'elk.position': `(${n.x},${n.y})` } } : {}),
      })),
      edges: Object.values(graph.edges)
        .filter((e) => graph.nodes[e.sourceId] && graph.nodes[e.targetId])
        .map((e) => ({ id: e.id, sources: [e.sourceId], targets: [e.targetId] })),
    };

    const result = await elk.layout(elkGraph as never);
    const positions: NodePosition[] = (result.children ?? [])
      .filter((c: { id: string }) => movable.has(c.id) || !fixOthers)
      .map((c: { id: string; x?: number; y?: number; width?: number; height?: number }) => ({
        id: c.id,
        x: c.x ?? 0,
        y: c.y ?? 0,
        width: c.width ?? 160,
        height: c.height ?? 56,
      }));
    return { positions };
  }
}
