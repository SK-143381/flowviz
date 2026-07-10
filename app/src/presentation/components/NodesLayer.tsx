import type { DiagramGraph } from '../../domain/entities';
import { NODE_STYLE } from './nodeStyle';

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
            fill="var(--ink)"
            fillOpacity={style.fillOpacity}
            stroke="var(--ink)"
            strokeDasharray={style.dasharray}
            strokeWidth={isSelected ? 3 : 1.5}
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
