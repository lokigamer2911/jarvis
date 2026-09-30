/**
 * Shared system-metrics contract — consumed by SystemDashboard.tsx (HUD)
 * and the persistent 3D world (spatial telemetry rings). Real data only.
 */

export interface SystemMetrics {
  cpu: {
    cores: number;
    usage: number | null; // percentage, null if unavailable
    model: string;
  };
  memory: {
    usedMB: number;
    totalMB: number;
    limitMB: number;
    usagePercent: number;
  };
  network: {
    online: boolean;
    downlink: number | null; // Mbps, null if unavailable
    effectiveType: string;
    rtt: number | null; // ms
  };
  disk: {
    usedGB: number;
    totalGB: number;
    usagePercent: number;
  } | null; // null if unavailable
  gpu: {
    model: string;
    vendor: string;
  } | null;
  session: {
    uptime: number; // seconds
    pageLoadTime: number; // ms
  };
}
