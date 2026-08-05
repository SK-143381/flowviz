/**
 * Live IReasoningEngine backed by Gemini (see docs — "Bring your own key"). Structurally
 * identical to MockReasoningEngine's public surface (same interface), so App.tsx can pick
 * between the two based purely on whether an API key is configured. The model is asked to
 * emit JSON matching our own domain shapes directly, so no separate DTO layer is needed —
 * the prompt IS the schema contract, enforced defensively by coerce* below since an LLM's
 * output is never 100% guaranteed to match even a very explicit instruction.
 */

import { nextId } from '../../domain/idGenerator';
import { emptyGraph, type Decision, type DecisionCategory, type DiagramGraph, type GraphDiff, type NodeType, type ProtocolType } from '../../domain/entities';
import type { IReasoningEngine, ParsePromptResult, ProposeEditResult, TranslatedEdit } from '../../domain/ports';
import type { Correspondence } from '../../domain/sync';
import type { SchemaDiff } from '../../domain/schema/entities';
import { callGeminiForJson, callGeminiForText } from './geminiClient';

const NODE_TYPES: NodeType[] = ['client', 'server', 'database', 'load_balancer', 'cache', 'queue', 'api_gateway', 'external_service'];
const PROTOCOLS: ProtocolType[] = ['HTTP', 'gRPC', 'SQL', 'pub/sub'];
const CATEGORIES: DecisionCategory[] = ['component_type', 'cardinality', 'edge_directionality', 'protocol', 'grouping', 'layout_hierarchy'];

const SCHEMA_CONTRACT = `
Respond with ONLY a JSON object, no prose, matching exactly:
{
  "nodes": [{ "id": string, "type": one of ${JSON.stringify(NODE_TYPES)}, "label": string }],
  "edges": [{ "id": string, "sourceId": string, "targetId": string, "protocol": one of ${JSON.stringify(PROTOCOLS)}, "directionality": "uni" | "bi" }],
  "decisions": [{
    "id": string,
    "category": one of ${JSON.stringify(CATEGORIES)},
    "promptSpan": string (the phrase in the user's text this decision came from),
    "description": string (plain language, first person: "I read this as..."),
    "options": string[] (2-4 alternatives, first one is what you assumed),
    "assumedOptionIndex": 0,
    "affects": string[] (node or edge ids this decision affects)
  }]
}
Every node id referenced by an edge or a decision must exist in "nodes". Keep the
architecture vocabulary limited to the node types and protocols listed above.
`;

function coerceGraph(raw: unknown): DiagramGraph {
  const graph = emptyGraph();
  const obj = raw as { nodes?: unknown[]; edges?: unknown[] };
  const idMap = new Map<string, string>();

  for (const n of obj.nodes ?? []) {
    const node = n as { id?: string; type?: string; label?: string };
    const id = node.id ? nextId('gn') : nextId('gn');
    idMap.set(String(node.id ?? id), id);
    const type = NODE_TYPES.includes(node.type as NodeType) ? (node.type as NodeType) : 'server';
    graph.nodes[id] = { id, type, x: 0, y: 0, width: 160, height: 56 };
    const labelId = nextId('glbl');
    graph.labels[labelId] = { id: labelId, elementId: id, elementKind: 'node', text: node.label ?? type, dx: 0, dy: 0 };
  }

  for (const e of obj.edges ?? []) {
    const edge = e as { id?: string; sourceId?: string; targetId?: string; protocol?: string; directionality?: string };
    const sourceId = idMap.get(String(edge.sourceId));
    const targetId = idMap.get(String(edge.targetId));
    if (!sourceId || !targetId) continue;
    const id = nextId('ge');
    const protocol = PROTOCOLS.includes(edge.protocol as ProtocolType) ? (edge.protocol as ProtocolType) : 'HTTP';
    graph.edges[id] = { id, sourceId, targetId, protocol, directionality: edge.directionality === 'bi' ? 'bi' : 'uni' };
  }

  return graph;
}

function coerceDecisions(raw: unknown, graph: DiagramGraph): Decision[] {
  const arr = (raw as { decisions?: unknown[] }).decisions ?? [];
  return arr.map((d) => {
    const decision = d as Partial<Decision>;
    const options = Array.isArray(decision.options) && decision.options.length > 0 ? decision.options : ['assumed', 'alternative'];
    const affects = (decision.affects ?? []).filter((id) => graph.nodes[id as string] || graph.edges[id as string]);
    return {
      id: nextId('gd'),
      category: CATEGORIES.includes(decision.category as DecisionCategory) ? (decision.category as DecisionCategory) : 'component_type',
      promptSpan: decision.promptSpan ?? '',
      description: decision.description ?? 'I made an assumption here.',
      options,
      assumedOptionIndex: 0,
      affects: affects.length > 0 ? affects : Object.keys(graph.nodes).slice(0, 1),
      status: 'pending' as const,
    };
  });
}

export class GeminiReasoningEngine implements IReasoningEngine {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async parsePrompt(prompt: string): Promise<ParsePromptResult> {
    const raw = await callGeminiForJson(
      this.apiKey,
      `You design system architecture diagrams for blind and low-vision users. Every latent
interpretive decision you make must be surfaced for confirmation, per Human-Centered
Explainable AI (HCXAI) principles — never silently assume something consequential.
${SCHEMA_CONTRACT}`,
      `Diagram request: "${prompt}"`
    );
    const draftGraph = coerceGraph(raw);
    const decisions = coerceDecisions(raw, draftGraph);
    return { decisions, draftGraph };
  }

  async proposeEdit(instruction: string, targetElementId: string | undefined, currentGraph: DiagramGraph): Promise<ProposeEditResult> {
    const raw = await callGeminiForJson(
      this.apiKey,
      `You edit an existing system architecture diagram graph. Respond with ONLY JSON:
{ "decisions": [...same shape as before, only if the instruction is ambiguous...],
  "addNodes": [...], "removeNodeIds": string[], "updateNodes": [...],
  "addEdges": [...], "removeEdgeIds": string[], "updateEdges": [...] }
Only include the diff fields that actually change. Existing element ids must be reused
exactly as given in the current graph.`,
      `Current graph: ${JSON.stringify(currentGraph)}\nEdit instruction: "${instruction}"\nTarget element (if any): ${targetElementId ?? 'none'}`
    );
    const obj = raw as GraphDiff & { decisions?: unknown[] };
    const decisions = coerceDecisions(raw, currentGraph);
    const { decisions: _omit, ...diff } = obj;
    void _omit;
    return { decisions, diff: diff as GraphDiff };
  }

  async reviseForDecision(decision: Decision, chosenOptionIndex: number, graph: DiagramGraph): Promise<GraphDiff> {
    const raw = await callGeminiForJson(
      this.apiKey,
      `The user contested one of your interpretive decisions and chose an alternative.
Respond with ONLY a GraphDiff JSON object applying that change:
{ "updateNodes": [...], "updateEdges": [...] } — only the fields that changed.`,
      `Decision: ${JSON.stringify(decision)}\nChosen option: "${decision.options[chosenOptionIndex]}"\nCurrent graph: ${JSON.stringify(graph)}`
    );
    return raw as GraphDiff;
  }

  async describe(graph: DiagramGraph): Promise<string> {
    return callGeminiForText(
      this.apiKey,
      `You describe a system architecture diagram to a blind or low-vision user in plain,
conversational language (Dialogic HCXAI — this is spoken and read as chat, not a report).
In 2-4 sentences: summarize what was built, then end with one concrete follow-up question
asking whether it matches what they had in mind, or what they'd like changed. Plain prose
only, no markdown, no bullet points.`,
      `Diagram: ${JSON.stringify(graph)}`
    );
  }

  async translateSchemaEdit(diff: SchemaDiff, correspondence: Correspondence, currentGraph: DiagramGraph): Promise<TranslatedEdit<GraphDiff>> {
    const deterministicRemoveNodeIds = (diff.removeTableIds ?? [])
      .map((tableId) => correspondence.tableToNode[tableId])
      .filter((id): id is string => Boolean(id));

    const raw = await callGeminiForJson(
      this.apiKey,
      `This diagram was generated from a database schema, and that schema just changed.
Translate the schema change into an equivalent change to the diagram so the two stay in
sync. Respond with ONLY JSON:
{ "diff": { "addNodes": [...], "removeNodeIds": [...], "updateNodes": [...],
            "addEdges": [...], "removeEdgeIds": [...], "updateEdges": [...],
            "addLabels": [...], "removeLabelIds": [...], "updateLabels": [...] },
  "addCorrespondence": [{ "nodeId": string, "tableId": string }] }
Represent every added table as a node of type "database" plus a label carrying the table's
name. For anything that already exists, reuse the exact node/edge/label id from the current
diagram — use the tableId->nodeId correspondence map to find it. "addCorrespondence" must
list a pairing for every node you add, using the same tableId the schema change introduced.
Only include diff fields that actually change.`,
      `Correspondence (tableId -> nodeId): ${JSON.stringify(correspondence.tableToNode)}\nCurrent diagram: ${JSON.stringify(currentGraph)}\nSchema change: ${JSON.stringify(diff)}`
    );
    const obj = raw as { diff?: GraphDiff; addCorrespondence?: Array<{ nodeId: string; tableId: string }> };
    const modelDiff = obj.diff ?? {};
    const removeNodeIds = Array.from(new Set([...(modelDiff.removeNodeIds ?? []), ...deterministicRemoveNodeIds]));

    return {
      diff: { ...modelDiff, ...(removeNodeIds.length ? { removeNodeIds } : {}) },
      addCorrespondence: obj.addCorrespondence ?? [],
      removedNodeIds: removeNodeIds,
      removedTableIds: diff.removeTableIds ?? [],
    };
  }
}
