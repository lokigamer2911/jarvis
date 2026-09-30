'use client';

/**
 * AgentPipeline — the contextual capability chain.
 *
 * Only renders while JARVIS is actually working. Shows WHICH specialists
 * the request activated (primary = accent, support = gray), in execution
 * order. This is a readout of real routing state, not decoration.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { PipelineNode } from '@/lib/workspace';

export default function AgentPipeline({ nodes }: { nodes: PipelineNode[] | null }) {
  return (
    <AnimatePresence mode="wait">
      {nodes && nodes.length > 0 && (
        <motion.div
          key="pipeline"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="hud-pipeline"
          aria-label="Active agent chain"
        >
          {nodes.map((n, i) => (
            <span key={n.id} className="hud-pipeline-item">
              {i > 0 && <span className="hud-pipeline-arrow" aria-hidden="true">→</span>}
              <span
                className={`hud-pipeline-node ${n.role === 'primary' ? 'is-primary' : 'is-support'}`}
                title={n.role === 'primary' ? 'Primary capability' : 'Supporting context'}
              >
                {n.label}
              </span>
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
