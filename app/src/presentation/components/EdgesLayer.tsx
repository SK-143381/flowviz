import type { DiagramGraph } from '../../domain/entities';

interface Props {
  graph: DiagramGraph;
  visible: boolean;
  selectedElementId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The edges layer: topology + protocol only, no text (protocol/label text lives in the
 * labels layer). Rendered as its own <g> so re-routing one edge never touches node shapes
 * or any text element.
 */
export function EdgesLayer({ graph, visible, selectedElementId, onSelect }: Props) {
  return (
    <g role="img" aria-label="Diagram edges layer" style={{ display: visible ? 'inline' : 'none' }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink)" />
        </marker>
      </defs>
      {Object.values(graph.edges).map((edge) => {
        const source = graph.nodes[edge.sourceId];
        const target = graph.nodes[edge.targetId];
        if (!source || !target) return null;
        const x1 = source.x + source.width;
        const y1 = source.y + source.height / 2;
        const x2 = target.x;
        const y2 = target.y + target.height / 2;
        const isSelected = edge.id === selectedElementId;
        return (
          <line
            key={edge.id}
            data-element-id={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--ink)"
            strokeOpacity={isSelected ? 1 : 0.45}
            strokeWidth={isSelected ? 3 : 1.5}
            markerEnd="url(#arrow)"
            markerStart={edge.directionality === 'bi' ? 'url(#arrow)' : undefined}
            tabIndex={0}
            role="button"
            aria-label={`${edge.protocol} edge, ${edge.directionality === 'bi' ? 'bidirectional' : 'one directional'}`}
            onClick={() => onSelect(edge.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(edge.id);
            }}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </g>
  );
}
