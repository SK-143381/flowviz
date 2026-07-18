/**
 * Pure-ish presentation-layer layout helper: positions schema table boxes on a 2D canvas
 * using elkjs, exactly the way ElkLayoutEngine positions architecture-diagram nodes. Kept
 * out of domain/application on purpose — table (x, y) is transient view state for the
 * schema *diagram* rendering, not part of the SchemaModel itself (the model has no concept
 * of screen position, same reasoning as why DiagramGraph's positions live on NodeEntity but
 * SchemaModel doesn't need an equivalent).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import ELK from 'elkjs/lib/elk.bundled.js';
import { schemaTableList, type SchemaModel, type SchemaTable } from '../../domain/schema/entities';

const elk = new ELK();

const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 32;
const TABLE_WIDTH = 268;
const PADDING = 6;

export interface TableBoxLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SchemaLayoutResult {
  boxes: Record<string, TableBoxLayout>;
  contentWidth: number;
  contentHeight: number;
}

function tableHeight(table: SchemaTable): number {
  return HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + PADDING * 2;
}

export async function layoutSchemaTables(schema: SchemaModel): Promise<SchemaLayoutResult> {
  const tables = schemaTableList(schema);
  if (tables.length === 0) return { boxes: {}, contentWidth: 0, contentHeight: 0 };

  const edges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  for (const table of tables) {
    for (const column of table.columns) {
      if (column.references && schema.tables[column.references.tableId]) {
        edges.push({ id: `${table.id}-${column.id}`, sources: [column.references.tableId], targets: [table.id] });
      }
    }
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.spacing.nodeNode': '32',
    },
    children: tables.map((t) => ({ id: t.id, width: TABLE_WIDTH, height: tableHeight(t) })),
    edges,
  };

  const result = await elk.layout(elkGraph as never);
  const boxes: Record<string, TableBoxLayout> = {};
  let contentWidth = 0;
  let contentHeight = 0;

  for (const child of (result.children ?? []) as Array<{ id: string; x?: number; y?: number; width?: number; height?: number }>) {
    const x = child.x ?? 0;
    const y = child.y ?? 0;
    const width = child.width ?? TABLE_WIDTH;
    const height = child.height ?? HEADER_HEIGHT;
    boxes[child.id] = { id: child.id, x, y, width, height };
    contentWidth = Math.max(contentWidth, x + width);
    contentHeight = Math.max(contentHeight, y + height);
  }

  return { boxes, contentWidth: contentWidth + PADDING, contentHeight: contentHeight + PADDING };
}

export function rowHeight(): number {
  return ROW_HEIGHT;
}

export function headerHeight(): number {
  return HEADER_HEIGHT;
}
