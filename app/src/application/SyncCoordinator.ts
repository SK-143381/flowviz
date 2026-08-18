/**
 * Bidirectional schema <-> diagram sync. Neither DiagramSessionService nor
 * SchemaSessionService knows the other exists (see their class docstrings) — this is the one
 * place that reaches into both, wired up at the composition root (App.tsx) exactly like
 * generateFromSchema already does. It links the two the moment a diagram is generated from a
 * schema, then listens for edits on either side and asks the *other* domain's reasoning
 * engine to translate the change, so a structural edit invented on one side (e.g. an LLM
 * splitting one node into two) becomes an equivalent change on the other.
 */

import type { DiagramGraph, GraphDiff } from '../domain/entities';
import type { SchemaDiff } from '../domain/schema/entities';
import type { IReasoningEngine, ISchemaReasoningEngine } from '../domain/ports';
import { addCorrespondencePairs, emptyCorrespondence, removeCorrespondenceFor, type Correspondence } from '../domain/sync';
import type { DiagramSessionService } from './DiagramSessionService';
import type { SchemaSessionService } from './SchemaSessionService';

function isEmptyGraphDiff(diff: GraphDiff): boolean {
  return (
    !diff.addNodes?.length &&
    !diff.removeNodeIds?.length &&
    !diff.updateNodes?.length &&
    !diff.addEdges?.length &&
    !diff.removeEdgeIds?.length &&
    !diff.updateEdges?.length &&
    !diff.addLabels?.length &&
    !diff.removeLabelIds?.length &&
    !diff.updateLabels?.length
  );
}

function isEmptySchemaDiff(diff: SchemaDiff): boolean {
  return !diff.addTables?.length && !diff.removeTableIds?.length && !diff.updateTables?.length && !diff.replaceColumns?.length;
}

function summarizeSchemaDiff(diff: SchemaDiff): string {
  const parts: string[] = [];
  if (diff.addTables?.length) parts.push(`added ${diff.addTables.map((t) => t.name).join(', ')}`);
  if (diff.removeTableIds?.length) parts.push(`removed ${diff.removeTableIds.length} table(s)`);
  if (diff.updateTables?.length) {
    parts.push(diff.updateTables.map((t) => (t.name ? `renamed a table to ${t.name}` : 'updated a table')).join(', '));
  }
  if (diff.replaceColumns?.length) parts.push('updated columns');
  return parts.length ? parts.join('; ') : 'schema updated';
}

function summarizeGraphDiff(diff: GraphDiff): string {
  const parts: string[] = [];
  if (diff.addNodes?.length) {
    const names = (diff.addLabels ?? []).filter((l) => l.elementKind === 'node').map((l) => l.text);
    parts.push(`added ${names.length ? names.join(', ') : `${diff.addNodes.length} component(s)`}`);
  }
  if (diff.removeNodeIds?.length) parts.push(`removed ${diff.removeNodeIds.length} component(s)`);
  if (diff.updateLabels?.length) {
    parts.push(diff.updateLabels.map((l) => (l.text ? `renamed to ${l.text}` : 'updated a label')).join(', '));
  }
  return parts.length ? parts.join('; ') : 'diagram updated';
}

export class SyncCoordinator {
  private correspondence: Correspondence | null = null;
  private applying = false;
  private readonly diagramService: DiagramSessionService;
  private readonly schemaService: SchemaSessionService;
  private readonly diagramReasoningEngine: IReasoningEngine;
  private readonly schemaReasoningEngine: ISchemaReasoningEngine;

  constructor(
    diagramService: DiagramSessionService,
    schemaService: SchemaSessionService,
    diagramReasoningEngine: IReasoningEngine,
    schemaReasoningEngine: ISchemaReasoningEngine
  ) {
    this.diagramService = diagramService;
    this.schemaService = schemaService;
    this.diagramReasoningEngine = diagramReasoningEngine;
    this.schemaReasoningEngine = schemaReasoningEngine;

    diagramService.onGeneratedFromSchema((pairs) => {
      this.correspondence = addCorrespondencePairs(emptyCorrespondence(), pairs);
    });
    diagramService.onEditApplied((diff) => {
      void this.handleDiagramEdit(diff);
    });
    schemaService.onEditApplied((diff) => {
      void this.handleSchemaEdit(diff);
    });
    schemaService.onReset(() => {
      this.correspondence = null;
    });
  }

  private async handleDiagramEdit(diff: GraphDiff): Promise<void> {
    if (this.applying || !this.correspondence) return;
    this.applying = true;
    try {
      const schema = this.schemaService.exportSchema();
      const graph = this.diagramService.exportGraph();
      const translated = await this.schemaReasoningEngine.translateDiagramEdit(diff, this.correspondence, graph, schema);
      if (!isEmptySchemaDiff(translated.diff)) {
        await this.schemaService.applySyncedDiff(translated.diff, summarizeSchemaDiff(translated.diff));
      }
      this.updateCorrespondence(translated.addCorrespondence, translated.removedNodeIds, translated.removedTableIds);
    } catch (err) {
      console.error('SyncCoordinator: failed to sync a diagram edit to the schema', err);
    } finally {
      this.applying = false;
    }
  }

  private async handleSchemaEdit(diff: SchemaDiff): Promise<void> {
    if (this.applying || !this.correspondence) return;
    this.applying = true;
    try {
      const graph: DiagramGraph = this.diagramService.exportGraph();
      const translated = await this.diagramReasoningEngine.translateSchemaEdit(diff, this.correspondence, graph);
      if (!isEmptyGraphDiff(translated.diff)) {
        await this.diagramService.applySyncedDiff(translated.diff, summarizeGraphDiff(translated.diff));
      }
      this.updateCorrespondence(translated.addCorrespondence, translated.removedNodeIds, translated.removedTableIds);
    } catch (err) {
      console.error('SyncCoordinator: failed to sync a schema edit to the diagram', err);
    } finally {
      this.applying = false;
    }
  }

  private updateCorrespondence(
    add?: Array<{ nodeId: string; tableId: string }>,
    removedNodeIds?: string[],
    removedTableIds?: string[]
  ): void {
    if (!this.correspondence) return;
    let next = this.correspondence;
    if (add?.length) next = addCorrespondencePairs(next, add);
    if (removedNodeIds?.length || removedTableIds?.length) {
      next = removeCorrespondenceFor(next, removedNodeIds ?? [], removedTableIds ?? []);
    }
    this.correspondence = next;
  }
}
