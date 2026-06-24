"use client";

import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import * as ed from "@noble/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { VoiceboxEvent } from "./types";

// Ed25519 init for browser
ed.etc.sha512Sync = (...msgs: Uint8Array[]): Uint8Array => {
  const combined = new Uint8Array(msgs.reduce((acc, m) => acc + m.length, 0));
  let offset = 0;
  for (const m of msgs) { combined.set(m, offset); offset += m.length; }
  return sha512(combined);
};
ed.etc.sha256Sync = (...msgs: Uint8Array[]): Uint8Array => {
  const combined = new Uint8Array(msgs.reduce((acc, m) => acc + m.length, 0));
  let offset = 0;
  for (const m of msgs) { combined.set(m, offset); offset += m.length; }
  return sha256(combined);
};

const STORAGE_KEY = "vb_keypair";

export interface BrowserIdentity {
  publicKey: string;
  privateKey: string;
}

export function loadIdentity(): BrowserIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.publicKey && parsed.privateKey) return parsed;
  } catch {}
  return null;
}

export function generateBrowserIdentity(): BrowserIdentity {
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  const identity: BrowserIdentity = {
    publicKey: bytesToHex(publicKeyBytes),
    privateKey: bytesToHex(privateKeyBytes),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function importIdentity(privateKeyHex: string): BrowserIdentity {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = ed.getPublicKey(privateKeyBytes);
  const identity: BrowserIdentity = {
    publicKey: bytesToHex(publicKeyBytes),
    privateKey: privateKeyHex,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function clearIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}

export function signBrowserEvent(
  partial: Omit<VoiceboxEvent, "id" | "sig">,
  privateKey: string
): VoiceboxEvent {
  const serialized = JSON.stringify([
    0,
    partial.pubkey,
    partial.created_at,
    partial.kind,
    partial.tags,
    partial.content,
  ]);
  const idBytes = sha256(serialized);
  const id = bytesToHex(idBytes);
  const sigBytes = ed.sign(idBytes, hexToBytes(privateKey));
  return { ...partial, id, sig: bytesToHex(sigBytes) };
}
