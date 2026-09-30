'use client';

/**
 * SceneHudBridge — DOM↔world synchronization.
 *
 * The persistent world is WebGL; the environmental grading, scanfield and
 * state-wash are CSS layers on top. This bridge keeps them in lockstep:
 *   · data-env on .grading follows the world state's environment
 *   . scanfield activates during technical operations
 *   · assistant state → worldState.setVoice
 *   · mic metering → micLevel$ (single subscription)
 * It renders nothing.
 */

import { useEffect } from 'react';
import { worldState, useWorldState } from '@/lib/scene-state';
import { assistantMachine, AssistantState } from '@/lib/assistant-state';
import { onMicLevel } from '@/lib/audio-manager';
import { micLevel$ } from '@/lib/audio-levels';

export function SceneHudBridge() {
  const ws = useWorldState();
  const env = worldState.env;

  // Assistant state machine → world voice state
  useEffect(() => {
    let last: AssistantState = assistantMachine.getState();
    worldState.setVoice(last);
    const off = assistantMachine.onState(s => { last = s; worldState.setVoice(s); });
    return () => { off(); };
  }, []);

  // Mic metering → shared observable (one subscription for the whole app)
  useEffect(() => onMicLevel(l => micLevel$.set(l)), []);

  // DOM environment attributes
  useEffect(() => {
    const grading = document.querySelector('.grading');
    if (grading) grading.setAttribute('data-env', env.env);
    const scan = document.querySelector('.scanfield');
    if (scan) scan.setAttribute('data-on', env.scanfield > 0.3 ? 'true' : 'false');
  }, [ws, env]);

  return null;
}
