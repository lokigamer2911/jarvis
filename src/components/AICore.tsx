'use client';

/**
 * AICore — V2: the liquid-chrome core now lives inside the persistent
 * JarvisWorld (see components/scene/JarvisCore.tsx). This component is a
 * compatibility shim: it renders nothing, because the world already draws
 * the core behind the HUD. All state/mic wiring happens through the
 * world's shared stores — no private canvas, no duplicate scene.
 *
 * Kept as a named export so existing imports keep resolving.
 */

import JarvisWorld from './scene/JarvisWorld';

export interface AICoreProps {
  state?: unknown;
  micLevel?: number;
  activeAgents?: { primary: unknown[]; support: unknown[] };
  className?: string;
}

export default function AICore(_props: AICoreProps) {
  return <JarvisWorld />;
}
