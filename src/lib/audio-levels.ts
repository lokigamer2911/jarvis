/**
 * Mic level bridge — audio-manager's metering pushes into this store,
 * the 3D world reads it per frame. No React state involved.
 */

import { Observable } from './module-store';

export const micLevel$ = new Observable<number>(0);
