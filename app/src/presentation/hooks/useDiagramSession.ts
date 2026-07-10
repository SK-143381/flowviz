import { useSyncExternalStore } from 'react';
import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SessionState } from '../../application/types';

/** Subscribes a component to the DiagramSessionService observable (composition root owns the instance). */
export function useDiagramSession(service: DiagramSessionService): SessionState {
  return useSyncExternalStore(service.subscribe, service.getState);
}
