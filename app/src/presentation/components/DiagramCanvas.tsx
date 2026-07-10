import type { DiagramGraph } from '../../domain/entities';
import { EdgesLayer } from './EdgesLayer';
import { NodesLayer } from './NodesLayer';
import { LabelsLayer } from './LabelsLayer';

interface Props {
  graph: DiagramGraph;
  layerVisibility: { nodes: boolean; edges: boolean; labels: boolean };
  selectedElementId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The canvas: one <svg>, three independent <g> layers stacked in paint order
 * (edges under nodes under labels). This is the concrete instantiation of the
 * "dependency-aware, semantically-labeled layers" mechanism from the write-up —
 * each layer is addressable, describable, and editable without touching the others.
 */
export function DiagramCanvas({ graph, layerVisibility, selectedElementId, onSelect }: Props) {
  const nodeCount = Object.keys(graph.nodes).length;
  const edgeCount = Object.keys(graph.edges).length;

  return (
    <svg
      role="group"
      aria-label={`System architecture diagram with ${nodeCount} components and ${edgeCount} connections`}
      width="100%"
      height="100%"
      viewBox="0 0 1000 600"
    >
      <EdgesLayer graph={graph} visible={layerVisibility.edges} selectedElementId={selectedElementId} onSelect={onSelect} />
      <NodesLayer graph={graph} visible={layerVisibility.nodes} selectedElementId={selectedElementId} onSelect={onSelect} />
      <LabelsLayer graph={graph} visible={layerVisibility.labels} />
    </svg>
  );
}
