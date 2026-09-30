/**
 * Memory bridge — MemoryPanel pushes real memory lists here when data
 * changes; the 3D knowledge graph reads the latest list per frame.
 */

import { Observable } from './module-store';
import type { Memory } from './memory';

export const memoryGraphData$ = new Observable<Memory[]>([]);
