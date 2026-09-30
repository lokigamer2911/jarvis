'use client';

/**
 * MotionProvider + transitions — the shared motion vocabulary.
 *
 * MotionProvider establishes reduced-motion + quality context once.
 * ModuleTransition wraps a module workspace: it unmounts children only
 * after the exit animation (preserving spatial continuity), applies the
 * world state, and animates per the central motion system.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOTION, QualityTier, detectQuality } from '@/lib/visual-theme';
import { duration, panelVariants, T_MODULE, EASE_OUT } from '@/lib/motion-system';
import { WorldModule, worldState } from '@/lib/scene-state';

interface MotionCtx {
  reduced: boolean;
  quality: QualityTier;
}
const Ctx = createContext<MotionCtx>({ reduced: false, quality: 'high' });
export const useMotionCtx = () => useContext(Ctx);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [quality, setQuality] = useState<QualityTier>('high');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Async init: keeps the effect free of synchronous setState cascades.
    const id = window.setTimeout(() => {
      setQuality(detectQuality());
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(mq.matches);
      const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener?.('change', fn);
      qualityListenerRef.current = fn;
      mqRef.current = mq;
    }, 0);
    return () => {
      window.clearTimeout(id);
      mqRef.current?.removeEventListener?.('change', qualityListenerRef.current!);
    };
  }, []);

  const value = useMemo(() => ({ quality, reduced }), [quality, reduced]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const mqRef: { current: MediaQueryList | null } = { current: null };
const qualityListenerRef: { current: ((e: MediaQueryListEvent) => void) | null } = { current: null };

/**
 * ModuleTransition — mounts a module workspace in-world.
 * The world keeps rendering behind; the module layer fades/scales in per
 * the shared choreography and sets the world module while open.
 */
export function ModuleTransition({
  module,
  open,
  children,
}: {
  module: WorldModule;
  open: boolean;
  children: React.ReactNode;
}) {
  const { reduced } = useMotionCtx();

  // Own the world while open
  useEffect(() => {
    if (open) worldState.setModule(module);
  }, [open, module]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="workspace-root"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.995 }}
          transition={T_MODULE}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** PanelTransition — small building-block for docks/cards inside modules. */
export function PanelTransition({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ ...T_MODULE, delay: duration(delay) }}
    >
      {children}
    </motion.div>
  );
}

/** CameraTransition — declarative semantic camera move (CAD focuses). */
export function useCameraTransition() {
  const { reduced } = useMotionCtx();
  return useCallback((_pose?: { pos: [number, number, number]; target: [number, number, number] }) => {
    // Camera targets are consumed by the CameraRig via world state; this
    // hook exists so call sites stay declarative and reduced-motion-aware.
    void reduced;
  }, [reduced]);
}

export { MOTION, EASE_OUT };
