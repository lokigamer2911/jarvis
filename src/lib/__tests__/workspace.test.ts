import { describe, expect, test } from 'bun:test';
import { buildPipeline, resolveWorkspace, workspaceForTool, WORKSPACES } from '../workspace';
import { ActiveAgents } from '../agents';

describe('context engine', () => {
  test('pipeline is null when idle', () => {
    expect(buildPipeline({ primary: [], support: [] })).toBeNull();
  });

  test('pipeline orders primary before support, labels from registry', () => {
    const p = buildPipeline({ primary: ['research', 'web'], support: ['memory', 'web'] });
    expect(p).not.toBeNull();
    expect(p![0]).toEqual({ id: 'research', label: 'RESEARCH', role: 'primary' });
    expect(p![1].id).toBe('web');
    expect(p![1].role).toBe('primary');
    expect(p![2].id).toBe('memory');
    expect(p![2].role).toBe('support');
    expect(p!.some(n => n.id === 'web' && n.role === 'support')).toBe(false);
  });

  test('research request resolves research workspace', () => {
    const active: ActiveAgents = { primary: ['research', 'web'], support: ['memory'] };
    expect(resolveWorkspace(active)).toBe('research');
  });

  test('engineering request resolves engineering workspace', () => {
    const active: ActiveAgents = { primary: ['coding'], support: ['engineering'] };
    expect(resolveWorkspace(active)).toBe('engineering');
  });

  test('support agents decide when no primary match', () => {
    const active: ActiveAgents = { primary: [], support: ['calendar'] };
    expect(resolveWorkspace(active)).toBe('organize');
  });

  test('falls back to command workspace', () => {
    expect(resolveWorkspace({ primary: [], support: [] })).toBe('command');
  });

  test('tool cards map to sensible workspaces', () => {
    expect(workspaceForTool('search')).toBe('research');
    expect(workspaceForTool('system')).toBe('observe');
    expect(workspaceForTool('cad')).toBe('engineering');
    expect(workspaceForTool('notes')).toBe('organize');
    expect(workspaceForTool(undefined)).toBe('command');
  });

  test('all workspaces have labels', () => {
    for (const ws of Object.values(WORKSPACES)) {
      expect(ws.label.length).toBeGreaterThan(0);
      expect(ws.blurb.length).toBeGreaterThan(0);
    }
  });
});
