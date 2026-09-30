'use client';

/**
 * System Dashboard — real system metrics via Electron IPC + browser fallback.
 * Only displays data that can actually be obtained; never fakes metrics.
 *
 * Electron: uses window.electronAPI for real CPU/RAM/network.
 * Browser: uses performance.memory, navigator.hardwareConcurrency, navigator.onLine.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { systemMetrics$ } from '@/lib/module-store';
import type { SystemMetrics } from './SystemDashboard-types';

interface SystemDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SystemDashboard({ isOpen, onClose }: SystemDashboardProps) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<SystemMetrics[]>([]);
  const [refreshInterval, setRefreshInterval] = useState(2000);
  const [showGraph, setShowGraph] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check for Electron API
  const hasElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Collect metrics
  const collectMetrics = useCallback(async (): Promise<SystemMetrics> => {
    // CPU
    let cpu = { cores: navigator.hardwareConcurrency || 0, usage: null as number | null, model: 'Unknown' };
    if (hasElectron) {
      try {
        const data = await (window as any).electronAPI.getSystemInfo();
        if (data?.cpu) {
          cpu = {
            cores: data.cpu.cores || cpu.cores,
            usage: data.cpu.usage ?? null,
            model: data.cpu.model || cpu.model,
          };
        }
      } catch { /* fallback to browser */ }
    }

    // Memory
    let memory = { usedMB: 0, totalMB: 0, limitMB: 0, usagePercent: 0 };
    if (hasElectron) {
      try {
        const data = await (window as any).electronAPI.getSystemInfo();
        if (data?.memory) {
          memory = {
            usedMB: Math.round((data.memory.used || 0) / 1048576),
            totalMB: Math.round((data.memory.total || 0) / 1048576),
            limitMB: Math.round((data.memory.limit || 0) / 1048576),
            usagePercent: data.memory.total ? Math.round((data.memory.used / data.memory.total) * 100) : 0,
          };
        }
      } catch { /* fallback */ }
    }
    // Browser fallback
    if (memory.totalMB === 0) {
      const perfMem = (performance as any).memory;
      if (perfMem) {
        memory = {
          usedMB: Math.round(perfMem.usedJSHeapSize / 1048576),
          totalMB: 0,
          limitMB: Math.round(perfMem.jsHeapSizeLimit / 1048576),
          usagePercent: Math.round((perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit) * 100),
        };
      } else {
        const deviceMem = (navigator as any).deviceMemory;
        memory = {
          usedMB: 0,
          totalMB: deviceMem ? deviceMem * 1024 : 0,
          limitMB: 0,
          usagePercent: 0,
        };
      }
    }

    // Network
    const conn = (navigator as any).connection;
    const network = {
      online: navigator.onLine,
      downlink: conn?.downlink ?? null,
      effectiveType: conn?.effectiveType || 'unknown',
      rtt: conn?.rtt ?? null,
    };

    // Disk (only available via Electron)
    let disk = null;
    if (hasElectron) {
      try {
        const data = await (window as any).electronAPI.getSystemInfo();
        if (data?.disk) {
          disk = {
            usedGB: Math.round((data.disk.used || 0) / 1073741824),
            totalGB: Math.round((data.disk.total || 0) / 1073741824),
            usagePercent: data.disk.total ? Math.round((data.disk.used / data.disk.total) * 100) : 0,
          };
        }
      } catch { /* unavailable */ }
    }

    // GPU (WebGL)
    let gpu = null;
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpu = {
            model: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          };
        }
      }
    } catch { /* unavailable */ }

    // Session
    const session = {
      uptime: Math.floor(performance.now() / 1000),
      pageLoadTime: Math.round(performance.timing?.domContentLoadedEventEnd - performance.timing?.navigationStart) || 0,
    };

    return { cpu, memory, network, disk, gpu, session };
  }, [hasElectron]);

  // Update metrics
  const updateMetrics = useCallback(async () => {
    const newMetrics = await collectMetrics();
    setMetrics(newMetrics);
    setHistory(prev => [...prev.slice(-59), newMetrics]); // Keep last 60 samples
    systemMetrics$.set(newMetrics); // → spatial rings react to REAL data
  }, [collectMetrics]);

  // Start/stop refresh
  useEffect(() => {
    if (!isOpen) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    updateMetrics();
    intervalRef.current = setInterval(updateMetrics, refreshInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, refreshInterval, updateMetrics]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,4,8,0.88)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sysdash-title"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="dialog-shell w-[92vw] max-w-5xl max-h-[86vh] flex flex-col relative"
          >
            {/* Header */}
            <div className="dialog-head">
              <div className="min-w-0">
                <div className="dialog-eyebrow">Telemetry · live metrics</div>
                <div id="sysdash-title" className="dialog-title mt-1">System Dashboard</div>
                <div className="dialog-sub mt-1">
                  {hasElectron ? 'Electron IPC · real metrics' : 'Browser APIs · limited data'}
                  {metrics?.network.online ? ' · online' : ' · offline'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={refreshInterval}
                  onChange={e => setRefreshInterval(parseInt(e.target.value))}
                  className="rounded-xl border bg-white/[0.03] px-2 py-1.5 font-mono text-[10px] text-[color:var(--t2)] focus:outline-none"
                  style={{ borderColor: 'var(--line)' }}
                  aria-label="Refresh interval"
                >
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                </select>
                <button
                  onClick={() => setShowGraph(!showGraph)}
                  className={`pill-btn px-2.5 py-1.5 text-[10px] ${showGraph ? 'text-[color:var(--t1)] border-[color:var(--line-strong)]' : ''}`}
                  aria-label="Toggle graph"
                  aria-pressed={showGraph}
                >
                  Graph
                </button>
                <button
                  onClick={onClose}
                  className="dialog-close"
                  aria-label="Close dashboard"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {metrics ? (
                <div className="space-y-4">
                  {/* Quick stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard
                      label="CPU"
                      value={metrics.cpu.usage !== null ? `${metrics.cpu.usage}%` : `${metrics.cpu.cores} CORES`}
                      sub={metrics.cpu.model !== 'Unknown' ? metrics.cpu.model : undefined}
                      percent={metrics.cpu.usage}
                      color="cyan"
                    />
                    <MetricCard
                      label="MEMORY"
                      value={metrics.memory.usagePercent > 0 ? `${metrics.memory.usagePercent}%` : `${metrics.memory.usedMB || '–'} MB`}
                      sub={metrics.memory.limitMB > 0 ? `${metrics.memory.limitMB} MB LIMIT` : undefined}
                      percent={metrics.memory.usagePercent}
                      color="emerald"
                    />
                    <MetricCard
                      label="NETWORK"
                      value={metrics.network.online ? 'ONLINE' : 'OFFLINE'}
                      sub={metrics.network.downlink ? `${metrics.network.downlink} Mbps` : undefined}
                      percent={null}
                      color={metrics.network.online ? 'emerald' : 'red'}
                    />
                    <MetricCard
                      label="SESSION"
                      value={formatUptime(metrics.session.uptime)}
                      sub={metrics.session.pageLoadTime > 0 ? `LOAD: ${metrics.session.pageLoadTime}ms` : undefined}
                      percent={null}
                      color="violet"
                    />
                  </div>

                  {/* Graph */}
                  {showGraph && history.length > 1 && (
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">CPU USAGE HISTORY</div>
                      <div className="h-24 flex items-end gap-px">
                        {history.map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-white/25/30 rounded-t min-h-[2px]"
                            style={{ height: `${h.cpu.usage ?? 10}%` }}
                            title={`${h.cpu.usage ?? '–'}%`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed sections */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CPU Detail */}
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">CPU</div>
                      <div className="space-y-2">
                        <DetailRow label="Cores" value={String(metrics.cpu.cores)} />
                        <DetailRow label="Usage" value={metrics.cpu.usage !== null ? `${metrics.cpu.usage}%` : 'UNAVAILABLE'} />
                        <DetailRow label="Model" value={metrics.cpu.model} />
                      </div>
                    </div>

                    {/* Memory Detail */}
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">MEMORY</div>
                      <div className="space-y-2">
                        <DetailRow label="Used" value={`${metrics.memory.usedMB} MB`} />
                        <DetailRow label="Total" value={metrics.memory.totalMB > 0 ? `${metrics.memory.totalMB} MB` : 'UNAVAILABLE'} />
                        <DetailRow label="Limit" value={`${metrics.memory.limitMB} MB`} />
                        <DetailRow label="Usage" value={`${metrics.memory.usagePercent}%`} />
                      </div>
                    </div>

                    {/* Network Detail */}
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">NETWORK</div>
                      <div className="space-y-2">
                        <DetailRow label="Status" value={metrics.network.online ? 'ONLINE' : 'OFFLINE'} />
                        <DetailRow label="Downlink" value={metrics.network.downlink ? `${metrics.network.downlink} Mbps` : 'UNAVAILABLE'} />
                        <DetailRow label="Type" value={metrics.network.effectiveType} />
                        <DetailRow label="RTT" value={metrics.network.rtt !== null ? `${metrics.network.rtt}ms` : 'UNAVAILABLE'} />
                      </div>
                    </div>

                    {/* GPU Detail */}
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">GPU</div>
                      {metrics.gpu ? (
                        <div className="space-y-2">
                          <DetailRow label="Model" value={metrics.gpu.model} />
                          <DetailRow label="Vendor" value={metrics.gpu.vendor} />
                        </div>
                      ) : (
                        <div className="text-[10px] text-[color:var(--t3)]">UNAVAILABLE</div>
                      )}
                    </div>
                  </div>

                  {/* Disk (Electron only) */}
                  {metrics.disk && (
                    <div className="hud-panel rounded p-4">
                      <div className="hud-text text-[8px] mb-3">DISK</div>
                      <div className="grid grid-cols-3 gap-4">
                        <DetailRow label="Used" value={`${metrics.disk.usedGB} GB`} />
                        <DetailRow label="Total" value={`${metrics.disk.totalGB} GB`} />
                        <DetailRow label="Usage" value={`${metrics.disk.usagePercent}%`} />
                      </div>
                      {metrics.disk.usagePercent > 0 && (
                        <div className="mt-3 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              metrics.disk.usagePercent > 90 ? 'bg-red-500' :
                              metrics.disk.usagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${metrics.disk.usagePercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-[color:var(--t3)] text-[10px] mt-12">
                  <div className="mb-3 text-lg text-[color:var(--t3)]">[ ⏳ ]</div>
                  <p>COLLECTING METRICS…</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/10">
              <div className="text-[8px] text-[color:var(--t3)]">
                {hasElectron ? 'ELECTRON MODE · FULL ACCESS' : 'BROWSER MODE · LIMITED'}
              </div>
              <div className="text-[8px] text-[color:var(--t3)]">ESC TO CLOSE</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Helper components ────────────────────────────────────────

function MetricCard({ label, value, sub, percent, color }: {
  label: string;
  value: string;
  sub?: string;
  percent: number | null;
  color: string;
}) {
  return (
    <div className="metric-card">
      <div className="field-label mb-1.5">{label}</div>
      <div className="font-display text-[19px] font-semibold tracking-tight text-[color:var(--t1)]">{value}</div>
      {sub && <div className="mt-1 truncate font-mono text-[9.5px] text-[color:var(--t3)]">{sub}</div>}
      {percent !== null && percent > 0 && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background: percent > 90 ? '#fda4af' : percent > 70 ? '#fbbf24' : '#6ee7b7',
            }}
          />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="hud-text text-[8px]">{label}</div>
      <div className="hud-value text-[10px] truncate max-w-[60%] text-right">{value}</div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
