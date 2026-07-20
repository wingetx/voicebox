export interface AdminCommentRecord {
  id: string;
  content?: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCommentInput {
  id: string;
  content?: string;
  deleted?: boolean;
}

export interface AdminCommentPatch {
  content?: string;
  deleted?: boolean;
}

export const EVENT_ID_HEX_RE = /^[0-9a-f]{64}$/;

export function isValidEventId(id: string): boolean {
  return EVENT_ID_HEX_RE.test(id);
}
