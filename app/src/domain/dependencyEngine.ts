/**
 * Pure domain service: given a graph and a proposed direct change, walks structural
 * dependencies (an edge cannot outlive its endpoints; a label cannot outlive its element)
 * and returns every downstream effect as both a mergeable GraphDiff and a human-readable
 * DependencyRecord[] for HCXAI confirmation. No I/O, fully unit-testable in isolation.
 */

import type { DependencyRecord, DiagramGraph, GraphDiff } from './entities';
import { nextId } from './idGenerator';

export interface ExpandedChange {
  diff: GraphDiff;
  records: DependencyRecord[];
  affectedNodeIds: string[];
}

function nextRecordId(): string {
  return nextId('dep');
}

export function expandDependencies(graph: DiagramGraph, directDiff: GraphDiff): ExpandedChange {
  const records: DependencyRecord[] = [];
  const removeNodeIds = new Set(directDiff.removeNodeIds ?? []);
  const removeEdgeIds = new Set(directDiff.removeEdgeIds ?? []);
  const removeLabelIds = new Set(directDiff.removeLabelIds ?? []);
  const affectedNodeIds = new Set<string>();

  for (const u of directDiff.updateNodes ?? []) affectedNodeIds.add(u.id);
  for (const n of directDiff.addNodes ?? []) affectedNodeIds.add(n.id);

  // Rule 1: deleting a node ripples to every edge touching it. Note we deliberately do NOT
  // add the surviving endpoint to affectedNodeIds here: losing an edge is not a reason to
  // move a node that the user didn't touch (that's the "spatial stability" contract from
  // write-up Section 4.1, metric 3 — a deleted node leaves a gap, it doesn't trigger a
  // repack of everything still on the canvas).
  for (const nodeId of removeNodeIds) {
    for (const edge of Object.values(graph.edges)) {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        if (!removeEdgeIds.has(edge.id)) {
          removeEdgeIds.add(edge.id);
          records.push({
            id: nextRecordId(),
            trigger: `node_deleted:${nodeId}`,
            effect: `remove edge ${edge.id} (${edge.sourceId} -> ${edge.targetId}), since one endpoint no longer exists`,
          });
        }
      }
    }
  }

  // Rule 2: deleting a node ripples to its own label.
  for (const nodeId of removeNodeIds) {
    for (const label of Object.values(graph.labels)) {
      if (label.elementId === nodeId && !removeLabelIds.has(label.id)) {
        removeLabelIds.add(label.id);
        records.push({
          id: nextRecordId(),
          trigger: `node_deleted:${nodeId}`,
          effect: `remove label ${label.id} ("${label.text}"), its node no longer exists`,
        });
      }
    }
  }

  // Rule 3: any removed edge (direct or rippled) takes its own label with it.
  for (const edgeId of removeEdgeIds) {
    for (const label of Object.values(graph.labels)) {
      if (label.elementId === edgeId && !removeLabelIds.has(label.id)) {
        removeLabelIds.add(label.id);
        records.push({
          id: nextRecordId(),
          trigger: `edge_deleted:${edgeId}`,
          effect: `remove label ${label.id} ("${label.text}"), its edge no longer exists`,
        });
      }
    }
  }

  const expandedDiff: GraphDiff = {
    ...directDiff,
    removeEdgeIds: Array.from(removeEdgeIds),
    removeLabelIds: Array.from(removeLabelIds),
  };

  return { diff: expandedDiff, records, affectedNodeIds: Array.from(affectedNodeIds) };
}
