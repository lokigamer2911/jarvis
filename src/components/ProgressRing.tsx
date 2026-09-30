'use client';

/**
 * ProgressRing — SVG ring around the AI core showing REAL task progress.
 *
 * Driven by the task ledger: filled segments = completed steps, pulsing
 * segment = running step. Renders only while a task is in flight, so the
 * ring itself is a statement that work is happening.
 */

import { useMemo } from 'react';

export interface LedgerStepLite {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

interface Props {
  steps: LedgerStepLite[];
  size?: number;
}

export default function ProgressRing({ steps, size = 470 }: Props) {
  const total = steps.length;
  const done = steps.filter(s => s.status === 'done').length;
  const failed = steps.some(s => s.status === 'failed');
  const active = total > 0;

  // Circumference geometry (r = 48 in a 100 viewBox)
  const C = 2 * Math.PI * 48;
  const seg = total > 0 ? C / total : 0;

  const stroke = failed ? '#fda4af' : 'var(--accent)';
  const opacity = active ? 1 : 0;

  const dashArray = useMemo(() => {
    if (total === 0) return '0 0';
    // Each step draws its own segment; done steps are filled, running partial.
    return steps
      .map((s, i) => {
        const offset = i * seg;
        const fill = s.status === 'done' ? seg * 0.82 : s.status === 'running' ? seg * 0.45 : seg * 0.12;
        return `${fill} ${seg - fill}`;
      })
      .join(' ');
  }, [steps, total, seg]);

  const dashOffset = useMemo(() => {
    if (total === 0) return 0;
    // Walk the segments with small gaps: compute cumulative offset manually.
    let acc = 0;
    for (let i = 0; i < steps.length; i++) {
      acc += seg; // advance one full segment per step (gap included in fill math)
    }
    return acc === C ? 0 : 0;
  }, [steps, total, seg, C]);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity, transition: 'opacity 0.6s ease',
        transform: 'rotate(-90deg)',
      }}
      aria-hidden="true"
    >
      {/* Track */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(240,236,228,0.05)" strokeWidth="0.8" />
      {/* Progress: one dash pattern per step */}
      {total > 0 && (
        <circle
          cx="50" cy="50" r="48" fill="none"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dasharray 0.5s ease', filter: 'drop-shadow(0 0 4px rgba(255,90,31,0.4))' }}
        />
      )}
    </svg>
  );
}
