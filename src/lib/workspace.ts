/**
 * JARVIS Context Engine — the interface as a function of real state.
 *
 * Derives WHICH workspace the HUD should present and WHICH agent chain is
 * running, purely from live application state (active agents, tool results,
 * task ledger). Nothing here is decorative: every value maps to something
 * that actually happened in the pipeline.
 */

import { ActiveAgents, AgentId, agentLabel } from './agents';

// ── Workspaces ───────────────────────────────────────────────────────────

export type WorkspaceId =
  | 'command'      // default: issuing commands, awaiting results
  | 'research'     // web/research/analysis activity
  | 'engineering'  // build/code/system activity
  | 'organize'     // memory/notes/calendar/files
  | 'observe';     // system telemetry / diagnostics

export interface WorkspaceDef {
  id: WorkspaceId;
  /** Short stage label shown under the orb. */
  label: string;
  /** One-line description of what this workspace presents. */
  blurb: string;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceDef> = {
  command:    { id: 'command',    label: 'COMMAND',    blurb: 'Direct line to the mesh.' },
  research:   { id: 'research',   label: 'RESEARCH',   blurb: 'Sources, synthesis, findings.' },
  engineering:{ id: 'engineering',label: 'ENGINEERING',blurb: 'Models, physics, build plans.' },
  organize:   { id: 'organize',   label: 'ORGANIZE',   blurb: 'Memory, notes, schedule.' },
  observe:    { id: 'observe',    label: 'OBSERVE',    blurb: 'Live system telemetry.' },
};

// ── Agent pipeline (contextual chain, not decorative nodes) ─────────────

export interface PipelineNode {
  id: AgentId;
  label: string;
  role: 'primary' | 'support';
}

/**
 * Build the visible agent chain for the current request.
 * Order: primary agents in registry order, then support agents.
 * Returns null when idle — the pipeline only exists while working.
 */
export function buildPipeline(active: ActiveAgents): PipelineNode[] | null {
  const primary = active.primary.map(id => ({ id, label: agentLabel(id), role: 'primary' as const }));
  const support = active.support
    .filter(id => !active.primary.includes(id))
    .map(id => ({ id, label: agentLabel(id), role: 'support' as const }));
  if (primary.length === 0 && support.length === 0) return null;
  return [...primary, ...support];
}

// ── Workspace resolution ─────────────────────────────────────────────────

const WORKSPACE_BY_AGENT: Partial<Record<AgentId, WorkspaceId>> = {
  research: 'research',
  web: 'research',
  strategy: 'research',
  engineering: 'engineering',
  coding: 'engineering',
  design: 'engineering',
  automation: 'engineering',
  memory: 'organize',
  calendar: 'organize',
  files: 'organize',
  communication: 'organize',
  finance: 'research',
  system: 'observe',
};

/**
 * Resolve the workspace from the active agents. Priority: the first primary
 * agent's domain wins; support agents only decide when nothing else does.
 */
export function resolveWorkspace(active: ActiveAgents): WorkspaceId {
  for (const id of active.primary) {
    const ws = WORKSPACE_BY_AGENT[id];
    if (ws) return ws;
  }
  for (const id of active.support) {
    const ws = WORKSPACE_BY_AGENT[id];
    if (ws) return ws;
  }
  return 'command';
}

/** Map a tool card to the workspace that should present it. */
export function workspaceForTool(card?: string): WorkspaceId {
  switch (card) {
    case 'search': return 'research';
    case 'weather': return 'observe';
    case 'system': return 'observe';
    case 'clock': return 'command';
    case 'cad': return 'engineering';
    case 'notes': return 'organize';
    default: return 'command';
  }
}
