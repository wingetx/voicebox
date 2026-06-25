export interface AdminPostRecord {
  id: string;
  content?: string;
  submolt?: string;
  tags?: string[];
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPostInput {
  id: string;
  content?: string;
  submolt?: string;
  tags?: string[];
  deleted?: boolean;
}

export interface AdminPostPatch {
  content?: string;
  submolt?: string;
  tags?: string[];
  deleted?: boolean;
}

export const EVENT_ID_HEX_RE = /^[0-9a-f]{64}$/;
const SUBMOLT_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isValidEventId(id: string): boolean {
  return EVENT_ID_HEX_RE.test(id);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.replace(/^#+/, "").trim().toLowerCase();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return [...deduped].slice(0, 20);
}

export function normalizeSubmolt(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || undefined;
}

export function isValidSubmolt(submolt: string): boolean {
  return SUBMOLT_RE.test(submolt);
}
