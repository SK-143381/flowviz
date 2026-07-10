import type { NodeType } from '../../domain/entities';

export interface NodeStyle {
  rx: number;
  fillOpacity: number;
  dasharray?: string;
}

/**
 * Monochrome differentiation: since color can't carry node type, each type gets a unique
 * combination of corner radius, fill density, and stroke pattern instead.
 */
export const NODE_STYLE: Record<NodeType, NodeStyle> = {
  client: { rx: 28, fillOpacity: 0.92 },
  server: { rx: 10, fillOpacity: 0.62 },
  database: { rx: 4, fillOpacity: 0.38 },
  load_balancer: { rx: 10, fillOpacity: 0.38, dasharray: '6 3' },
  cache: { rx: 999, fillOpacity: 0.16 },
  queue: { rx: 10, fillOpacity: 0.16, dasharray: '2 3' },
  api_gateway: { rx: 10, fillOpacity: 0.16, dasharray: '6 3' },
  external_service: { rx: 10, fillOpacity: 0.04, dasharray: '2 3' },
};

export function nodeLabelColor(type: NodeType): string {
  return NODE_STYLE[type].fillOpacity >= 0.5 ? 'var(--paper)' : 'var(--ink)';
}
