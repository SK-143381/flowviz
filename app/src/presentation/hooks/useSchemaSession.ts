import type { SchemaSessionService } from '../../application/SchemaSessionService';
import type { SchemaSessionState } from '../../application/schemaTypes';
import { useObservableService } from './useObservableService';

/** Subscribes a component to the SchemaSessionService observable. */
export function useSchemaSession(service: SchemaSessionService): SchemaSessionState {
  return useObservableService(service);
}
