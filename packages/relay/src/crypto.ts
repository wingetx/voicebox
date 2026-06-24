import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import * as ed from "@noble/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { VoiceboxEvent } from "./types.js";

// One-time Ed25519 initialization
ed.etc.sha512Sync = (...msgs: Uint8Array[]): Uint8Array => {
  const combined = new Uint8Array(msgs.reduce((acc, m) => acc + m.length, 0));
  let offset = 0;
  for (const m of msgs) {
    combined.set(m, offset);
    offset += m.length;
  }
  return sha512(combined);
};

/**
 * Serialize an event for ID computation.
 * Format: [0, pubkey, created_at, kind, tags, content]
 */
export function serializeEvent(event: VoiceboxEvent): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
}

/**
 * Compute the event ID: sha256(serialize(event))
 */
export function computeEventId(event: VoiceboxEvent): string {
  const serialized = serializeEvent(event);
  return bytesToHex(sha256(serialized));
}

/**
 * Verify an event's id and signature.
 */
export async function verifyEvent(event: VoiceboxEvent): Promise<boolean> {
  // Verify id
  const computedId = computeEventId(event);
  if (computedId !== event.id) return false;

  // Verify signature
  try {
    const pubkeyBytes = hexToBytes(event.pubkey);
    const sigBytes = hexToBytes(event.sig);
    const idBytes = hexToBytes(event.id);
    return await ed.verifyAsync(sigBytes, idBytes, pubkeyBytes);
  } catch {
    return false;
  }
}

/**
 * Synchronous version for use in non-async contexts.
 */
export function verifyEventSync(event: VoiceboxEvent): boolean {
  const computedId = computeEventId(event);
  if (computedId !== event.id) return false;

  try {
    const pubkeyBytes = hexToBytes(event.pubkey);
    const sigBytes = hexToBytes(event.sig);
    const idBytes = hexToBytes(event.id);
    return ed.verify(sigBytes, idBytes, pubkeyBytes);
  } catch {
    return false;
  }
}
