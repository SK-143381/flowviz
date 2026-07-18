import { useSyncExternalStore } from 'react';

interface ObservableService<T> {
  subscribe: (listener: () => void) => () => void;
  getState: () => T;
}

/** Generic useSyncExternalStore binding for any of our plain-observable session services. */
export function useObservableService<T>(service: ObservableService<T>): T {
  return useSyncExternalStore(service.subscribe, service.getState);
}
