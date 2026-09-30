'use client';

/**
 * JARVIS Build Studio — Blueprint + CAD + Industrial Engineering, merged.
 *
 * One brief in, a production package out:
 *   · MODEL      — parametric 3D chassis, materials, live physics tuning
 *   · WIRING     — electronics: components, diagram, assembly order
 *   · VALIDATION — industrial-grade checks: fatigue, buckling, shock (MIL-STD-810),
 *                  regulator thermal, C-rate, ampacity, ingress, fasteners —
 *                  plus unit economics and a gated manufacturing plan
 *   · DOCS       — dimensioned 3-view drawing (ASME Y14.5), DXF, model BOM
 *
 * The Idea Foundry cross-combines sensing/actuation/energy/link primitives
 * into buildable invention briefs when you don't know what to make yet.
 */

import React, { useEffect, useMemo, useState, Suspense, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import {
  CAD_TEMPLATES, buildFromTemplate, buildShapeMesh, modelStats, downloadSTL,
  parseCADRequest, MATERIALS, type CADModel, type MaterialId,
} from '@/lib/cad';
import {
  validateBuild, type Check, type CheckStatus, type PowerRow,
} from '@/lib/engineering';
import {
  industrialValidation, DUTY_PROFILES, type DutyClass, type CostBreakdown, type PlanPhase,
} from '@/lib/industrial';
import {
  threeViewSVG, exportDXF, modelBOM, downloadText,
} from '@/lib/cad-drawing';
import { generateSparks, seedFromString, type Spark } from '@/lib/invent';
import {
  cadModel$, cadPresentation$, cadExplode$, cadSection$, cadBuildProgress$,
  type CadPresentation,
} from '@/lib/module-store';

// ── Types (mirror of the /api/hardware response) ────────────────

interface HardwareResult {
  analysis: {
    name: string;
    complexity: string;
    estimatedCost: string;
    estimatedTime: string;
    components: { id: string; name: string; category: string; voltage: string; price: string; description?: string }[];
    wiring: {
      title: string;
      description: string;
      connections: { from: { component: string; pin: string }; to: { component: string; pin: string }; wire: string; notes?: string }[];
      powerRequirements: { component: string; voltage: string; current: string; source: string }[];
      assemblySteps: string[];
      tips: string[];
    };
  };
  wiringDiagramText: string;
  wiringDiagramSVG: string;
  bom: string;
}

type View = 'model' | 'wiring' | 'validation' | 'docs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Quick builds: each pairs a CAD template with an electronics brief.
const QUICK_BUILDS = [
  { name: 'Weather Station', desc: 'ESP32 · BME280 · OLED', cad: 'enclosure', brief: 'Build an IoT weather station with ESP32, BME280 sensor, OLED display, and WiFi cloud sync' },
  { name: 'Smart Home Hub', desc: 'ESP32 · Relay · PIR', cad: 'enclosure', brief: 'Build a smart home hub that controls lights via relay, detects motion with PIR, and shows status on a display' },
  { name: 'Robot Arm', desc: 'Servos · ESP32 · joints', cad: 'robot-arm-segment', brief: 'Build a 4-DOF robot arm with servo joints, ESP32 control, and position feedback' },
  { name: 'Motion Alarm', desc: 'PIR · buzzer · WiFi', cad: 'enclosure', brief: 'Build a PIR motion alarm that detects intruders and sends WiFi notifications to my phone' },
  { name: 'Speaker', desc: 'Horn acoustic geometry', cad: 'speaker-horn', brief: '' },
  { name: 'Phone Case', desc: 'Custom-fit shell', cad: 'phone-case', brief: '' },
];

// ── Mesh view (from CAD engine) ─────────────────────────────────

function ShapeMesh({ model }: { model: CADModel }) {
  const geometries = useMemo(() => {
    return model.shapes.map(s => {
      const soup = buildShapeMesh(s);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(soup.positions, 3));
      geo.computeVertexNormals();
      return geo;
    });
  }, [model]);

  useEffect(() => () => { geometries.forEach(g => g.dispose()); }, [geometries]);

  return (
    <group>
      {geometries.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshStandardMaterial color="#2a2a2c" metalness={0.55} roughness={0.32} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function ModelScene({ model }: { model: CADModel }) {
  const floorY = useMemo(() => model.shapes.reduce((min, s) => {
    const soup = buildShapeMesh(s);
    let minY = Infinity;
    const p = soup.positions;
    for (let i = 1; i < p.length; i += 3) if (p[i] < minY) minY = p[i];
    return Math.min(min, minY);
  }, Infinity), [model]);

  return (
    <>
      <color attach="background" args={['#0e0e10']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[60, 100, 40]} intensity={1.15} color="#fff8ee" />
      <directionalLight position={[-50, 30, -60]} intensity={0.35} color="#c4b5fd" />
      <Suspense fallback={null}>
        <ShapeMesh model={model} />
        <Grid
          args={[400, 400]} cellSize={10} cellColor="#26262a"
          sectionSize={50} sectionColor="#3a3a40" fadeDistance={520} infiniteGrid
          position={[0, floorY, 0]}
        />
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={30} maxDistance={800} makeDefault />
    </>
  );
}

// ── Check row ───────────────────────────────────────────────────

function CheckRow({ check }: { check: Check }) {
  const [open, setOpen] = useState(false);
  const color = check.status === 'pass' ? '#6ee7b7' : check.status === 'warn' ? '#fbbf24' : '#fda4af';
  return (
    <div className="rounded-xl border transition-colors" style={{ borderColor: open ? `${color}44` : 'var(--line)' }}>
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
        <span className="flex-1 text-[11.5px] text-[color:var(--t1)]/85">{check.title}</span>
        <span className="font-mono text-[10.5px]" style={{ color }}>{check.value}</span>
        <span className="text-[9px] text-white/25">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
          <p className="text-[11px] leading-relaxed text-[color:var(--t2)]">{check.detail}</p>
          {check.formula && (
            <p className="mt-2 rounded-lg border px-2 py-1.5 font-mono text-[9.5px] leading-relaxed text-[color:var(--t3)]" style={{ borderColor: 'var(--line)' }}>
              {check.formula}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const DOMAIN_LABELS: Record<string, string> = {
  structural: 'Structural',
  thermal: 'Thermal',
  electrical: 'Electrical',
  battery: 'Battery',
  print: 'Manufacturing',
};

// ── Main studio ─────────────────────────────────────────────────

export default function BuildStudio({ isOpen, onClose }: Props) {
  const [brief, setBrief] = useState('');
  const [templateId, setTemplateId] = useState('enclosure');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [material, setMaterial] = useState<MaterialId>('petg');
  const [duty, setDuty] = useState<DutyClass>('field');
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [view, setView] = useState<View>('model');
  const [sparkSeed, setSparkSeed] = useState(() => seedFromString('jarvis'));
  const [activeSpark, setActiveSpark] = useState<string | null>(null);

  // ── V2 presentation state (drives the persistent-world model) ──
  const [presentation, setPresentation] = useState<CadPresentation>('realistic');
  const [explode, setExplode] = useState(false);
  const [section, setSection] = useState(false);

  const [electronics, setElectronics] = useState<HardwareResult | null>(null);
  const [elecLoading, setElecLoading] = useState(false);
  const [elecError, setElecError] = useState('');

  const briefRef = useRef<HTMLInputElement>(null);
  const template = CAD_TEMPLATES.find(t => t.id === templateId) ?? CAD_TEMPLATES[0];

  const model = useMemo(() => {
    const m = buildFromTemplate(template.id, overrides);
    m.material = material;
    return m;
  }, [template.id, overrides, material]);

  const stats = useMemo(() => modelStats(model), [model]);
  const sparks = useMemo(() => generateSparks(sparkSeed, 2), [sparkSeed]);

  // Mirror model + presentation into the world stores (persistent 3D env)
  useEffect(() => { cadModel$.set(model); }, [model]);
  useEffect(() => { cadPresentation$.set(presentation); }, [presentation]);
  useEffect(() => { cadExplode$.set(explode ? 1 : 0); }, [explode]);
  useEffect(() => { cadSection$.set(section ? 0.5 : 0.98); }, [section]);
  // Construction animation runs on each new model — wireframe → geometry
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      cadBuildProgress$.set(1);
      return;
    }
    cadBuildProgress$.set(0);
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / 1400);
      cadBuildProgress$.set(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [model]);

  const powers: PowerRow[] = useMemo(
    () => electronics?.analysis.wiring.powerRequirements ?? [],
    [electronics],
  );

  // First-order physics (instant, always visible in right rail)
  const validation = useMemo(() => validateBuild({ model, powers }), [model, powers]);

  // Industrial-grade validation (drives the VALIDATION tab)
  const industrial = useMemo(
    () => industrialValidation({
      model,
      powers: powers.map(p => ({ component: p.component, voltage: p.voltage, current: p.current })),
      duty,
    }),
    [model, powers, duty],
  );

  const drawing = useMemo(
    () => view === 'docs'
      ? threeViewSVG(model, { title: model.name, material: MATERIALS[material].label })
      : null,
    [view, model, material],
  );
  const bom = useMemo(() => (view === 'docs' ? modelBOM(model) : null), [view, model]);

  useEffect(() => { if (isOpen) { setExported(null); setView('model'); } }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { handleBriefRef.current?.(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); doExport('stl'); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setView('docs'); }
      else if (e.key >= '1' && e.key <= '4') {
        setView((['model', 'wiring', 'validation', 'docs'] as const)[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  const analyzeElectronics = useCallback(async (desc: string) => {
    if (!desc.trim()) return;
    setElecLoading(true);
    setElecError('');
    try {
      const res = await fetch('/api/hardware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Electronics analysis failed');
      setElectronics(await res.json());
    } catch (err: unknown) {
      setElecError(err instanceof Error ? err.message : 'Electronics analysis failed');
    } finally {
      setElecLoading(false);
    }
  }, []);

  function handleBrief() {
    const parsed = parseCADRequest(brief);
    if (parsed.matched) {
      setTemplateId(parsed.templateId);
      setOverrides(parsed.overrides);
      const t = CAD_TEMPLATES.find(x => x.id === parsed.templateId)!;
      setMaterial(t.material);
      setParseNote(`Model: ${t.name}${Object.keys(parsed.overrides).length ? ` · ${Object.keys(parsed.overrides).length} dimension(s) applied` : ''}`);
    } else {
      setParseNote('No CAD template matched — model unchanged. Try "enclosure 90x70x32" or pick a template.');
    }
    if (brief.trim().length > 10) analyzeElectronics(brief);
  }
  const handleBriefRef = useRef(handleBrief);
  handleBriefRef.current = handleBrief;

  function applyQuickBuild(q: typeof QUICK_BUILDS[number]) {
    setTemplateId(q.cad);
    setOverrides({});
    const t = CAD_TEMPLATES.find(x => x.id === q.cad);
    if (t) setMaterial(t.material);
    setBrief(q.brief || q.name);
    setActiveSpark(null);
    setParseNote(`Quick build: ${q.name}`);
    if (q.brief) analyzeElectronics(q.brief);
  }

  function buildSpark(sp: Spark) {
    setTemplateId(sp.cadTemplate);
    setOverrides({});
    const t = CAD_TEMPLATES.find(x => x.id === sp.cadTemplate);
    if (t) setMaterial(t.material);
    setBrief(sp.brief);
    setActiveSpark(sp.id);
    setParseNote(`From Idea Foundry: ${sp.title}`);
    analyzeElectronics(sp.brief);
    setView('model');
  }

  type ExportKind = 'stl' | 'drawing' | 'dxf' | 'bom';
  function doExport(kind: ExportKind) {
    const safe = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (kind === 'stl') setExported(downloadSTL(model));
    if (kind === 'drawing') setExported(downloadText(`${safe}-drawing.svg`, threeViewSVG(model, { title: model.name, material: MATERIALS[material].label })));
    if (kind === 'dxf') setExported(downloadText(`${safe}.dxf`, exportDXF(model), 'application/dxf'));
    if (kind === 'bom') {
      const csv = 'part,qty,material,note\n' + modelBOM(model).map(r => `"${r.part}",${r.qty},"${r.material}","${r.note}"`).join('\n');
      setExported(downloadText(`${safe}-bom.csv`, csv, 'text/csv'));
    }
  }
  const doExportRef = useRef(doExport);
  doExportRef.current = doExport;

  if (!isOpen) return null;

  const statusColor = (s: CheckStatus) => s === 'pass' ? '#6ee7b7' : s === 'warn' ? '#fbbf24' : '#fda4af';
  const domains = Array.from(new Set(industrial.checks.map(c => c.domain)));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(14px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-title"
    >
      <div className="surface-strong relative flex h-[90vh] w-full min-w-0 overflow-hidden" style={{ background: 'rgba(16,16,19,0.97)', maxWidth: 'min(1440px, calc(100vw - 2rem))' }}>
        {/* Header */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--line)', background: 'rgba(16,16,19,0.85)' }}>
          <div className="flex min-w-0 items-baseline gap-3">
            <span id="studio-title" className="shrink-0 text-[13px] font-semibold tracking-[0.08em] text-[color:var(--t1)]">Build Studio</span>
            <span className="hidden truncate text-[11px] text-[color:var(--t3)] lg:inline">one brief → model · wiring · industrial validation · drawing pack</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Duty class */}
            <div className="hidden items-center rounded-full border p-0.5 md:flex" style={{ borderColor: 'var(--line)' }} title="Target duty environment (MIL-STD-810 class)">
              {(Object.keys(DUTY_PROFILES) as DutyClass[]).map(d => (
                <button key={d} onClick={() => setDuty(d)}
                  className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide transition ${duty === d ? 'bg-[rgba(255,90,31,0.12)] text-[color:var(--accent)]' : 'text-[color:var(--t3)] hover:text-[color:var(--t2)]'}`}>
                  {d}
                </button>
              ))}
            </div>
            {/* Presentation modes — the transition itself communicates the change */}
            <div className="hidden lg:flex rounded-full border p-0.5" style={{ borderColor: 'var(--line)' }}>
              {(['realistic', 'wireframe', 'technical', 'xray', 'exploded', 'section', 'blueprint'] as CadPresentation[]).map(m => (
                <button key={m} onClick={() => { setPresentation(m); setExplode(m === 'exploded'); setSection(m === 'section'); }}
                  title={`Presentation: ${m}`}
                  className={`rounded-full px-2.5 py-1 text-[10px] capitalize transition ${presentation === m
                    ? 'bg-[var(--accent-soft)] text-[color:var(--t1)]'
                    : 'text-[color:var(--t3)] hover:text-[color:var(--t2)]'}`}>
                  {m}
                </button>
              ))}
            </div>
            {/* View tabs */}
            <div className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--line)' }}>
              {(['model', 'wiring', 'validation', 'docs'] as const).map((v, i) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-full px-3 py-1 text-[11px] capitalize transition ${view === v ? 'bg-white/[0.08] text-[color:var(--t1)]' : 'text-[color:var(--t3)] hover:text-[color:var(--t2)]'}`}>
                  {v}
                  {v === 'validation' && (industrial.summary.warn + industrial.summary.fail > 0) && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: industrial.summary.fail ? '#fda4af' : '#fbbf24' }} />
                  )}
                  {v === 'wiring' && electronics ? ` · ${electronics.analysis.wiring.connections.length}` : ''}
                  <span className="ml-1 hidden text-[8.5px] text-white/25 xl:inline">{i + 1}</span>
                </button>
              ))}
            </div>
            <button onClick={onClose} className="ghost-btn px-3 py-1 text-[11px]" aria-label="Close Build Studio">Esc ✕</button>
          </div>
        </div>

        {/* ══ Left rail: brief + foundry + parts ══ */}
        <div className="z-0 flex w-64 shrink-0 flex-col overflow-y-auto border-r p-5 pt-16" style={{ borderColor: 'var(--line)' }}>
          <label className="hud-text mb-2">Describe the build</label>
          <div className="flex gap-2">
            <input
              ref={briefRef}
              value={brief}
              onChange={e => setBrief(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBrief(); }}
              placeholder='e.g. "weather station enclosure 90x70x32"'
              className="min-w-0 flex-1 rounded-xl border bg-white/[0.03] px-3 py-2 text-[12.5px] text-[color:var(--t1)] placeholder:text-white/25 focus:outline-none"
              style={{ borderColor: 'var(--line)' }}
            />
            <button onClick={handleBrief} className="btn-accent rounded-xl px-3.5 py-2 text-[11px] tracking-wide">Build</button>
          </div>
          {parseNote && <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--t3)]">{parseNote}</p>}

          {/* Idea Foundry */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label className="hud-text">Idea foundry</label>
              <button onClick={() => setSparkSeed(s => s + 1)} className="ghost-btn px-2 py-0.5 text-[10px]" title="New inventions">↻ remix</button>
            </div>
            <div className="mt-2 space-y-2">
              {sparks.map(sp => (
                <button key={sp.id} onClick={() => buildSpark(sp)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${activeSpark === sp.id
                    ? 'border-[rgba(255,90,31,0.45)] bg-[rgba(255,90,31,0.07)]'
                    : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11.5px] font-medium leading-snug text-[color:var(--t1)]/95">{sp.title}</span>
                    <span className="mt-0.5 shrink-0 font-mono text-[8.5px] text-[color:var(--accent)]" title="Cross-domain novelty">✦{sp.novelty}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--t2)]">{sp.pitch}</p>
                  <p className="mt-1.5 text-[9.5px] leading-relaxed text-[color:var(--t3)]">
                    <span className="text-[color:var(--accent)]/80">angle:</span> {sp.engineeringAngle}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <label className="hud-text mb-2 mt-5">Quick builds</label>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_BUILDS.map(q => (
              <button key={q.name} onClick={() => applyQuickBuild(q)}
                className={`rounded-xl border px-2.5 py-2 text-left transition ${q.cad === template.id && brief.startsWith(q.name)
                  ? 'border-[rgba(255,90,31,0.45)] bg-[rgba(255,90,31,0.09)]'
                  : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'}`}>
                <div className="text-[11px] text-[color:var(--t1)]/90">{q.name}</div>
                <div className="mt-0.5 text-[9.5px] leading-tight text-[color:var(--t3)]">{q.desc}</div>
              </button>
            ))}
          </div>

          <label className="hud-text mb-2 mt-5">Chassis template</label>
          <div className="grid grid-cols-2 gap-1.5">
            {CAD_TEMPLATES.map(t => (
              <button key={t.id}
                onClick={() => { setTemplateId(t.id); setOverrides({}); setMaterial(t.material); }}
                className={`rounded-xl border px-2.5 py-2 text-left text-[11px] transition ${t.id === template.id
                  ? 'border-[rgba(255,90,31,0.45)] bg-[rgba(255,90,31,0.09)] text-[color:var(--t1)]'
                  : 'border-[color:var(--line)] text-[color:var(--t2)] hover:border-[color:var(--line-strong)]'}`}>
                {t.name}
              </button>
            ))}
          </div>

          <label className="hud-text mb-2 mt-5">Parameters</label>
          <div className="space-y-2.5">
            {template.params.map(p => (
              <div key={p.key}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[color:var(--t2)]">{p.label}</span>
                  <span className="font-mono text-[color:var(--t1)]">{overrides[p.key] ?? template.defaults[p.key]}{p.unit}</span>
                </div>
                <input type="range" min={p.min} max={p.max} step={p.step}
                  value={overrides[p.key] ?? template.defaults[p.key]}
                  onChange={e => setOverrides(o => ({ ...o, [p.key]: parseFloat(e.target.value) }))}
                  className="studio-range mt-1 w-full" aria-label={p.label} />
              </div>
            ))}
          </div>

          <label className="hud-text mb-2 mt-5">Material</label>
          <select value={material} onChange={e => setMaterial(e.target.value as MaterialId)}
            className="w-full rounded-xl border bg-white/[0.03] px-3 py-2 text-[12.5px] text-[color:var(--t1)] focus:outline-none"
            style={{ borderColor: 'var(--line)' }}>
            {Object.entries(MATERIALS).map(([id, m]) => (
              <option key={id} value={id}>{m.label} — {m.density} g/cm³</option>
            ))}
          </select>

          {/* Export pack */}
          <label className="hud-text mb-2 mt-6">Export</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => doExport('stl')} className="btn-accent rounded-xl px-2 py-2 text-[11px]">STL ⌘E</button>
            <button onClick={() => doExport('drawing')} className="ghost-btn rounded-xl border px-2 py-2 text-[11px]" style={{ borderColor: 'var(--line)' }}>Drawing ⌘D</button>
            <button onClick={() => doExport('dxf')} className="ghost-btn rounded-xl border px-2 py-2 text-[11px]" style={{ borderColor: 'var(--line)' }}>DXF</button>
            <button onClick={() => doExport('bom')} className="ghost-btn rounded-xl border px-2 py-2 text-[11px]" style={{ borderColor: 'var(--line)' }}>BOM CSV</button>
          </div>
          {exported && <p className="mt-2 text-[11px] text-emerald-300/90">Saved {exported}</p>}
        </div>

        {/* ══ Center: viewport ══ */}
        <div className="relative z-0 min-w-0 flex-1">
          {view === 'model' && (
            <>
              <Canvas camera={{ position: [140, 100, 140], fov: 45, near: 0.5, far: 4000 }} dpr={[1, 2]}>
                <ModelScene model={model} />
              </Canvas>
              <div className="pointer-events-none absolute left-3 top-16 rounded-xl border px-3 py-2 text-[11px] text-[color:var(--t2)]"
                style={{ borderColor: 'var(--line)', background: 'rgba(12,12,14,0.7)', backdropFilter: 'blur(8px)' }}>
                <span className="text-[color:var(--accent)]">{model.name}</span> · drag to orbit · scroll to zoom
              </div>
            </>
          )}

          {view === 'wiring' && (electronics ? (
            <div className="flex h-full flex-col overflow-y-auto p-5 pt-16">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-[color:var(--t1)]/90">{electronics.analysis.wiring.title}</span>
                <span className="text-[10.5px] text-[color:var(--t3)]">{electronics.analysis.wiring.connections.length} connections · {electronics.analysis.components.length} parts</span>
              </div>
              <div className="flex-1 rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.02)' }}
                dangerouslySetInnerHTML={{ __html: electronics.wiringDiagramSVG }} />
              {electronics.analysis.wiring.assemblySteps.length > 0 && (
                <div className="mt-4">
                  <label className="hud-text mb-2">Assembly order</label>
                  <ol className="space-y-1.5">
                    {electronics.analysis.wiring.assemblySteps.slice(0, 8).map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed text-[color:var(--t2)]">
                        <span className="font-mono text-[10px] text-[color:var(--accent)]">{String(i + 1).padStart(2, '0')}</span>{s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
              <div className="text-2xl" style={{ color: 'var(--accent)' }}>⌁</div>
              <p className="max-w-sm text-[13px] leading-relaxed text-[color:var(--t2)]">
                No electronics yet. Describe a project (or tap a quick build) and the wiring diagram,
                bill of materials, and power budget appear here.
              </p>
              {elecError && <p className="text-[11.5px] text-rose-300/80">{elecError}</p>}
            </div>
          ))}

          {view === 'validation' && (
            <div className="h-full overflow-y-auto p-5 pt-16">
              {/* Headline */}
              <div className="rounded-2xl border p-4" style={{ borderColor: industrial.summary.fail ? 'rgba(253,164,175,0.4)' : industrial.summary.warn ? 'rgba(251,191,36,0.35)' : 'rgba(110,231,183,0.35)' }}>
                <div className="flex items-center gap-2">
                  {(['pass', 'warn', 'fail'] as const).map(s => (
                    <span key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color: statusColor(s) }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(s) }} />
                      {industrial.summary[s]} {s}
                    </span>
                  ))}
                  <span className="ml-auto font-mono text-[10px] text-[color:var(--t3)]">duty: {DUTY_PROFILES[duty].label} · {DUTY_PROFILES[duty].cycles.toLocaleString()} cycles · {DUTY_PROFILES[duty].shockG}g · {DUTY_PROFILES[duty].ip}</span>
                </div>
                <p className="mt-2 text-[15px] font-medium text-[color:var(--t1)]">{industrial.headline}</p>
              </div>

              {/* Checks grouped by domain */}
              {domains.map(dom => (
                <div key={dom} className="mt-5">
                  <label className="hud-text">{DOMAIN_LABELS[dom] ?? dom}</label>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 xl:grid-cols-2">
                    {industrial.checks.filter(c => c.domain === dom).map(c => <CheckRow key={c.id} check={c} />)}
                  </div>
                </div>
              ))}

              {/* Unit economics */}
              <div className="mt-6">
                <label className="hud-text">Unit economics</label>
                <div className="mt-2 rounded-2xl border p-4" style={{ borderColor: 'var(--line)' }}>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {industrial.cost.lines.map((l, i) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                          <td className="py-1.5 text-[color:var(--t2)]">{l.item}</td>
                          <td className="py-1.5 text-right font-mono text-[color:var(--t1)]">${l.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="pt-2 text-[11px] text-[color:var(--t1)]">Unit cost</td>
                        <td className="pt-2 text-right font-mono text-[12px] text-[color:var(--t1)]">${industrial.cost.unitTotal.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[['×10 units', industrial.cost.at10], ['×100 units', industrial.cost.at100], ['price @50% margin', industrial.cost.margin50]].map(([k, v]) => (
                      <div key={k as string} className="rounded-xl border px-2 py-2" style={{ borderColor: 'var(--line)' }}>
                        <div className="text-[9.5px] text-[color:var(--t3)]">{k as string}</div>
                        <div className="font-mono text-[12px] text-[color:var(--accent)]">${(v as number).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Manufacturing plan */}
              <div className="mb-4 mt-6">
                <label className="hud-text">Manufacturing plan — gated, with QC hold points</label>
                <div className="mt-2 space-y-2">
                  {industrial.plan.map((ph: PlanPhase, i: number) => (
                    <div key={ph.gate} className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)' }}>
                      <div className="flex items-baseline gap-3">
                        <span className="rounded-lg border px-2 py-0.5 font-mono text-[10px] text-[color:var(--accent)]" style={{ borderColor: 'rgba(255,90,31,0.35)' }}>{ph.gate}</span>
                        <span className="text-[12.5px] font-medium text-[color:var(--t1)]/95">{ph.name}</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {ph.actions.map((a, j) => (
                          <li key={j} className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--t2)]">
                            <span className="text-white/25">·</span>{a}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10.5px] text-[color:var(--t3)]">
                        <span className="text-emerald-300/70">exit:</span> {ph.exitCriteria}
                      </p>
                      {i < industrial.plan.length - 1 && <div className="mt-2 h-px" style={{ background: 'var(--line)' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'docs' && (
            <div className="h-full overflow-y-auto p-5 pt-16">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-[color:var(--t1)]/90">Engineering drawing pack</span>
                <span className="text-[10.5px] text-[color:var(--t3)]">third-angle projection · ASME Y14.5 · ISO 2768-m</span>
              </div>
              {drawing && (
                <div className="rounded-2xl border p-2" style={{ borderColor: 'var(--line)', background: '#121216' }}
                  dangerouslySetInnerHTML={{ __html: drawing }} />
              )}
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <label className="hud-text mb-2">Model BOM</label>
                  <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)' }}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b text-left" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.02)' }}>
                          <th className="px-3 py-2 font-medium text-[color:var(--t3)]">Part</th>
                          <th className="px-3 py-2 font-medium text-[color:var(--t3)]">Material</th>
                          <th className="px-3 py-2 font-medium text-[color:var(--t3)]">Spec</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bom ?? []).map((r, i) => (
                          <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                            <td className="px-3 py-1.5 text-[color:var(--t1)]/90">{r.part}</td>
                            <td className="px-3 py-1.5 text-[color:var(--t2)]">{r.material}</td>
                            <td className="px-3 py-1.5 text-[color:var(--t3)]">{r.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <label className="hud-text mb-2">Interchange</label>
                  <div className="rounded-2xl border p-4 text-[11.5px] leading-relaxed text-[color:var(--t2)]" style={{ borderColor: 'var(--line)' }}>
                    <p><span className="text-[color:var(--t1)]">DXF</span> — import into Fusion 360, FreeCAD, or AutoCAD for feature modelling and CNC paths.</p>
                    <p className="mt-2"><span className="text-[color:var(--t1)]">STL</span> — slice directly (0.2 mm layers, 3 walls, 25% infill for PETG; add 15% for load-bearing parts).</p>
                    <p className="mt-2"><span className="text-[color:var(--t1)]">Drawing SVG</span> — send to a machine shop for quoting; critical dims marked ±0.2 mm.</p>
                    <button onClick={() => doExport('dxf')} className="ghost-btn mt-3 rounded-xl border px-3 py-1.5 text-[11px]" style={{ borderColor: 'var(--line)' }}>⬇ Download DXF</button>
                  </div>
                  {powers.length > 0 && (
                    <div className="mt-4">
                      <label className="hud-text mb-2">Power table</label>
                      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)' }}>
                        <table className="w-full text-[11px]">
                          <tbody>
                            {powers.map((p, i) => (
                              <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                                <td className="px-3 py-1.5 text-[color:var(--t1)]/90">{p.component}</td>
                                <td className="px-3 py-1.5 font-mono text-[color:var(--t3)]">{p.voltage}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-[color:var(--t1)]">{p.current}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══ Right rail: live stats ══ */}
        <div className="z-0 w-60 shrink-0 overflow-y-auto border-l p-5 pt-16" style={{ borderColor: 'var(--line)' }}>
          <label className="hud-text">Model analysis</label>
          <dl className="mt-3 space-y-2 text-[11px]">
            <StatRow label="Parts" value={String(model.shapes.length)} />
            <StatRow label="Volume" value={`${stats.volumeCm3.toFixed(1)} cm³`} />
            <StatRow label="Mass est." value={`${stats.massG.toFixed(0)} g`} sub={MATERIALS[material].label} />
            <StatRow label="Size" value={`${stats.boundingBoxMm.x.toFixed(0)}×${stats.boundingBoxMm.y.toFixed(0)}×${stats.boundingBoxMm.z.toFixed(0)} mm`} />
          </dl>

          {(elecLoading || electronics) && (
            <>
              <label className="hud-text mb-2 mt-5">Electronics</label>
              {elecLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-[color:var(--t3)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--accent)]" />
                  Analyzing components · power · wiring…
                </div>
              ) : electronics ? (
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
                  <div className="text-[11.5px] text-[color:var(--t1)]/90">{electronics.analysis.name}</div>
                  <div className="mt-1 text-[10px] text-[color:var(--t3)]">
                    {electronics.analysis.components.length} parts · {electronics.analysis.estimatedCost} · {electronics.analysis.estimatedTime}
                  </div>
                  <button onClick={() => setView('wiring')} className="ghost-btn mt-2 px-2.5 py-1 text-[10px]">
                    View wiring →
                  </button>
                </div>
              ) : null}
            </>
          )}

          {/* First-order physics (instant) */}
          <label className="hud-text mb-2 mt-5">Quick physics</label>
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="flex items-center gap-1.5">
              {(['pass', 'warn', 'fail'] as const).map(s => (
                <span key={s} className="flex items-center gap-1 text-[10px]" style={{ color: statusColor(s) }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(s) }} />
                  {validation.summary[s]}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] font-medium text-[color:var(--t1)]/90">{validation.headline}</p>
            <button onClick={() => setView('validation')} className="ghost-btn mt-2 px-2.5 py-1 text-[10px]">
              Full industrial review → {industrial.summary.warn + industrial.summary.fail > 0 ? '⚠' : '✓'}
            </button>
          </div>

          <p className="mt-3 text-[9.5px] leading-relaxed text-white/20">
            First-order engineering estimates (beam bending, natural convection, rail budgets, MIL-STD-810 envelopes) — catch bad designs early; verify critical parts with FEA/SPICE and a licensed PE for load-bearing use.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <dt className="text-[color:var(--t3)] text-[11px]">{label}</dt>
        <dd className="font-mono text-[color:var(--t1)] text-[11px]">{value}</dd>
      </div>
      {sub && <p className="text-right text-[9.5px] text-white/20">{sub}</p>}
    </div>
  );
}
