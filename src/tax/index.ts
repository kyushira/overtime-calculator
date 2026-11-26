/**
 * Public surface of the Singapore resident income-tax module.
 */

export * from './bands';
export * from './engine';
export * from './reliefs';
export * from './catalogue';

// `ReliefLine` is declared in both engine.ts (id: string, engine input shape) and
// reliefs.ts (id: ReliefId, catalogue output shape). The star exports collide, so
// the public name is pinned to the typed catalogue version. engine.ts's
// ReliefLine stays structurally compatible because ReliefId is a subset of string.
export type { ReliefLine } from './reliefs';
