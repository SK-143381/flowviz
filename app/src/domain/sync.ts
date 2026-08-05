/**
 * Correspondence between a diagram and the schema it was generated from (see
 * schemaModelToDraftGraph). Owned and maintained by application/SyncCoordinator.ts, never by
 * DiagramSessionService or SchemaSessionService themselves — neither of those knows the other
 * exists, per their class docstrings.
 */
export interface Correspondence {
  nodeToTable: Record<string, string>;
  tableToNode: Record<string, string>;
}

export function emptyCorrespondence(): Correspondence {
  return { nodeToTable: {}, tableToNode: {} };
}

export function addCorrespondencePairs(
  correspondence: Correspondence,
  pairs: Array<{ nodeId: string; tableId: string }>
): Correspondence {
  const nodeToTable = { ...correspondence.nodeToTable };
  const tableToNode = { ...correspondence.tableToNode };
  for (const { nodeId, tableId } of pairs) {
    nodeToTable[nodeId] = tableId;
    tableToNode[tableId] = nodeId;
  }
  return { nodeToTable, tableToNode };
}

export function removeCorrespondenceFor(
  correspondence: Correspondence,
  removedNodeIds: string[] = [],
  removedTableIds: string[] = []
): Correspondence {
  const nodeToTable = { ...correspondence.nodeToTable };
  const tableToNode = { ...correspondence.tableToNode };
  for (const nodeId of removedNodeIds) {
    const tableId = nodeToTable[nodeId];
    delete nodeToTable[nodeId];
    if (tableId) delete tableToNode[tableId];
  }
  for (const tableId of removedTableIds) {
    const nodeId = tableToNode[tableId];
    delete tableToNode[tableId];
    if (nodeId) delete nodeToTable[nodeId];
  }
  return { nodeToTable, tableToNode };
}
