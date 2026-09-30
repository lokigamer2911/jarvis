'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AssistantProvider, useAssistant } from '@/lib/assistant-provider';
import AutoRecon from '@/components/AutoRecon';
import BootSequence from '@/components/BootSequence';
import AICore from '@/components/AICore';
import ToolResultCard from '@/components/ToolResultCard';
import PermissionDialog from '@/components/PermissionDialog';
import AssistantSettings from '@/components/AssistantSettings';
import MemoryPanel from '@/components/MemoryPanel';
import SystemDashboard from '@/components/SystemDashboard';
import BuildStudio from '@/components/BuildStudio';
import ComputerUseConsole from '@/components/ComputerUseConsole';
import { VoiceDiagnosticsButton } from '@/components/VoiceDiagnostics';
import { Mark3D } from '@/components/Holo3D';
import { STATE_LABELS, AssistantState } from '@/lib/assistant-state';
import { worldState, useWorldState } from '@/lib/scene-state';
import { SceneHudBridge } from '@/components/scene/SceneHudBridge';
import { COLORS } from '@/lib/visual-theme';

// ═══════════════════════════════════════════════════════════════
// J.A.R.V.I.S. V2 — the spatial operating environment.
// One persistent 3D world. Modules are operational states of the same
// machine: opening Recon/CAD/System transforms the world — camera,
// lighting, particles, grid — it is never a page swap.
// ═══════════════════════════════════════════════════════════════

export default function JarvisPage() {
  return (
    <AssistantProvider>
      <JarvisShell />
    </AssistantProvider>
  );
}

function JarvisShell() {
  const assistant = useAssistant();
  const {
    state, error, clearError, messages, submitText, partialTranscript, lastResponse,
    micLevel, voiceSupported, ttsSupported, pushToTalkActive, togglePushToTalk,
    handsFreeStatus, toggleHandsFree, interruptSpeaking, activeAgents,
    workingNotes, refreshNotes, taskLedger, contextMeter, lastModels,
  } = assistant;

  const worldWs = useWorldState();

  const [mounted, setMounted] = useState(false);
  const [booting, setBooting] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [computerOpen, setComputerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [inputText, setInputText] = useState('');

  const [clock, setClock] = useState('');
  const [dateStr, setDateStr] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const handleBootComplete = useCallback(() => setBooting(false), []);
  useEffect(() => {
    if (!booting) return;
    const t = setTimeout(() => setBooting(false), 5000);
    return () => clearTimeout(t);
  }, [booting]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const open = () => setStudioOpen(true);
    window.addEventListener('jarvis:open-cad', open);
    return () => window.removeEventListener('jarvis:open-cad', open);
  }, []);

  // The world follows the module layer: only one module open at a time.
  // Closing a module returns ownership to home.
  useEffect(() => {
    if (reconOpen) worldState.setModule('recon');
    else if (studioOpen) worldState.setModule('cad');
    else if (memoryOpen) worldState.setModule('memory');
    else if (dashboardOpen) worldState.setModule('system');
    else if (computerOpen) worldState.setModule('computer');
    else if (settingsOpen) worldState.setModule('settings');
    else worldState.setModule('home');
  }, [reconOpen, studioOpen, memoryOpen, dashboardOpen, computerOpen, settingsOpen]);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setDateStr(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase());
    };
    update();
    const i = setInterval(update, 20000);
    return () => clearInterval(i);
  }, []);

  // Global shortcuts: Escape closes panels; Space is push-to-talk
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        else if (computerOpen) setComputerOpen(false);
        else if (logOpen) setLogOpen(false);
        else if (memoryOpen) setMemoryOpen(false);
        else if (dashboardOpen) setDashboardOpen(false);
        else if (studioOpen) setStudioOpen(false);
      }
      if (e.code === 'Space' && !settingsOpen && !computerOpen && !logOpen
        && document.activeElement?.tagName !== 'INPUT'
        && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        togglePushToTalk();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen, memoryOpen, dashboardOpen, studioOpen, computerOpen, logOpen, togglePushToTalk]);

  // Waveform — idle shimmer
  const waveBars = 72;
  const waveLevels = useMemo(() => Array.from({ length: waveBars }, (_, i) => i), [waveBars]);
  function waveHeight(i: number): number {
    const t = performance.now() / 1000;
    const bell = Math.exp(-Math.pow((i - waveBars / 2) / (waveBars / 3.2), 2));
    if (state === 'listening') return 0.1 + micLevel * (0.32 + 0.55 * Math.abs(Math.sin(t * 6 + i * 0.5))) * bell;
    if (state === 'speaking') return 0.12 + Math.abs(Math.sin(t * 9 + i * 0.35)) * 0.62 * bell;
    if (state === 'thinking' || state === 'processing' || state === 'planning')
      return 0.07 + Math.abs(Math.sin(t * 2.2 + i * 0.8)) * 0.3 * bell;
    return 0.035 + Math.abs(Math.sin(t * 0.9 + i * 0.25)) * 0.06 * bell;
  }
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state === 'idle' || state === 'success') return;
    const i = setInterval(() => setTick(n => n + 1), 33);
    return () => clearInterval(i);
  }, [state]);

  // ── The last exchange (ephemeral HUD) ──
  const lastUser = useMemo(() => [...messages].reverse().find(m => m.role === 'user'), [messages]);
  const lastAi = useMemo(() => [...messages].reverse().find(m => m.role === 'jarvis'), [messages]);
  const lastCard = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].card) return { card: messages[i].card!, data: messages[i].cardData };
    }
    return null;
  }, [messages]);

  const recentNotes = useMemo(() => [...workingNotes].reverse().slice(0, 6), [workingNotes]);

  if (!mounted) return <div className="fixed inset-0" style={{ background: 'var(--bg)' }} />;

  const busy = state === 'thinking' || state === 'processing' || state === 'planning' || state === 'executing';

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Working late, sir?' : hour < 12 ? 'Good morning, sir' : hour < 17 ? 'Good afternoon, sir' : hour < 22 ? 'Good evening, sir' : 'Working late, sir?';

  const meterColor = contextMeter.zone === 'critical' ? COLORS.error
    : contextMeter.zone === 'elevated' ? COLORS.warning : 'rgba(232,237,242,0.35)';

  const send = () => {
    const t = inputText.trim();
    if (!t || busy) return;
    submitText(t);
    setInputText('');
  };

  return (
    <div className="fixed inset-0" style={{ background: 'var(--bg)' }}>
      {/* ═══ THE PERSISTENT WORLD (never unmounts) ═══ */}
      <AICore state={state} micLevel={micLevel} activeAgents={activeAgents} />
      {/* CSS environment layers in lockstep with the world */}
      <div className="grading" aria-hidden="true" />
      <div className="state-wash" data-mode={state} aria-hidden="true" />
      <div className="scanfield" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <SceneHudBridge />

      <AnimatePresence>
        {booting && <BootSequence onComplete={handleBootComplete} />}
      </AnimatePresence>

      {/* ═══ TOP BAR — module + state + clock ═══ */}
      <header className="hud-top">
        <div className="flex items-center gap-3">
          <Mark3D kind="core" size={18} hue={195} speed={7} />
          <span className="hud-brand">J.A.R.V.I.S.</span>
          <span className="hidden md:inline-flex items-center gap-2 h-6 px-2.5 rounded-full border" style={{ borderColor: 'var(--line)' }}>
            <span className={`status-dot ${stateDotClass(state)}`} style={{ color: stateDotColor(state) }} />
            <span className="hud-text text-[9px]">{STATE_LABELS[state]}</span>
          </span>
        </div>

        {/* Active environment readout */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="hud-text text-[9px]" style={{ color: 'var(--t3)' }}>[ ENV ]</span>
          <span className="hud-text text-[9px]" style={{ color: 'var(--accent)' }}>{worldWs.toUpperCase()}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="ctx-pill hidden md:inline-flex" title={`Cognition load: ${contextMeter.usedTokens.toLocaleString()} / ${contextMeter.totalTokens.toLocaleString()} tokens`}>
            <span className="hud-text text-[8px]">COG</span>
            <div className="w-14 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(232,237,242,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, contextMeter.pct)}%`, background: meterColor }} />
            </div>
          </div>
          <span className="hud-text text-[10px] hidden lg:inline">{clock} · {dateStr}</span>
          <VoiceDiagnosticsButton voiceSupported={voiceSupported} ttsSupported={ttsSupported} />
        </div>
      </header>

      {/* Error toast */}
      <AnimatePresence>
        {error != null && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] rounded-2xl px-4 py-3 max-w-md w-[92vw] md:w-auto backdrop-blur-xl border"
            style={{ borderColor: 'rgba(229,107,120,0.3)', background: 'rgba(28,13,16,0.88)' }} role="alert">
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--status-error)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium" style={{ color: '#F6C9CE' }}>{error.title}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'rgba(246,201,206,0.55)' }}>{error.message}</div>
              </div>
              {error.retry && (
                <button onClick={() => { clearError(); error.retry!(); }}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-full border text-[#F6C9CE] hover:bg-rose-300/10 transition-colors shrink-0"
                  style={{ borderColor: 'rgba(229,107,120,0.25)' }}>Retry</button>
              )}
              <button onClick={clearError} aria-label="Dismiss" className="text-[14px] leading-none mt-0.5" style={{ color: 'rgba(246,201,206,0.5)' }}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ STAGE — the world is the stage; HUD flanks it ═══ */}
      <main className="hud-stage">
        {/* LEFT TELEMETRY */}
        <section className="hud-wing hud-wing-l" aria-label="System telemetry">
          <HudPanel eyebrow="CORE STATUS">
            <div className="hud-kv"><span>Power</span><b style={{ color: 'var(--status-success)' }}>NOMINAL</b></div>
            <div className="hud-kv"><span>Mesh</span><b>{lastModels.length > 0 ? `${lastModels.length} ONLINE` : 'STANDBY'}</b></div>
            <div className="hud-kv"><span>Agents</span><b>{activeAgents.primary.length || '—'}</b></div>
          </HudPanel>

          <HudPanel eyebrow="HOUSEKEEPING">
            {recentNotes.length === 0 ? (
              <div className="hud-note-empty">Log empty. Tasks will record here.</div>
            ) : recentNotes.map(n => (
              <div key={n.id} className="hud-note">
                <span className="hud-note-dot" style={{
                  background: n.kind === 'decision' ? 'var(--halo-speak)' : n.kind === 'finding' ? 'var(--status-success)' : 'var(--accent)',
                }} />
                <span className="hud-note-text">{n.text}</span>
              </div>
            ))}
            <button className="hud-more" onClick={() => { refreshNotes(); setLogOpen(true); }}>FULL LOG →</button>
          </HudPanel>
        </section>

        {/* CENTER — the core lives in the world behind */}
        <div className="hud-center">
          <div className="hud-reticle" data-busy={busy || undefined} aria-hidden="true">
            <svg viewBox="0 0 200 200" className="hud-reticle-svg">
              <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(232,237,242,0.10)" strokeWidth="0.6" />
              <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(232,237,242,0.06)" strokeWidth="0.5" strokeDasharray="2 6" />
              {Array.from({ length: 36 }, (_, i) => i * 10).map(deg => (
                <line key={deg}
                  x1={100 + 92 * Math.cos((deg * Math.PI) / 180)}
                  y1={100 + 92 * Math.sin((deg * Math.PI) / 180)}
                  x2={100 + 96 * Math.cos((deg * Math.PI) / 180)}
                  y2={100 + 96 * Math.sin((deg * Math.PI) / 180)}
                  stroke="rgba(232,237,242,0.16)" strokeWidth="0.7" />
              ))}
              <path d="M 30 52 L 30 30 L 52 30" fill="none" stroke="var(--accent-line)" strokeWidth="1" />
              <path d="M 148 30 L 170 30 L 170 52" fill="none" stroke="var(--accent-line)" strokeWidth="1" />
              <path d="M 170 148 L 170 170 L 148 170" fill="none" stroke="var(--accent-line)" strokeWidth="1" />
              <path d="M 52 170 L 30 170 L 30 148" fill="none" stroke="var(--accent-line)" strokeWidth="1" />
            </svg>
          </div>

          {/* spacer preserving the orb's stage space — the orb itself is 3D behind */}
          <div className="relative w-[min(66vw,430px)] h-[min(66vw,430px)] flex items-center justify-center" />

          {/* Exchange readout — ephemeral, below the orb */}
          <div className="hud-exchange">
            <AnimatePresence mode="wait">
              {partialTranscript ? (
                <motion.p key="pt" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="hud-heard">“{partialTranscript}”</motion.p>
              ) : busy && taskLedger.length > 0 ? (
                <motion.div key="ledger" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="hud-ledger">
                  {taskLedger.map(s => (
                    <div key={s.id} className="hud-ledger-row">
                      <span className="hud-ledger-dot" style={{
                        background: s.status === 'done' ? 'var(--status-success)' : s.status === 'failed' ? 'var(--status-error)' : s.status === 'running' ? 'var(--accent)' : 'transparent',
                        borderColor: s.status === 'pending' ? 'var(--line)' : 'transparent',
                      }}>
                        {s.status === 'done' && '✓'}
                      </span>
                      <span style={{ color: s.status === 'pending' ? 'var(--t3)' : 'var(--t1)' }}>{s.label}</span>
                    </div>
                  ))}
                </motion.div>
              ) : lastAi && (state === 'speaking' || state === 'success' || state === 'idle') ? (
                <motion.div key="ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <p className="hud-response">{lastAi.text.slice(0, 300)}{lastAi.text.length > 300 ? '…' : ''}</p>
                  <div className="flex items-center justify-center gap-2 mt-2.5">
                    {lastAi.modelsUsed?.slice(0, 3).map(m => (
                      <span key={m} className="hud-model-tag">{m.split('/').pop()}</span>
                    ))}
                    {state === 'speaking' && (
                      <button onClick={interruptSpeaking} className="hud-mini-btn">STOP VOICE</button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                  <h1 className="hud-greeting">{greeting}</h1>
                  <p className="hud-sub">
                    {handsFreeStatus === 'sleeping'
                      ? 'HANDS-FREE ARMED — SAY “JARVIS”'
                      : busy ? 'WORKING…' : 'AWAITING YOUR COMMAND'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tool card (contextual result) */}
            {lastCard && !busy && state !== 'listening' && (
              <div className="mt-4 max-w-md mx-auto hud-animate-in">
                <ToolResultCard card={lastCard.card} data={lastCard.data} />
              </div>
            )}
          </div>

          {/* Waveform */}
          <div className="flex items-end justify-center gap-[2px] h-6 mt-6 px-8 max-w-xl w-full" aria-hidden="true">
            {waveLevels.map(i => {
              const h = waveHeight(i);
              const active = state === 'listening' || state === 'speaking';
              return (
                <div key={i} className="wave-bar flex-1" style={{
                  height: `${Math.max(2, h * 100)}%`, minWidth: '2px',
                  background: active ? 'rgba(159,232,255,0.55)' : 'rgba(232,237,242,0.14)',
                }} />
              );
            })}
          </div>
        </div>

        {/* RIGHT — TASKS + MODULES */}
        <section className="hud-wing hud-wing-r" aria-label="Tasks and modules">
          <HudPanel eyebrow="CURRENT TASK">
            {busy ? (
              <>
                <div className="hud-kv"><span>Protocol</span><b>AUTO</b></div>
                {lastModels.length > 0 && (
                  <div className="hud-kv-col">
                    <span>Mesh</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {lastModels.slice(0, 3).map(m => <span key={m} className="hud-model-tag">{m.split('/').pop()}</span>)}
                    </div>
                  </div>
                )}
                {taskLedger.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {taskLedger.map(s => (
                      <div key={s.id} className="hud-ledger-row text-[11px]">
                        <span className="hud-ledger-dot" style={{
                          background: s.status === 'done' ? 'var(--status-success)' : s.status === 'running' ? 'var(--accent)' : 'transparent',
                          borderColor: s.status === 'pending' ? 'var(--line)' : 'transparent',
                        }}>{s.status === 'done' && '✓'}</span>
                        <span style={{ color: s.status === 'pending' ? 'var(--t3)' : 'var(--t1)' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="hud-note-empty">No active task. Standing by.</div>
            )}
          </HudPanel>

          <HudPanel eyebrow="MODULES">
            <div className="hud-modules">
              <ModuleBtn label="COMPUTER" active={computerOpen} onClick={() => setComputerOpen(v => !v)} />
              <ModuleBtn label="RECON" active={reconOpen} onClick={() => setReconOpen(v => !v)} />
              <ModuleBtn label="BUILD" active={studioOpen} onClick={() => setStudioOpen(v => !v)} />
              <ModuleBtn label="DASHBOARD" active={dashboardOpen} onClick={() => setDashboardOpen(v => !v)} />
              <ModuleBtn label="MEMORY" active={memoryOpen} onClick={() => setMemoryOpen(v => !v)} />
              <ModuleBtn label="SETTINGS" active={settingsOpen} onClick={() => setSettingsOpen(v => !v)} />
            </div>
          </HudPanel>
        </section>
      </main>

      {/* ═══ COMMAND LINE (not a chat box) ═══ */}
      <footer className="hud-cmdline">
        <button onClick={togglePushToTalk} title={pushToTalkActive ? 'Stop listening (Space)' : 'Voice input (Space)'}
          aria-pressed={pushToTalkActive} className="icon-action"
          data-active={pushToTalkActive || undefined}
          data-danger={error?.code === 'MICROPHONE_PERMISSION_DENIED' || undefined}>
          <MicGlyph />
        </button>

        <form onSubmit={e => { e.preventDefault(); send(); }} className="composer flex-1 min-w-0">
          <span className="hud-prompt">›</span>
          <input
            ref={inputRef} type="text" value={inputText} onChange={e => setInputText(e.target.value)}
            placeholder={handsFreeStatus === 'sleeping' ? 'say “jarvis”…' : 'command…'}
            disabled={busy} aria-label="Command"
          />
          <button type="submit" disabled={!inputText.trim() || busy} aria-label="Execute"
            className="icon-action btn-accent disabled:opacity-25" style={{ border: 'none', width: 34, height: 34 }}>
            <SendGlyph />
          </button>
        </form>

        <button onClick={toggleHandsFree} title={handsFreeStatus === 'off' ? 'Hands-free (wake word)' : 'Disable hands-free'}
          aria-pressed={handsFreeStatus !== 'off'} className="icon-action"
          data-warn={handsFreeStatus !== 'off' || undefined}>
          <span className="text-[15px] leading-none">∞</span>
        </button>
      </footer>

      {/* ═══ FULL LOG DRAWER ═══ */}
      <AnimatePresence>
        {logOpen && (
          <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="absolute right-0 top-0 h-full w-[400px] max-w-[92vw] flex flex-col z-50 border-l"
            style={{ borderColor: 'var(--line)', background: 'rgba(8,12,17,0.92)', backdropFilter: 'blur(32px)' }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <div className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>Housekeeping Log</div>
                <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--t3)' }}>{workingNotes.length} entries · auto-recorded</div>
              </div>
              <button onClick={() => setLogOpen(false)} aria-label="Close" className="dialog-close">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {workingNotes.length === 0 ? (
                <div className="text-center text-[12.5px] mt-12" style={{ color: 'var(--t3)' }}>
                  Log empty. Every delegated task writes here automatically.
                </div>
              ) : [...workingNotes].reverse().map(n => (
                <div key={n.id} className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--bg-raised)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8.5px] tracking-[0.18em] font-semibold px-1.5 py-0.5 rounded-full border"
                      style={{
                        borderColor: 'var(--line)',
                        color: n.kind === 'decision' ? 'var(--halo-speak)' : n.kind === 'finding' ? 'var(--status-success)' : 'var(--t3)',
                      }}>{n.kind.toUpperCase()}</span>
                    <span className="text-[9.5px]" style={{ color: 'var(--t3)' }}>
                      {new Date(n.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-snug" style={{ color: 'var(--t1)' }}>{n.text}</p>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Panels — module workspaces over the world */}
      <AutoRecon isOpen={reconOpen} onClose={() => setReconOpen(false)} />
      <BuildStudio isOpen={studioOpen} onClose={() => setStudioOpen(false)} />
      <MemoryPanel isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <SystemDashboard isOpen={dashboardOpen} onClose={() => setDashboardOpen(false)} />
      <ComputerUseConsole open={computerOpen} onClose={() => setComputerOpen(false)} />
      <PermissionDialog />
      <AssistantSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ── HUD building blocks ──────────────────────────────────────

function HudPanel({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel2">
      <div className="hud-panel2-eyebrow">{eyebrow}</div>
      <div className="hud-panel2-body">{children}</div>
    </div>
  );
}

function ModuleBtn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className="hud-module" onClick={onClick} data-on={active || undefined} aria-pressed={active}>
      <Mark3D kind="prism" size={13} hue={195} speed={11} />
      <span>{label}</span>
    </button>
  );
}

// ── Glyphs ───────────────────────────────────────────────────

function MicGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

// ── State → dot (semantic palette) ───────────────────────────

function stateDotClass(state: AssistantState): string {
  switch (state) {
    case 'listening': return '';
    case 'processing': case 'thinking': case 'planning': return '';
    case 'executing': return '';
    case 'speaking': return '';
    case 'success': return '';
    case 'error': return '';
    default: return '';
  }
}

function stateDotColor(state: AssistantState): string {
  switch (state) {
    case 'listening': return '#78DFFF';
    case 'processing': case 'thinking': case 'planning': return '#28B8D9';
    case 'executing': return '#B7A9F5';
    case 'speaking': return '#B7A9F5';
    case 'success': return '#63D6A0';
    case 'error': return '#E56B78';
    default: return 'rgba(232,237,242,0.4)';
  }
}
