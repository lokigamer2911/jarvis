/**
 * JARVIS V2 — MODULE DATA STORES
 *
 * Tiny observable stores that bridge real application data into the 3D
 * world without re-rendering React on every frame. Components push data
 * in (results, selection, metrics); the world's useFrame loops read the
 * latest snapshot directly. No faked data — stores start empty.
 */

import type { ReconResult } from '@/components/AutoRecon-types';
import type { SystemMetrics } from '@/components/SystemDashboard-types';
import type { CADModel } from './cad';

export type { SystemMetrics };

// ── Generic micro-store ───────────────────────────────────────────────────
export class Observable<T> {
  private value: T;
  private listeners = new Set<(v: T) => void>();
  constructor(initial: T) { this.value = initial; }
  get(): T { return this.value; }
  set(v: T) {
    this.value = v;
    this.listeners.forEach(fn => { try { fn(v); } catch (e) { console.error(e); } });
  }
  subscribe(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

// ── Recon ─────────────────────────────────────────────────────────────────
export interface ReconNodeDatum {
  id: string;
  kind: 'domain' | 'subdomain' | 'technology' | 'endpoint' | 'finding' | 'source' | 'warning';
  label: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export const reconResult$ = new Observable<ReconResult | null>(null);
export const reconScanning$ = new Observable<boolean>(false);
export const reconPhase$ = new Observable<string>('');
export const reconSelected$ = new Observable<ReconNodeDatum | null>(null);

/** Flatten a recon result into graph nodes (deterministic layout seeds). */
export function reconToNodes(result: ReconResult): ReconNodeDatum[] {
  const nodes: ReconNodeDatum[] = [{
    id: 'target', kind: 'domain', label: result.target,
  }];
  let i = 0;
  for (const phase of result.phases) {
    for (const f of phase.results) {
      i++;
      const kind: ReconNodeDatum['kind'] =
        f.type === 'subdomain' ? 'subdomain'
        : f.type === 'technology' ? 'technology'
        : f.type === 'port' ? 'endpoint'
        : f.type === 'vulnerability' ? 'warning'
        : f.type === 'dns' || f.type === 'email' ? 'source'
        : 'finding';
      nodes.push({
        id: `f${i}`,
        kind,
        label: f.title,
        severity: f.severity,
      });
    }
  }
  return nodes;
}

// ── CAD ───────────────────────────────────────────────────────────────────
export type CadPresentation = 'realistic' | 'wireframe' | 'technical' | 'xray' | 'exploded' | 'section' | 'blueprint';
export type CadFocus = keyof typeof import('./camera-system').CAD_FOCUSES;

export const cadModel$ = new Observable<CADModel | null>(null);
export const cadPresentation$ = new Observable<CadPresentation>('realistic');
export const cadExplode$ = new Observable<number>(0);      // 0..1 animated
export const cadSection$ = new Observable<number>(0.5);    // section plane height 0..1
export const cadFocus$ = new Observable<CadFocus>('assembly');
export const cadBuildProgress$ = new Observable<number>(1); // 0..1 construction animation

// ── System telemetry (real metrics only) ──────────────────────────────────
export const systemMetrics$ = new Observable<SystemMetrics | null>(null);
