import type { DiagramGraph, NodeType } from '../../domain/entities';

const NODE_STYLE: Record<NodeType, { fill: string; rx: number }> = {
  client: { fill: '#3b82f6', rx: 28 },
  server: { fill: '#6366f1', rx: 10 },
  database: { fill: '#059669', rx: 4 },
  load_balancer: { fill: '#d97706', rx: 10 },
  cache: { fill: '#dc2626', rx: 999 },
  queue: { fill: '#7c3aed', rx: 10 },
  api_gateway: { fill: '#0891b2', rx: 10 },
  external_service: { fill: '#64748b', rx: 10 },
};

interface Props {
  graph: DiagramGraph;
  visible: boolean;
  selectedElementId: string | null;
  onSelect: (id: string) => void;
}

/**
 * The nodes layer: geometry + type only, no text (see domain/entities.ts). Editing a node's
 * shape or position touches only this <g> group; the labels layer is untouched.
 */
export function NodesLayer({ graph, visible, selectedElementId, onSelect }: Props) {
  return (
    <g role="img" aria-label="Diagram nodes layer" style={{ display: visible ? 'inline' : 'none' }}>
      {Object.values(graph.nodes).map((node) => {
        const style = NODE_STYLE[node.type];
        const isSelected = node.id === selectedElementId;
        return (
          <rect
            key={node.id}
            data-element-id={node.id}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={Math.min(style.rx, node.height / 2)}
            fill={style.fill}
            stroke={isSelected ? '#f8fafc' : 'rgba(255,255,255,0.25)'}
            strokeWidth={isSelected ? 3 : 1}
            tabIndex={0}
            role="button"
            aria-label={`${node.type.replace('_', ' ')} node`}
            onClick={() => onSelect(node.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(node.id);
            }}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </g>
  );
}
