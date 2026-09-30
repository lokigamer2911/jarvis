/**
 * Shared Recon type contract — consumed by AutoRecon.tsx (HUD) and the
 * persistent 3D world (node graph). Kept separate so the scene never
 * imports the React component tree.
 */

export interface ReconFinding {
  type: 'subdomain' | 'port' | 'technology' | 'file' | 'vulnerability' | 'info' | 'header' | 'dns' | 'email';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
  evidence?: string;
  command?: string;
}

export interface ReconPhase {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  results: ReconFinding[];
  commands: string[];
  duration?: number;
}

export interface ReconResult {
  target: string;
  startTime: number;
  endTime?: number;
  phases: ReconPhase[];
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    subdomains: number;
    openPorts: number;
    technologies: string[];
  };
}
