"use client";

/**
 * Lightweight unread DM tracker backed by localStorage.
 *
 * Stores: { [correspondentPubkey]: lastSeenTimestamp }
 * An event is "unread" if its created_at > lastSeen for that correspondent.
 *
 * Listeners are notified whenever the count changes so the Navbar badge
 * can react without a polling loop.
 */

const STORAGE_KEY = "vb_dm_last_seen";

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function readStore(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Mark a full conversation as read up to `now`. */
export function clearUnread(correspondentPubkey: string) {
  const store = readStore();
  store[correspondentPubkey] = Math.floor(Date.now() / 1000);
  writeStore(store);
  notify();
}

/** Record a new unread event (just touch the store to trigger listeners). */
export function markUnread(correspondentPubkey: string, eventTimestamp: number) {
  const store = readStore();
  // Only mark unread if the event is newer than the current last-seen
  const lastSeen = store[correspondentPubkey] ?? 0;
  if (eventTimestamp > lastSeen) {
    // We deliberately do NOT update the store here — the "unread" state is
    // implied by: lastEventTimestamp > lastSeen[correspondent].
    // We only need to notify listeners so they can re-count.
    notify();
  }
}

/**
 * Count unread conversations given the latest event timestamp per correspondent.
 * inboxEntries: array of { correspondent, lastEventTimestamp }
 */
export function countUnread(inboxEntries: { correspondent: string; lastEventTimestamp: number }[]): number {
  const store = readStore();
  return inboxEntries.filter(({ correspondent, lastEventTimestamp }) => {
    const lastSeen = store[correspondent] ?? 0;
    return lastEventTimestamp > lastSeen;
  }).length;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  // We don't know the full inbox here — callers must recompute the count.
  // Emit -1 as a "stale" signal; consumers re-fetch and recount.
  listeners.forEach((l) => l(-1));
}
