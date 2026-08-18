/**
 * Pure conversion: SchemaModel -> a draft DiagramGraph + the interpretive Decisions the
 * conversion had to assume (feeding straight into the same HCXAI decision-confirmation loop
 * DiagramSessionService already runs for prompt-driven generation — see
 * DiagramSessionService.generateFromSchema). Every table becomes a node (assumed type:
 * "database"); every resolved foreign key becomes an edge (assumed protocol: "SQL").
 */

import type { Decision, DiagramGraph, EdgeEntity, LabelEntity, NodeEntity } from '../entities';
import { emptyGraph } from '../entities';
import { nextId } from '../idGenerator';
import { schemaTableList, type SchemaModel } from './entities';

/** `sg_` prefix keeps these visually distinguishable in dev tools from prompt-generated ids. */
function nextGraphId(prefix: string): string {
  return nextId(`sg_${prefix}`);
}

export interface SchemaToGraphResult {
  draftGraph: DiagramGraph;
  decisions: Decision[];
  /** tableId -> nodeId, for SyncCoordinator to link the two once this graph is generated. */
  correspondence: Array<{ tableId: string; nodeId: string }>;
}

const COMPONENT_TYPE_OPTIONS = ['database', 'server', 'api_gateway', 'external_service'] as const;
const PROTOCOL_OPTIONS = ['SQL', 'HTTP', 'gRPC', 'pub/sub'] as const;

export function schemaModelToDraftGraph(schema: SchemaModel): SchemaToGraphResult {
  const graph = emptyGraph();
  const decisions: Decision[] = [];
  const tables = schemaTableList(schema);
  if (tables.length === 0) return { draftGraph: graph, decisions, correspondence: [] };

  const tableToNodeId = new Map<string, string>();

  tables.forEach((table, index) => {
    const nodeId = nextGraphId('n');
    tableToNodeId.set(table.id, nodeId);
    const node: NodeEntity = { id: nodeId, type: 'database', x: 0, y: 0, width: 170, height: 56 };
    graph.nodes[nodeId] = node;

    const labelId = nextGraphId('lbl');
    const label: LabelEntity = { id: labelId, elementId: nodeId, elementKind: 'node', text: table.name, dx: 0, dy: 0 };
    graph.labels[labelId] = label;

    decisions.push({
      id: nextGraphId('d'),
      category: 'component_type',
      promptSpan: table.name,
      description: `I represented table "${table.name}" as a database component.`,
      options: [...COMPONENT_TYPE_OPTIONS],
      assumedOptionIndex: 0,
      affects: [nodeId],
      status: 'pending',
    });
    void index;
  });

  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.references) continue;
      const targetTable = schema.tables[column.references.tableId];
      if (!targetTable) continue;
      const sourceNodeId = tableToNodeId.get(table.id);
      const targetNodeId = tableToNodeId.get(targetTable.id);
      if (!sourceNodeId || !targetNodeId) continue;

      const edgeId = nextGraphId('e');
      const edge: EdgeEntity = { id: edgeId, sourceId: sourceNodeId, targetId: targetNodeId, protocol: 'SQL', directionality: 'uni' };
      graph.edges[edgeId] = edge;

      const labelId = nextGraphId('lbl');
      const label: LabelEntity = { id: labelId, elementId: edgeId, elementKind: 'edge', text: column.name, dx: 0, dy: 0 };
      graph.labels[labelId] = label;

      decisions.push({
        id: nextGraphId('d'),
        category: 'protocol',
        promptSpan: `${table.name}.${column.name} -> ${targetTable.name}`,
        description: `I assumed the foreign key "${column.name}" on "${table.name}" is queried over SQL.`,
        options: [...PROTOCOL_OPTIONS],
        assumedOptionIndex: 0,
        affects: [edgeId],
        status: 'pending',
      });
    }
  }

  const correspondence = Array.from(tableToNodeId.entries()).map(([tableId, nodeId]) => ({ tableId, nodeId }));
  return { draftGraph: graph, decisions, correspondence };
}
