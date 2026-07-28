import type { DiagramSessionService } from '../../application/DiagramSessionService';
import type { SessionState } from '../../application/types';
import { useObservableService } from './useObservableService';

/** Subscribes a component to the DiagramSessionService observable (composition root owns the instance). */
export function useDiagramSession(service: DiagramSessionService): SessionState {
  return useObservableService(service);
}
