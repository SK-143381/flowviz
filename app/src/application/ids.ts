/**
 * Re-exports the shared domain id generator so existing `from './ids'` imports across
 * application/ keep working. See domain/idGenerator.ts for why there's exactly one of these
 * for the whole app now, not one per layer.
 */
export { nextId } from '../domain/idGenerator';
