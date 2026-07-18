/**
 * GenAssist-inspired post-generation description: a pure function that turns the current
 * DiagramGraph into a short list of plain-language, screen-reader-friendly bullets — a
 * describe-after-generation companion to the pre-commitment decision-confirmation loop.
 * Where GenAssist (Huh, Peng & Pavel, UIST 2023) answers "what did the model produce?" via a
 * VQA-driven comparison table, this answers the same question for a structured graph
 * directly from its own data, with no vision model needed, and stays accurate by
 * construction (it reads the same entities the canvas renders, nothing is re-guessed).
 */

import type { DiagramGraph } from '../domain/entities';

export function describeGraph(graph: DiagramGraph): string[] {
  const nodes = Object.values(graph.nodes);
  const edges = Object.values(graph.edges);
  const labelFor = (elementId: string) => Object.values(graph.labels).find((l) => l.elementId === elementId)?.text ?? elementId;

  if (nodes.length === 0) return ['The diagram is empty.'];

  const bullets: string[] = [];
  bullets.push(`${nodes.length} component${nodes.length === 1 ? '' : 's'}, ${edges.length} connection${edges.length === 1 ? '' : 's'}.`);

  const byType = new Map<string, number>();
  for (const n of nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
  bullets.push(
    'Component types: ' + Array.from(byType.entries()).map(([type, count]) => `${count} ${type.replace('_', ' ')}`).join(', ') + '.'
  );

  for (const edge of edges) {
    const from = labelFor(edge.sourceId);
    const to = labelFor(edge.targetId);
    const arrow = edge.directionality === 'bi' ? '<->' : '->';
    bullets.push(`${from} ${arrow} ${to} over ${edge.protocol}.`);
  }

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.sourceId);
    connected.add(e.targetId);
  }
  const orphans = nodes.filter((n) => !connected.has(n.id));
  if (orphans.length > 0) {
    bullets.push(`Not yet connected to anything: ${orphans.map((n) => labelFor(n.id)).join(', ')}.`);
  }

  return bullets;
}
