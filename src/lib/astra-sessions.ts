/**
 * ASTRA sessions — persistent conversation list (ChatGPT-style).
 *
 * Each session snapshots its ChatEntry[] plus the voice-conversation
 * Message[] needed to give the mesh context when reloaded. Sessions
 * live in localStorage under the app prefix; last-active floats to top.
 */

import { storage } from './storage';

export interface ChatEntryLike {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  time: string;
  card?: string;
  cardData?: Record<string, unknown>;
  agents?: string[];
  modelsUsed?: string[];
  local?: boolean;
}

export interface AstraSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Full chat entries (cards/agents included). */
  entries: ChatEntryLike[];
  /** Mesh context rows for /api/chat. */
  context: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
}

const KEY = 'astra_sessions';
const MAX_SESSIONS = 60;

export function getAstraSessions(): AstraSession[] {
  const list = storage.getItem<AstraSession[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

function persist(list: AstraSession[]): void {
  storage.setItem(KEY, list.slice(0, MAX_SESSIONS));
}

export function saveAstraSession(s: AstraSession): void {
  const list = getAstraSessions();
  const idx = list.findIndex(x => x.id === s.id);
  const stamped = { ...s, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = stamped;
  else list.unshift(stamped);
  // newest-first ordering
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  persist(list);
}

export function deleteAstraSession(id: string): void {
  persist(getAstraSessions().filter(s => s.id !== id));
}

export function newAstraSessionId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function autoTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 42 ? clean.slice(0, 42).trimEnd() + '…' : clean;
}

// ── Conversions between ChatEntry[] and mesh context ────────────

export function astraSessionToMessages(s: AstraSession) {
  return s.context;
}

export function messagesToAstraSession(
  partial: Pick<AstraSession, 'id' | 'title'>,
  entries: ChatEntryLike[],
  context: AstraSession['context'],
): AstraSession {
  const now = new Date().toISOString();
  return {
    ...partial,
    createdAt: now,
    updatedAt: now,
    entries,
    context,
  };
}
