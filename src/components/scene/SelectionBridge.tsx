'use client';

/**
 * SelectionBridge — HUD echo of 3D world selection.
 *
 * When the user clicks a node in the Recon graph (or a memory node), the
 * selection lives in the module store. This component renders a small
 * readout so the HUD acknowledges the selection without covering the
 * world. Subscribes via useSyncExternalStore — no polling, no re-render
 * storms.
 */

import { useSyncExternalStore } from 'react';
import { reconSelected$, type ReconNodeDatum } from '@/lib/module-store';

function subscribe(fn: () => void) {
  return reconSelected$.subscribe(fn);
}

export function ReconSelectionEcho() {
  const sel = useSyncExternalStore(
    subscribe,
    () => reconSelected$.get(),
    () => null as ReconNodeDatum | null,
  );

  if (!sel) return null;
  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 rounded-lg border px-4 py-2 pointer-events-none"
      style={{ borderColor: 'var(--accent-line)', background: 'rgba(8,12,17,0.85)', backdropFilter: 'blur(12px)' }}
      role="status"
    >
      <span className="hud-text text-[8px]" style={{ color: 'var(--accent-deep)' }}>{sel.kind.toUpperCase()}</span>
      <span className="hud-value text-[11px] ml-3">{sel.label}</span>
      {sel.severity && (
        <span className="hud-text text-[8px] ml-3" style={{ color: 'var(--status-warning)' }}>{sel.severity.toUpperCase()}</span>
      )}
    </div>
  );
}
