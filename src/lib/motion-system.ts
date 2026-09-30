/**
 * JARVIS V2 — MOTION SYSTEM
 *
 * Central motion vocabulary shared by every module. Durations scale with
 * movement distance and importance; easings carry meaning (settle vs
 * arrive). Framer-motion variants + constants live here so no component
 * invents its own timing.
 */

import type { Transition, Variants } from 'framer-motion';
import { MOTION, EASING, prefersReducedMotion } from './visual-theme';

/** Scale all durations when the user prefers reduced motion. */
export function duration(ms: number): number {
  return prefersReducedMotion() ? Math.min(ms, 80) : ms;
}

/** Standard ease used across the app (matches CSS --ease). */
export const EASE_OUT = EASING.out;
export const EASE_SPRING = EASING.spring;

// ── Framer-motion transitions ─────────────────────────────────────────────
export const T_MICRO: Transition = { duration: duration(MOTION.micro) / 1000, ease: EASE_OUT };
export const T_BUTTON: Transition = { duration: duration(MOTION.button) / 1000, ease: EASE_OUT };
export const T_PANEL: Transition = {
  type: 'spring', stiffness: 260, damping: 30, mass: 0.9,
};

export const T_MODULE: Transition = {
  duration: duration(MOTION.module) / 1000,
  ease: EASE_OUT,
};

// ── Shared variants ───────────────────────────────────────────────────────
export const panelVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.99 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { ...T_MODULE, staggerChildren: duration(60) / 1000, delayChildren: duration(80) / 1000 },
  },
  exit: { opacity: 0, y: 8, scale: 0.995, transition: { duration: duration(220) / 1000, ease: EASE_OUT } },
};

export const panelChildVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration(300) / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: duration(120) / 1000 } },
};

/** Crossfade used when swapping readouts inside a fixed region. */
export const crossfade: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: duration(240) / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: duration(160) / 1000, ease: EASE_OUT } },
};

/** Stagger container for lists (findings, nodes, steps). */
export const listStagger: Variants = {
  animate: { transition: { staggerChildren: duration(35) / 1000 } },
};

export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: duration(220) / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: duration(100) / 1000 } },
};
