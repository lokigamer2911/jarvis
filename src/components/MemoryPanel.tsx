'use client';

/**
 * Memory Panel — inspect, search, edit, and delete JARVIS memories.
 * Privacy-first: user has full control over what JARVIS remembers.
 *
 * Accessible, keyboard-navigable, fits the JARVIS HUD aesthetic.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getMemories,
  searchMemories,
  addMemory,
  clearAllMemories,
  exportMemories,
  getMemoryStats,
  Memory,
} from '@/lib/memory';
import { memoryGraphData$ } from '@/lib/memory-bridge';

type MemoryType = Memory['type'];
type SortBy = 'recency' | 'importance';
type ViewMode = 'list' | 'grid';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recency');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImportance, setEditImportance] = useState(5);
  const [showStats, setShowStats] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newMemory, setNewMemory] = useState({
    content: '',
    type: 'conversation' as MemoryType,
    importance: 5,
    tags: '',
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load memories
  const loadMemories = useCallback(() => {
    if (!isOpen) return;
    const results = query
      ? searchMemories(query)
      : getMemories(undefined, typeFilter === 'all' ? undefined : typeFilter, 200);
    setMemories(results);
    memoryGraphData$.set(results); // → spatial knowledge graph updates
  }, [isOpen, query, typeFilter]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // Focus trap and keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Delete' && selectedIds.size > 0) {
        handleBulkDelete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, selectedIds]);

  // Stats
  const stats = useMemo(() => getMemoryStats(), [isOpen]);

  // Sorted memories
  const sortedMemories = useMemo(() => {
    const sorted = [...memories];
    if (sortBy === 'importance') {
      sorted.sort((a, b) => b.importance - a.importance);
    } else {
      sorted.sort((a, b) => b.timestamp - a.timestamp);
    }
    return sorted;
  }, [memories, sortBy]);

  // Type counts for filters
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: memories.length };
    for (const m of memories) {
      counts[m.type] = (counts[m.type] || 0) + 1;
    }
    return counts;
  }, [memories]);

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === sortedMemories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedMemories.map(m => m.id)));
    }
  };

  // Edit
  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditImportance(memory.importance);
  };

  const saveEdit = (id: string) => {
    // Update in localStorage directly (memory.ts doesn't expose update)
    const key = 'jarvis_memory';
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const store = JSON.parse(raw);
      const idx = store.memories.findIndex((m: Memory) => m.id === id);
      if (idx !== -1) {
        store.memories[idx].content = editContent;
        store.memories[idx].importance = editImportance;
        localStorage.setItem(key, JSON.stringify(store));
      }
    } catch { /* ignore */ }
    setEditingId(null);
    loadMemories();
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  // Delete
  const deleteMemory = (id: string) => {
    const key = 'jarvis_memory';
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const store = JSON.parse(raw);
      store.memories = store.memories.filter((m: Memory) => m.id !== id);
      localStorage.setItem(key, JSON.stringify(store));
    } catch { /* ignore */ }
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    loadMemories();
  };

  const handleBulkDelete = () => {
    const key = 'jarvis_memory';
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const store = JSON.parse(raw);
      store.memories = store.memories.filter((m: Memory) => !selectedIds.has(m.id));
      localStorage.setItem(key, JSON.stringify(store));
    } catch { /* ignore */ }
    setSelectedIds(new Set());
    loadMemories();
  };

  const handleClearAll = () => {
    clearAllMemories();
    setConfirmClear(false);
    loadMemories();
  };

  // Add new memory
  const addNewMemory = () => {
    if (!newMemory.content.trim()) return;
    addMemory({
      content: newMemory.content,
      type: newMemory.type,
      importance: newMemory.importance,
      tags: newMemory.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setNewMemory({ content: '', type: 'conversation', importance: 5, tags: '' });
    setAddMode(false);
    loadMemories();
  };

  // Export
  const handleExport = () => {
    setExportData(exportMemories());
    setShowExport(true);
  };

  const copyExport = () => {
    navigator.clipboard.writeText(exportData).catch(() => {});
  };

  const downloadExport = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          aria-labelledby="memory-panel-title"
        >
          <motion.div
            ref={panelRef}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="dialog-shell w-[92vw] max-w-4xl max-h-[86vh] flex flex-col relative"
          >
            {/* Header */}
            <div className="dialog-head">
              <div className="min-w-0">
                <div className="dialog-eyebrow">Knowledge · persistent context</div>
                <div id="memory-panel-title" className="dialog-title mt-1">Memory System</div>
                <div className="dialog-sub mt-1">
                  {memories.length} memories · {selectedIds.size} selected
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="pill-btn px-2.5 py-1.5 text-[10px]"
                  aria-label="Toggle statistics"
                >
                  Stats
                </button>
                <button
                  onClick={handleExport}
                  className="pill-btn px-2.5 py-1.5 text-[10px]"
                  aria-label="Export memories"
                >
                  Export
                </button>
                <button
                  onClick={() => setConfirmClear(true)}
                  className="rounded-xl border px-2.5 py-1.5 text-[10px] text-rose-300/80 transition hover:bg-rose-500/10"
                  style={{ borderColor: 'rgba(253,164,175,0.3)' }}
                  aria-label="Clear all memories"
                >
                  Clear all
                </button>
                <button
                  onClick={onClose}
                  className="dialog-close"
                  aria-label="Close memory panel"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Stats overlay */}
            <AnimatePresence>
              {showStats && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-white/10 overflow-hidden"
                >
                  <div className="px-6 py-4">
                    <div className="hud-text text-[8px] mb-3">MEMORY STATISTICS</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white/[0.03] border border-white/10 rounded p-3">
                        <div className="hud-text text-[7px] mb-1">TOTAL MEMORIES</div>
                        <div className="hud-value text-xl">{stats.totalMemories}</div>
                      </div>
                      <div className="bg-white/[0.03] border border-white/10 rounded p-3">
                        <div className="hud-text text-[7px] mb-1">TOTAL COMMANDS</div>
                        <div className="hud-value text-xl">{stats.totalCommands}</div>
                      </div>
                      <div className="bg-white/[0.03] border border-white/10 rounded p-3">
                        <div className="hud-text text-[7px] mb-1">SUCCESS RATE</div>
                        <div className="hud-value text-xl">
                          {stats.commandStats.success
                            ? Math.round((stats.commandStats.success / (stats.totalCommands || 1)) * 100)
                            : '—'}%
                        </div>
                      </div>
                      <div className="bg-white/[0.03] border border-white/10 rounded p-3">
                        <div className="hud-text text-[7px] mb-1">TOP TOOL</div>
                        <div className="hud-value text-xl">
                          {stats.topTools.length > 0 ? stats.topTools[0][0].toUpperCase() : '—'}
                        </div>
                      </div>
                    </div>
                    {Object.keys(stats.typeCounts).length > 0 && (
                      <div className="mt-3">
                        <div className="hud-text text-[7px] mb-2">BY TYPE</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(stats.typeCounts).map(([type, count]) => (
                            <span key={type} className="px-2 py-1 border border-white/15 text-[9px] text-[color:var(--t2)] rounded">
                              {String(type).toUpperCase()}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toolbar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.07]">
              {/* Search */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search memories… (⌘F)"
                  className="w-full bg-transparent border border-white/15 rounded px-3 py-2 text-[11px] text-[color:var(--t1)] placeholder:text-white/25 focus:border-white/20 transition-all"
                 
                  aria-label="Search memories"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--t3)] hover:text-[color:var(--t2)]"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as MemoryType | 'all')}
                className="bg-transparent border border-white/15 rounded px-2 py-2 text-[10px] text-[color:var(--t2)] focus:border-white/20 transition-colors"
               
                aria-label="Filter by type"
              >
                <option value="all">ALL ({typeCounts.all || 0})</option>
                <option value="conversation">CONVERSATION ({typeCounts.conversation || 0})</option>
                <option value="command">COMMAND ({typeCounts.command || 0})</option>
                <option value="pattern">PATTERN ({typeCounts.pattern || 0})</option>
                <option value="preference">PREFERENCE ({typeCounts.preference || 0})</option>
                <option value="error">ERROR ({typeCounts.error || 0})</option>
                <option value="discovery">DISCOVERY ({typeCounts.discovery || 0})</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortBy)}
                className="bg-transparent border border-white/15 rounded px-2 py-2 text-[10px] text-[color:var(--t2)] focus:border-white/20 transition-colors"
               
                aria-label="Sort by"
              >
                <option value="recency">RECENT</option>
                <option value="importance">IMPORTANCE</option>
              </select>

              {/* View mode */}
              <div className="flex border border-white/15 rounded overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-2 text-[10px] transition-colors ${
                    viewMode === 'list' ? 'bg-white/[0.08] text-[color:var(--t1)]' : 'text-[color:var(--t3)] hover:text-[color:var(--t2)]'
                  }`}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  ≡
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-2 text-[10px] transition-colors ${
                    viewMode === 'grid' ? 'bg-white/[0.08] text-[color:var(--t1)]' : 'text-[color:var(--t3)] hover:text-[color:var(--t2)]'
                  }`}
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                >
                  ⊞
                </button>
              </div>

              {/* Add */}
              <button
                onClick={() => setAddMode(!addMode)}
                className={`px-2 py-2 border border-white/15 text-[10px] rounded transition-colors ${
                  addMode ? 'bg-white/[0.08] text-[color:var(--t1)]' : 'text-[color:var(--t2)] hover:bg-white/[0.05]'
                }`}
                aria-label="Add new memory"
                aria-expanded={addMode}
              >
                + ADD
              </button>
            </div>

            {/* Add memory form */}
            <AnimatePresence>
              {addMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <div className="px-6 py-4">
                    <div className="field-label mb-3">Add new memory</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="field-label mb-1.5 block">Type</label>
                        <select
                          value={newMemory.type}
                          onChange={e => setNewMemory(p => ({ ...p, type: e.target.value as MemoryType }))}
                          className="rounded-xl border bg-white/[0.03] px-2.5 py-2 text-[11.5px] text-[color:var(--t1)] focus:outline-none"
                          style={{ borderColor: 'var(--line)' }}
                        >
                          <option value="conversation">Conversation</option>
                          <option value="command">Command</option>
                          <option value="pattern">Pattern</option>
                          <option value="preference">Preference</option>
                          <option value="error">Error</option>
                          <option value="discovery">Discovery</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label mb-1.5 block">Importance (1–10)</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={newMemory.importance}
                          onChange={e => setNewMemory(p => ({ ...p, importance: parseInt(e.target.value) || 5 }))}
                          className="field-input py-2 text-[12px]"
                        />
                      </div>
                      <div>
                        <label className="field-label mb-1.5 block">Tags (comma-separated)</label>
                        <input
                          type="text"
                          value={newMemory.tags}
                          onChange={e => setNewMemory(p => ({ ...p, tags: e.target.value }))}
                          placeholder="e.g., weather, preference"
                          className="field-input py-2 text-[12px]"
                        />
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="field-label mb-1.5 block">Content</label>
                      <textarea
                        value={newMemory.content}
                        onChange={e => setNewMemory(p => ({ ...p, content: e.target.value }))}
                        placeholder="What should JARVIS remember?"
                        rows={3}
                        className="field-input resize-none text-[12.5px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addNewMemory}
                        disabled={!newMemory.content.trim()}
                        className="btn-accent rounded-xl px-4 py-2 text-[11.5px] disabled:opacity-30"
                      >
                        Save memory
                      </button>
                      <button
                        onClick={() => setAddMode(false)}
                        className="pill-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 border-b px-6 py-2.5" style={{ borderColor: 'var(--line)', background: 'rgba(255,90,31,0.05)' }}>
                <span className="dialog-sub">{selectedIds.size} selected</span>
                <button
                  onClick={handleBulkDelete}
                  className="rounded-lg border px-2.5 py-1 text-[10.5px] text-rose-300/80 transition hover:bg-rose-500/10"
                  style={{ borderColor: 'rgba(253,164,175,0.3)' }}
                >
                  Delete selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="pill-btn px-2.5 py-1 text-[10.5px]"
                >
                  Clear selection
                </button>
              </div>
            )}

            {/* Memory list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {sortedMemories.length === 0 ? (
                <div className="text-center text-[color:var(--t3)] text-[10px] mt-12">
                  <div className="mb-3 text-lg text-[color:var(--t3)]">[ ∅ ]</div>
                  <p>{query ? 'NO MEMORIES MATCH YOUR SEARCH' : 'NO MEMORIES STORED YET'}</p>
                  <p className="mt-1 text-[color:var(--t3)]">
                    {query ? 'Try a different search term' : 'JARVIS learns from your interactions'}
                  </p>
                </div>
              ) : (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-2'}>
                  {sortedMemories.map(memory => (
                    <MemoryItem
                      key={memory.id}
                      memory={memory}
                      isSelected={selectedIds.has(memory.id)}
                      isEditing={editingId === memory.id}
                      editContent={editContent}
                      editImportance={editImportance}
                      onToggleSelect={() => toggleSelect(memory.id)}
                      onEdit={() => startEdit(memory)}
                      onSaveEdit={() => saveEdit(memory.id)}
                      onCancelEdit={cancelEdit}
                      onDelete={() => deleteMemory(memory.id)}
                      onEditContentChange={setEditContent}
                      onEditImportanceChange={setEditImportance}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/10">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className="text-[9px] text-[color:var(--t2)] hover:text-[color:var(--t2)] transition-colors"
                >
                  {selectedIds.size === sortedMemories.length ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
                <span className="text-[8px] text-[color:var(--t3)]">ESC TO CLOSE</span>
              </div>
              <div className="text-[8px] text-[color:var(--t3)]">
                PRIVACY: ALL DATA STORED LOCALLY · NEVER TRANSMITTED
              </div>
            </div>
          </motion.div>

          {/* Confirm clear dialog */}
          <AnimatePresence>
            {confirmClear && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                style={{ background: 'rgba(2,4,8,0.9)' }}
                onClick={e => { if (e.target === e.currentTarget) setConfirmClear(false); }}
              >
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.95 }}
                  className="dialog-shell p-6 max-w-sm w-full"
                >
                  <div className="text-[12px] font-semibold tracking-wide text-rose-300/90 mb-3">⚠ Confirm clear all</div>
                  <p className="text-[12.5px] leading-relaxed text-[color:var(--t2)] mb-4">
                    This will permanently delete all {stats.totalMemories} memories and {stats.totalCommands} command records.
                    This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClearAll}
                      className="flex-1 rounded-xl border py-2.5 text-[11.5px] tracking-wide text-rose-300 transition hover:bg-rose-500/15"
                      style={{ borderColor: 'rgba(253,164,175,0.35)', background: 'rgba(253,164,175,0.08)' }}
                    >
                      Delete all
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="flex-1 py-2.5 rounded border border-white/15 text-[color:var(--t2)] text-[11px] tracking-wider hover:bg-white/[0.05] transition-colors"
                    >
                      CANCEL
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Export dialog */}
          <AnimatePresence>
            {showExport && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                style={{ background: 'rgba(2,4,8,0.9)' }}
                onClick={e => { if (e.target === e.currentTarget) setShowExport(false); }}
              >
                <motion.div
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.95 }}
                  className="dialog-shell p-6 max-w-lg w-full max-h-[70vh] flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="dialog-eyebrow">Export memories</div>
                    <button
                      onClick={() => setShowExport(false)}
                      className="dialog-close"
                      aria-label="Close export"
                    >
                      ✕
                    </button>
                  </div>
                  <pre className="flex-1 overflow-auto rounded-xl border p-3 font-mono text-[10.5px] text-[color:var(--t2)]" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.03)' }}>
                    {exportData}
                  </pre>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={copyExport}
                      className="px-4 py-2 border border-white/15 text-[10px] text-[color:var(--t1)] rounded hover:bg-white/[0.05] transition-colors"
                    >
                      COPY TO CLIPBOARD
                    </button>
                    <button
                      onClick={downloadExport}
                      className="px-4 py-2 border border-white/15 text-[10px] text-[color:var(--t1)] rounded hover:bg-white/[0.05] transition-colors"
                    >
                      DOWNLOAD JSON
                    </button>
                    <button
                      onClick={() => setShowExport(false)}
                      className="px-4 py-2 border border-white/15 text-[10px] text-[color:var(--t2)] rounded hover:bg-white/[0.05] transition-colors"
                    >
                      CLOSE
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Individual memory item ────────────────────────────────────

interface MemoryItemProps {
  memory: Memory;
  isSelected: boolean;
  isEditing: boolean;
  editContent: string;
  editImportance: number;
  onToggleSelect: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditContentChange: (v: string) => void;
  onEditImportanceChange: (v: number) => void;
  viewMode: ViewMode;
}

function MemoryItem({
  memory, isSelected, isEditing, editContent, editImportance,
  onToggleSelect, onEdit, onSaveEdit, onCancelEdit, onDelete,
  onEditContentChange, onEditImportanceChange, viewMode,
}: MemoryItemProps) {
  const typeColors: Record<MemoryType, string> = {
    conversation: 'border-white/15 text-[color:var(--t2)]',
    command: 'border-emerald-500/25 text-emerald-400/70',
    pattern: 'border-violet-500/25 text-violet-400/70',
    preference: 'border-amber-500/25 text-amber-400/70',
    error: 'border-rose-400/25 text-red-400/70',
    discovery: 'border-white/15 text-[color:var(--t2)]',
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={`border rounded p-3 transition-all cursor-pointer ${
        isSelected ? 'border-white/30 bg-white/[0.05]' : 'border-white/10 hover:border-white/15'
      } ${viewMode === 'grid' ? 'flex flex-col' : 'flex items-start gap-3'}`}
      onClick={onToggleSelect}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelect();
        }
      }}
    >
      {/* Type badge */}
      <span className={`shrink-0 px-1.5 py-0.5 border text-[7px] rounded ${typeColors[memory.type]}`}>
        {memory.type.toUpperCase()}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            <textarea
              value={editContent}
              onChange={e => onEditContentChange(e.target.value)}
              className="w-full bg-transparent border border-white/15 rounded px-2 py-1.5 text-[10px] text-[color:var(--t1)] resize-none"
              rows={3}
             
            />
            <div className="flex items-center gap-2">
              <label className="text-[8px] text-[color:var(--t2)]">IMP:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={editImportance}
                onChange={e => onEditImportanceChange(parseInt(e.target.value) || 5)}
                className="w-12 bg-transparent border border-white/15 rounded px-1 py-1 text-[10px] text-[color:var(--t1)] text-center"
              />
              <button
                onClick={onSaveEdit}
                className="px-2 py-1 border border-white/15 text-[9px] text-[color:var(--t1)] rounded hover:bg-white/[0.05]"
              >
                SAVE
              </button>
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 border border-white/15 text-[9px] text-[color:var(--t2)] rounded hover:bg-white/[0.05]"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-[color:var(--t2)] leading-relaxed line-clamp-2">
            {memory.content}
          </p>
        )}
      </div>

      {/* Meta */}
      {!isEditing && (
        <div className="shrink-0 flex items-center gap-2 text-[8px] text-[color:var(--t3)]">
          <span>IMP: {memory.importance}</span>
          <span>{timeAgo(memory.timestamp)}</span>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="text-[color:var(--t3)] hover:text-[color:var(--t2)] transition-colors"
            aria-label="Edit memory"
          >
            ✎
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="text-red-400/50 hover:text-red-400 transition-colors"
            aria-label="Delete memory"
          >
            ✕
          </button>
        </div>
      )}
    </motion.div>
  );
}
