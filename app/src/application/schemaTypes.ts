import type { Decision } from '../domain/entities';
import { emptySchema, type SchemaModel } from '../domain/schema/entities';
import type { LogEntry } from './types';

export type SchemaSessionMode = 'idle' | 'confirming' | 'ready';

export interface SchemaSessionState {
  mode: SchemaSessionMode;
  schema: SchemaModel;
  pendingDecisions: Decision[];
  activeDecisionIndex: number;
  log: LogEntry[];
  error: string | null;
  /** Currently focused cell, used by the FK-cycling Enter-key handler. */
  focusedFkCell: { tableId: string; columnId: string } | null;
}

export function initialSchemaSessionState(): SchemaSessionState {
  return {
    mode: 'idle',
    schema: emptySchema(),
    pendingDecisions: [],
    activeDecisionIndex: 0,
    log: [],
    error: null,
    focusedFkCell: null,
  };
}
