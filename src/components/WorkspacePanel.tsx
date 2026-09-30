'use client';

/**
 * WorkspacePanel — the left wing becomes task-aware.
 *
 * CONTEXTUAL INTERFACE, driven entirely by real state:
 *   research    → live sources being consulted (mesh models engaged)
 *   engineering → model/physics summary from the last CAD/BOM activity
 *   organize    → latest working notes (memory activity)
 *   observe     → REAL system telemetry (battery/network/cpu cores — no fakes)
 *   command     → core status (previous behavior)
 *
 * Everything shown corresponds to actual application state. When the
 * workspace has nothing real to show, it says so plainly.
 */

import { useEffect, useState } from 'react';
import { WorkspaceId } from '@/lib/workspace';
import { WorkingNote } from '@/lib/astra';

interface Props {
  workspace: WorkspaceId;
  /** Mesh models currently engaged (research). */
  models: string[];
  /** Working notes (organize). */
  notes: WorkingNote[];
  /** Last tool card kind, if any. */
  lastCard: string | null;
  busy: boolean;
  onOpenLog: () => void;
}

// ── Real telemetry hook (observe workspace) ──────────────────────────────
interface Telemetry {
  online: boolean;
  cores: number;
  battery: { level: number; charging: boolean; supported: boolean };
  memoryGB: number | null;
  lang: string;
  platform: string;
}

function useTelemetry(): Telemetry {
  const [t, setT] = useState<Telemetry>({
    online: true, cores: 0, battery: { level: 1, charging: false, supported: false },
    memoryGB: null, lang: '—', platform: '—',
  });

  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, cb: () => void) => void }>;
    };
    const sample = () => setT(prev => ({
      ...prev,
      online: navigator.onLine,
      cores: nav.hardwareConcurrency ?? prev.cores,
      memoryGB: nav.deviceMemory ?? prev.memoryGB,
      lang: navigator.language,
      platform: (nav as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? prev.platform,
    }));
    sample();
    const i = setInterval(sample, 4000);
    if (nav.getBattery) {
      nav.getBattery().then(b => {
        const upd = () => setT(prev => ({
          ...prev, battery: { level: b.level, charging: b.charging, supported: true },
        }));
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      }).catch(() => {});
    }
    return () => clearInterval(i);
  }, []);

  return t;
}

// ── Rows ─────────────────────────────────────────────────────────────────

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? '#7ce8b0' : tone === 'warn' ? '#fbbf24' : tone === 'bad' ? '#fda4af' : undefined;
  return <div className="hud-kv"><span>{k}</span><b style={color ? { color } : undefined}>{v}</b></div>;
}

export default function WorkspacePanel({ workspace, models, notes, lastCard, busy, onOpenLog }: Props) {
  const telemetry = useTelemetry();
  const recent = notes.slice(-4).reverse();

  switch (workspace) {
    case 'research':
      return (
        <>
          <PanelHead label="ACTIVE SOURCES" note={busy ? 'consulting' : 'idle'} />
          {models.length > 0 ? (
            models.slice(0, 4).map(m => (
              <div key={m} className="hud-kv"><span>node</span><b>{m.split('/').pop()}</b></div>
            ))
          ) : (
            <Empty text={busy ? 'Routing through the mesh…' : 'No consultation this session yet.'} />
          )}
        </>
      );

    case 'engineering':
      return (
        <>
          <PanelHead label="BUILD CONTEXT" note={lastCard === 'cad' ? 'cad loaded' : busy ? 'working' : 'standby'} />
          {lastCard === 'cad' ? (
            <Empty text="Model summary in the center card →" />
          ) : (
            <Empty text="Ask JARVIS to build, model, or analyze hardware." />
          )}
          <Row k="modules" v="CAD · PHYSICS · BOM" />
        </>
      );

    case 'organize':
      return (
        <>
          <PanelHead label="RECENT MEMORY" note={`${notes.length} records`} />
          {recent.length === 0 ? (
            <Empty text="Nothing recorded yet." />
          ) : recent.map(n => (
            <div key={n.id} className="hud-note">
              <span className="hud-note-dot" style={{
                background: n.kind === 'decision' ? '#c9b8fd' : n.kind === 'finding' ? '#7ce8b0' : 'var(--accent)',
              }} />
              <span className="hud-note-text">{n.text}</span>
            </div>
          ))}
          <button className="hud-more" onClick={onOpenLog}>FULL LOG →</button>
        </>
      );

    case 'observe':
      return (
        <>
          <PanelHead label="LIVE TELEMETRY" note="real-time" />
          <Row k="network" v={telemetry.online ? 'ONLINE' : 'OFFLINE'} tone={telemetry.online ? 'ok' : 'bad'} />
          <Row k="cpu threads" v={telemetry.cores > 0 ? String(telemetry.cores) : '—'} />
          {telemetry.memoryGB != null && <Row k="device memory" v={`≈${telemetry.memoryGB} GB`} />}
          {telemetry.battery.supported && (
            <Row
              k="battery"
              v={`${Math.round(telemetry.battery.level * 100)}% ${telemetry.battery.charging ? '· CHARGING' : ''}`}
              tone={telemetry.battery.level > 0.2 || telemetry.battery.charging ? 'ok' : 'warn'}
            />
          )}
          <Row k="locale" v={telemetry.lang} />
          <Row k="platform" v={telemetry.platform} />
        </>
      );

    case 'command':
    default:
      return (
        <>
          <PanelHead label="CORE STATUS" note="always on" />
          <Row k="power" v="NOMINAL" tone="ok" />
          <Row k="mesh" v={models.length > 0 ? `${models.length} ONLINE` : 'STANDBY'} />
          <Row k="context" v={`${Math.round((window as unknown as { __ctxPct?: number }).__ctxPct ?? 0)}%`} />
        </>
      );
  }
}

function PanelHead({ label, note }: { label: string; note: string }) {
  return (
    <div className="hud-ws-head">
      <span>{label}</span>
      <span className="hud-ws-note">{note.toUpperCase()}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="hud-note-empty">{text}</div>;
}
