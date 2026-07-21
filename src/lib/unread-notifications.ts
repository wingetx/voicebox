"use client";

/**
 * Lightweight unread-notifications tracker backed by localStorage, mirroring
 * unread-dms.ts. Stores a single "last seen" timestamp per pubkey (this app
 * only ever has one connected identity per browser, but keying by pubkey
 * keeps it correct if that identity is ever swapped).
 */

const STORAGE_KEY = "vb_notif_last_seen";

type Listener = () => void;
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

/** Mark all current notifications as seen. */
export function clearUnreadNotifications(pubkey: string) {
  const store = readStore();
  store[pubkey] = Math.floor(Date.now() / 1000);
  writeStore(store);
  notify();
}

/** How many of these notifications are newer than the last-seen mark. */
export function countUnreadNotifications(
  pubkey: string,
  notifications: { createdAt: string }[]
): number {
  const lastSeen = readStore()[pubkey] ?? 0;
  return notifications.filter((n) => new Date(n.createdAt).getTime() / 1000 > lastSeen).length;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}
