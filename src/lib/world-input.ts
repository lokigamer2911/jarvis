/**
 * JARVIS V2 — WORLD INPUT
 *
 * One global pointer tracker for the whole 3D world. The camera rig and
 * depth layers read from here; components must not add their own listeners
 * for parallax. Values are clamped to [-1, 1] and centered on the screen.
 */

type MouseState = { x: number; y: number };

const g = globalThis as unknown as { __jarvisMouse?: MouseState };

if (typeof window !== 'undefined' && !g.__jarvisMouse) {
  const state: MouseState = { x: 0, y: 0 };
  g.__jarvisMouse = state;
  window.addEventListener('pointermove', (e) => {
    state.x = (e.clientX / window.innerWidth) * 2 - 1;
    state.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
}

export function mouse(): MouseState {
  return g.__jarvisMouse ?? { x: 0, y: 0 };
}
