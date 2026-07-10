import type { DiagramGraph } from '../../domain/entities';
import { nodeLabelColor } from './nodeStyle';

interface Props {
  graph: DiagramGraph;
  visible: boolean;
}

/**
 * The labels/text layer: every piece of visible text (node names, edge protocols) lives
 * here and only here. Editing a label is a text-node-only DOM change; it cannot move a
 * shape or re-route an edge, because this <g> has no geometry beyond text placement.
 */
export function LabelsLayer({ graph, visible }: Props) {
  return (
    <g role="img" aria-label="Diagram text labels layer" style={{ display: visible ? 'inline' : 'none' }}>
      {Object.values(graph.labels).map((label) => {
        let x = 0;
        let y = 0;
        let fill = 'var(--text-secondary)';
        if (label.elementKind === 'node') {
          const node = graph.nodes[label.elementId];
          if (!node) return null;
          x = node.x + node.width / 2 + label.dx;
          y = node.y + node.height / 2 + label.dy;
          fill = nodeLabelColor(node.type);
        } else {
          const edge = graph.edges[label.elementId];
          const source = edge && graph.nodes[edge.sourceId];
          const target = edge && graph.nodes[edge.targetId];
          if (!edge || !source || !target) return null;
          x = (source.x + source.width + target.x) / 2 + label.dx;
          y = (source.y + source.height / 2 + target.y + target.height / 2) / 2 + label.dy - 8;
        }
        return (
          <text
            key={label.id}
            data-element-id={label.id}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={fill}
            fontWeight={label.elementKind === 'node' ? 600 : 500}
            fontSize={label.elementKind === 'node' ? 13 : 11}
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
            pointerEvents="none"
          >
            {label.text}
          </text>
        );
      })}
    </g>
  );
}
