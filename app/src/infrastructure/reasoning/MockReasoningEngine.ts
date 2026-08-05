/**
 * A rule-based stand-in for a real LLM reasoning engine (Claude / GPT / Gemini — see
 * write-up Section 4 "Model and Tooling Choices"). It implements the exact same
 * IReasoningEngine port a real model-backed engine would, so swapping this out later is a
 * one-file, one-line change (see App.tsx). It exists so the decision-confirmation and
 * dependency-aware edit loops are demoable end-to-end without a network dependency or an
 * API key, per this session's request ("it's okay if [a live model] is not connected").
 */

import { nextId } from '../../domain/idGenerator';
import type { Decision, DiagramGraph, EdgeEntity, GraphDiff, LabelEntity, NodeEntity, NodeType, ProtocolType } from '../../domain/entities';
import { emptyGraph } from '../../domain/entities';
import type { IReasoningEngine, ParsePromptResult, ProposeEditResult, TranslatedEdit } from '../../domain/ports';
import type { Correspondence } from '../../domain/sync';
import type { SchemaDiff } from '../../domain/schema/entities';

const KEYWORD_TO_TYPE: Array<{ pattern: RegExp; type: NodeType; humanName: string }> = [
  { pattern: /load[\s-]?balancer|\blb\b/, type: 'load_balancer', humanName: 'Load Balancer' },
  { pattern: /api gateway|gateway/, type: 'api_gateway', humanName: 'API Gateway' },
  { pattern: /cache/, type: 'cache', humanName: 'Cache' },
  { pattern: /queue|pub\/sub|message broker/, type: 'queue', humanName: 'Queue' },
  { pattern: /database|\bdb\b/, type: 'database', humanName: 'Database' },
  { pattern: /external service|third[\s-]?party/, type: 'external_service', humanName: 'External Service' },
  { pattern: /web ?app|server|backend|api\b/, type: 'server', humanName: 'Server' },
  { pattern: /client|browser|frontend|user\b/, type: 'client', humanName: 'Client' },
];

function protocolFor(target: NodeType): ProtocolType {
  if (target === 'database') return 'SQL';
  if (target === 'queue') return 'pub/sub';
  return 'HTTP';
}

function findLabelForElement(graph: DiagramGraph, elementId: string): LabelEntity | undefined {
  return Object.values(graph.labels).find((l) => l.elementId === elementId);
}

function findNodeByText(graph: DiagramGraph, text: string): NodeEntity | undefined {
  const needle = text.trim().toLowerCase();
  for (const label of Object.values(graph.labels)) {
    if (label.elementKind === 'node' && label.text.toLowerCase().includes(needle)) {
      return graph.nodes[label.elementId];
    }
  }
  return undefined;
}

export class MockReasoningEngine implements IReasoningEngine {
  async parsePrompt(prompt: string): Promise<ParsePromptResult> {
    const lower = prompt.toLowerCase();
    const graph = emptyGraph();
    const decisions: Decision[] = [];

    // 1. Extract an ordered, deduplicated sequence of component mentions.
    const found: Array<{ type: NodeType; humanName: string; span: string }> = [];
    for (const entry of KEYWORD_TO_TYPE) {
      const match = lower.match(entry.pattern);
      if (match) found.push({ type: entry.type, humanName: entry.humanName, span: match[0] });
    }
    // Preserve order of first appearance in the prompt.
    found.sort((a, b) => lower.indexOf(a.span) - lower.indexOf(b.span));

    if (found.length === 0) {
      // Fallback: a bare client-server pair so the user always gets something to react to.
      found.push({ type: 'client', humanName: 'Client', span: 'client' }, { type: 'server', humanName: 'Server', span: 'server' });
    }

    const nodeIds: string[] = [];
    found.forEach((f, i) => {
      const nodeId = nextId('n');
      const node: NodeEntity = { id: nodeId, type: f.type, x: 0, y: 0, width: 160, height: 56 };
      graph.nodes[nodeId] = node;
      const labelId = nextId('lbl');
      graph.labels[labelId] = { id: labelId, elementId: nodeId, elementKind: 'node', text: f.humanName, dx: 0, dy: 0 };
      nodeIds.push(nodeId);

      // Component-type decision: was the assumed type actually what the user meant?
      const alternatives = Array.from(new Set(['server', 'api_gateway', 'client', 'cache', 'database', 'load_balancer', 'queue', 'external_service']));
      decisions.push({
        id: nextId('d'),
        category: 'component_type',
        promptSpan: f.span,
        description: `I read "${f.span}" as a ${f.humanName}.`,
        options: alternatives,
        assumedOptionIndex: Math.max(0, alternatives.indexOf(f.type)),
        affects: [nodeId],
        status: 'pending',
      });
      void i;
    });

    // 2. Chain edges between consecutive nodes; flag directionality + protocol as decisions.
    const cacheInFront = /cache.*in front of|in front of.*database/.test(lower);
    for (let i = 0; i < nodeIds.length - 1; i += 1) {
      const sourceId = nodeIds[i];
      const targetId = nodeIds[i + 1];
      const targetType = graph.nodes[targetId].type;
      const edgeId = nextId('e');
      const protocol = protocolFor(targetType);
      const edge: EdgeEntity = { id: edgeId, sourceId, targetId, protocol, directionality: 'uni' };
      graph.edges[edgeId] = edge;

      if (cacheInFront && graph.nodes[sourceId].type === 'cache') {
        decisions.push({
          id: nextId('d'),
          category: 'edge_directionality',
          promptSpan: 'in front of',
          description:
            'I read this as one-directional: the caller talks to the cache, and the cache talks to the database only on a miss.',
          options: ['one-directional (assumed)', 'bidirectional', 'cache is read-through only'],
          assumedOptionIndex: 0,
          affects: [edgeId],
          status: 'pending',
        });
      }

      decisions.push({
        id: nextId('d'),
        category: 'protocol',
        promptSpan: `${graph.nodes[sourceId].type} -> ${targetType}`,
        description: `I assumed the connection to the ${targetType.replace('_', ' ')} uses ${protocol}.`,
        options: ['HTTP', 'gRPC', 'SQL', 'pub/sub'],
        assumedOptionIndex: ['HTTP', 'gRPC', 'SQL', 'pub/sub'].indexOf(protocol),
        affects: [edgeId],
        status: 'pending',
      });
    }

    return { decisions, draftGraph: graph };
  }

  async proposeEdit(instruction: string, targetElementId: string | undefined, graph: DiagramGraph): Promise<ProposeEditResult> {
    const lower = instruction.toLowerCase().trim();

    // "delete/remove <name>"
    const deleteMatch = lower.match(/^(delete|remove)\s+(.+)$/);
    if (deleteMatch) {
      const node = targetElementId ? graph.nodes[targetElementId] : findNodeByText(graph, deleteMatch[2]);
      if (node) {
        return { decisions: [], diff: { removeNodeIds: [node.id] } };
      }
    }

    // "rename <name> to <newname>" or, with a targeted element, "rename to <newname>"
    const renameMatch = lower.match(/^rename(?:\s+(.+?))?\s+to\s+(.+)$/);
    if (renameMatch) {
      const [, oldName, newName] = renameMatch;
      const node = targetElementId ? graph.nodes[targetElementId] : oldName ? findNodeByText(graph, oldName) : undefined;
      if (node) {
        const label = findLabelForElement(graph, node.id);
        if (label) {
          return {
            decisions: [],
            diff: { updateLabels: [{ id: label.id, text: titleCase(newName) }] },
          };
        }
      }
    }

    // "add <type> called <name>"
    const addMatch = lower.match(/^add\s+(\w[\w\s]*?)\s+called\s+(.+)$/);
    if (addMatch) {
      const [, typeText, name] = addMatch;
      const typeEntry = KEYWORD_TO_TYPE.find((e) => e.pattern.test(typeText));
      const nodeId = nextId('n');
      const labelId = nextId('lbl');
      const node: NodeEntity = { id: nodeId, type: typeEntry?.type ?? 'server', x: 0, y: 0, width: 160, height: 56 };
      const label: LabelEntity = { id: labelId, elementId: nodeId, elementKind: 'node', text: titleCase(name), dx: 0, dy: 0 };
      return { decisions: [], diff: { addNodes: [node], addLabels: [label] } };
    }

    // Nothing matched: surface a decision asking the user to disambiguate rather than
    // silently doing nothing (this is the HCXAI point applied to failure, not just success).
    const decision: Decision = {
      id: nextId('d'),
      category: 'grouping',
      promptSpan: instruction,
      description: `I couldn't confidently map "${instruction}" to a graph change. Did you want to delete, rename, or add an element?`,
      options: ['delete', 'rename', 'add'],
      assumedOptionIndex: 0,
      affects: targetElementId ? [targetElementId] : [],
      status: 'pending',
    };
    return { decisions: [decision], diff: {} };
  }

  async reviseForDecision(decision: Decision, chosenOptionIndex: number, graph: DiagramGraph): Promise<GraphDiff> {
    const chosen = decision.options[chosenOptionIndex];
    switch (decision.category) {
      case 'component_type': {
        const nodeId = decision.affects[0];
        if (!graph.nodes[nodeId]) return {};
        return { updateNodes: [{ id: nodeId, type: chosen as NodeType }] };
      }
      case 'protocol': {
        const edgeId = decision.affects[0];
        if (!graph.edges[edgeId]) return {};
        return { updateEdges: [{ id: edgeId, protocol: chosen as ProtocolType }] };
      }
      case 'edge_directionality': {
        const edgeId = decision.affects[0];
        if (!graph.edges[edgeId]) return {};
        return { updateEdges: [{ id: edgeId, directionality: chosen.startsWith('bidirectional') ? 'bi' : 'uni' }] };
      }
      default:
        return {};
    }
  }

  async describe(graph: DiagramGraph): Promise<string> {
    const nodeCount = Object.keys(graph.nodes).length;
    const edgeCount = Object.keys(graph.edges).length;
    if (nodeCount === 0) return 'The diagram is empty. What would you like to build?';
    const byType = new Map<string, number>();
    for (const n of Object.values(graph.nodes)) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
    const summary = Array.from(byType.entries()).map(([type, count]) => `${count} ${type.replace('_', ' ')}`).join(', ');
    return `I built ${nodeCount} component${nodeCount === 1 ? '' : 's'} (${summary}) connected by ${edgeCount} link${edgeCount === 1 ? '' : 's'}. Does this match what you had in mind, or is there anything you'd like changed?`;
  }

  async translateSchemaEdit(diff: SchemaDiff, correspondence: Correspondence, graph: DiagramGraph): Promise<TranslatedEdit<GraphDiff>> {
    const addNodes: NodeEntity[] = [];
    const addLabels: LabelEntity[] = [];
    const addCorrespondence: Array<{ nodeId: string; tableId: string }> = [];
    for (const table of diff.addTables ?? []) {
      const nodeId = nextId('n');
      addNodes.push({ id: nodeId, type: 'database', x: 0, y: 0, width: 160, height: 56 });
      const labelId = nextId('lbl');
      addLabels.push({ id: labelId, elementId: nodeId, elementKind: 'node', text: table.name, dx: 0, dy: 0 });
      addCorrespondence.push({ nodeId, tableId: table.id });
    }

    const removeNodeIds: string[] = [];
    const removedTableIds: string[] = [];
    for (const tableId of diff.removeTableIds ?? []) {
      const nodeId = correspondence.tableToNode[tableId];
      if (nodeId) {
        removeNodeIds.push(nodeId);
        removedTableIds.push(tableId);
      }
    }

    const updateLabels: Array<Partial<LabelEntity> & { id: string }> = [];
    for (const update of diff.updateTables ?? []) {
      if (!update.name) continue;
      const nodeId = correspondence.tableToNode[update.id];
      if (!nodeId) continue;
      const label = Object.values(graph.labels).find((l) => l.elementId === nodeId && l.elementKind === 'node');
      if (label) updateLabels.push({ id: label.id, text: update.name });
    }

    const result: GraphDiff = {
      ...(addNodes.length ? { addNodes } : {}),
      ...(addLabels.length ? { addLabels } : {}),
      ...(removeNodeIds.length ? { removeNodeIds } : {}),
      ...(updateLabels.length ? { updateLabels } : {}),
    };

    return { diff: result, addCorrespondence, removedNodeIds: removeNodeIds, removedTableIds };
  }
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
