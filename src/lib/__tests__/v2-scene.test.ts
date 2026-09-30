import { describe, expect, test } from 'bun:test';
import { deriveWorldState, WORLD_ENVS, JarvisWorldState } from '../scene-state';
import { damp, QUALITY, COLORS } from '../visual-theme';
import { reconToNodes } from '../module-store';
import type { ReconResult } from '../../components/AutoRecon-types';

describe('world state derivation', () => {
  test('home module maps voice states to world states', () => {
    expect(deriveWorldState('home', 'idle')).toBe('idle');
    expect(deriveWorldState('home', 'listening')).toBe('listening');
    expect(deriveWorldState('home', 'processing')).toBe('thinking');
    expect(deriveWorldState('home', 'thinking')).toBe('thinking');
    expect(deriveWorldState('home', 'planning')).toBe('thinking');
    expect(deriveWorldState('home', 'executing')).toBe('thinking');
    expect(deriveWorldState('home', 'speaking')).toBe('speaking');
  });

  test('error overrides every module', () => {
    for (const m of ['home', 'recon', 'cad', 'memory', 'system', 'computer', 'blueprint'] as const) {
      expect(deriveWorldState(m, 'error')).toBe('error');
    }
  });

  test('module states win over voice states (except error)', () => {
    expect(deriveWorldState('recon', 'listening')).toBe('recon');
    expect(deriveWorldState('cad', 'thinking')).toBe('cad');
    expect(deriveWorldState('memory', 'speaking')).toBe('memory');
    expect(deriveWorldState('system', 'executing')).toBe('system');
    expect(deriveWorldState('computer', 'idle')).toBe('computer');
  });

  test('every world state has a complete environment config', () => {
    const states: JarvisWorldState[] = [
      'idle', 'listening', 'thinking', 'speaking', 'recon', 'research',
      'blueprint', 'cad', 'simulation', 'memory', 'system', 'computer', 'error',
    ];
    for (const s of states) {
      const env = WORLD_ENVS[s];
      expect(env).toBeDefined();
      expect(env.camPos.length).toBe(3);
      expect(env.camTarget.length).toBe(3);
      expect(env.corePos.length).toBe(3);
      expect(env.coreScale).toBeGreaterThan(0);
      expect(env.lightIntensity).toBeGreaterThan(0);
      expect(typeof env.grid).toBe('number');
      expect(typeof env.bloom).toBe('number');
      expect(env.module.length).toBeGreaterThan(0);
    }
  });

  test('engineering states have strong grid, home states do not', () => {
    expect(WORLD_ENVS.cad.grid).toBeGreaterThan(0.5);
    expect(WORLD_ENVS.blueprint.grid).toBeGreaterThan(WORLD_ENVS.cad.grid);
    expect(WORLD_ENVS.idle.grid).toBeLessThan(0.3);
    // Voice mode visual: no scanlines at home
    expect(WORLD_ENVS.listening.scanfield).toBe(0);
    expect(WORLD_ENVS.computer.scanfield).toBeGreaterThan(0.5);
  });
});

describe('motion damping', () => {
  test('damp approaches target and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 10, 4, 1 / 60);
    expect(v).toBeGreaterThan(9.9);
    expect(v).toBeLessThanOrEqual(10);
  });

  test('damp is frame-rate independent (many small steps ≈ few large steps)', () => {
    const small = (() => {
      let v = 0;
      for (let i = 0; i < 60; i++) v = damp(v, 100, 3, 1 / 60);
      return v;
    })();
    const big = (() => {
      let v = 0;
      for (let i = 0; i < 6; i++) v = damp(v, 100, 3, 10 / 60);
      return v;
    })();
    expect(Math.abs(small - big)).toBeLessThan(0.5);
  });
});

describe('quality profiles', () => {
  test('low < medium < high particle counts', () => {
    expect(QUALITY.low.particles).toBeLessThan(QUALITY.medium.particles);
    expect(QUALITY.medium.particles).toBeLessThan(QUALITY.high.particles);
    expect(QUALITY.low.postFx).toBe(false);
    expect(QUALITY.medium.postFx).toBe(true);
    expect(QUALITY.high.dprMax).toBeGreaterThanOrEqual(QUALITY.medium.dprMax);
  });

  test('palette keeps the semantic hierarchy', () => {
    expect(COLORS.energy).toBe('#78DFFF');
    expect(COLORS.error).not.toBe(COLORS.warning);
    expect(COLORS.success).not.toBe(COLORS.energy);
  });
});

describe('recon graph flattening', () => {
  const result: ReconResult = {
    target: 'example.com',
    startTime: 0,
    phases: [
      {
        id: 'subdomains', name: 'Subdomain enumeration', status: 'complete',
        commands: [],
        results: [
          { type: 'subdomain', severity: 'info', title: 'api.example.com', detail: 'd' },
          { type: 'technology', severity: 'info', title: 'nginx', detail: 'd' },
          { type: 'port', severity: 'low', title: '443/tcp', detail: 'd' },
          { type: 'vulnerability', severity: 'critical', title: 'XSS', detail: 'd' },
          { type: 'dns', severity: 'info', title: 'MX record', detail: 'd' },
          { type: 'header', severity: 'medium', title: 'CSP missing', detail: 'd' },
        ],
      },
    ],
    summary: {
      totalFindings: 6, critical: 1, high: 0, medium: 1, low: 1, info: 3,
      subdomains: 1, openPorts: 1, technologies: ['nginx'],
    },
  };

  test('maps finding types to semantic node kinds', () => {
    const nodes = reconToNodes(result);
    expect(nodes[0].kind).toBe('domain');
    expect(nodes[0].label).toBe('example.com');
    const byId = new Map(nodes.map(n => [n.label, n.kind]));
    expect(byId.get('api.example.com')).toBe('subdomain');
    expect(byId.get('nginx')).toBe('technology');
    expect(byId.get('443/tcp')).toBe('endpoint');
    expect(byId.get('XSS')).toBe('warning');
    expect(byId.get('MX record')).toBe('source');
    expect(byId.get('CSP missing')).toBe('finding');
  });

  test('preserves severity for warning colouring', () => {
    const nodes = reconToNodes(result);
    const xss = nodes.find(n => n.label === 'XSS')!;
    expect(xss.severity).toBe('critical');
  });
});
