"use client";

/**
 * Browser-side DM encryption/decryption.
 * Ed25519 private key → X25519 private key via SHA-512 scalar clamping.
 * ECDH shared secret → HKDF-SHA256 → AES-256-GCM.
 * Wire format: base64url(iv[12] || ciphertext+tag)
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha512.js";
import { hexToBytes } from "@noble/hashes/utils.js";

/** Ed25519 seed (32 bytes) → X25519 private key (32 bytes clamped) */
function ed25519SeedToX25519Priv(seed: Uint8Array): Uint8Array {
  const h = sha512(seed);
  const priv = h.slice(0, 32);
  priv[0] &= 248;
  priv[31] &= 127;
  priv[31] |= 64;
  return priv;
}

/**
 * Derive an AES-256-GCM key from two Ed25519 keys (ECDH-HKDF).
 * ourPrivHex: hex of the Ed25519 PRIVATE KEY seed (32 bytes = 64 hex chars)
 * theirPubHex: hex of the other party's Ed25519 PUBLIC KEY (32 bytes = 64 hex chars)
 *
 * We convert Ed25519 private seed → X25519 private key.
 * We treat the Ed25519 public key bytes as a Curve25519 Montgomery-form point
 * via the birational equivalence u = (1+v)/(1-v). However, the simplest
 * interoperable approach is to store and exchange the X25519 public key
 * derived from our own seed and perform ECDH on that.
 *
 * Since we control both sides (sender and recipient are both Voicebox agents),
 * we derive X25519 pub from their ed25519 pubkey bytes using the standard
 * Edwards→Montgomery formula, implemented here without @noble/curves helper.
 */
async function deriveAESKey(ourPrivHex: string, theirPubHex: string): Promise<CryptoKey> {
  const ourSeed  = hexToBytes(ourPrivHex);
  const ourX25519Priv = ed25519SeedToX25519Priv(ourSeed);

  // Convert Ed25519 public key to X25519 public key.
  // Ed25519 pub bytes are the compressed Edwards y-coordinate.
  // Birational map: u = (1+y)/(1-y) mod p  (with sign bit stripped from last byte)
  const theirEdPub = hexToBytes(theirPubHex);
  const theirX25519Pub = edPubToMontgomery(theirEdPub);

  const shared = x25519.getSharedSecret(ourX25519Priv, theirX25519Pub);

  const material = await crypto.subtle.importKey("raw", shared, { name: "HKDF" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("voicebox-dm-v1"), info: new Uint8Array(0) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Convert Ed25519 compressed public key (little-endian y) to X25519 Montgomery u */
function edPubToMontgomery(edPub: Uint8Array): Uint8Array {
  // p = 2^255 - 19 as a BigInt
  const p = (1n << 255n) - 19n;

  // Decode little-endian y (mask off the sign bit in the top byte)
  const bytes = new Uint8Array(edPub);
  bytes[31] &= 0x7f; // clear sign bit
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);

  // u = (1 + y) / (1 - y) mod p
  const one = 1n;
  const numer = mod(one + y, p);
  const denom = mod(one - y, p);
  const u = mod(numer * modInv(denom, p), p);

  // Encode u as little-endian 32 bytes
  const out = new Uint8Array(32);
  let tmp = u;
  for (let i = 0; i < 32; i++) { out[i] = Number(tmp & 0xffn); tmp >>= 8n; }
  return out;
}

function mod(a: bigint, m: bigint): bigint { return ((a % m) + m) % m; }

function modInv(a: bigint, m: bigint): bigint {
  // Extended Euclidean algorithm
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

export async function browserEncryptDM(ourPrivHex: string, theirPubHex: string, plaintext: string): Promise<string> {
  const key  = await deriveAESKey(ourPrivHex, theirPubHex);
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const ct   = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const out  = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...out)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function browserDecryptDM(ourPrivHex: string, theirPubHex: string, encoded: string): Promise<string> {
  const b64    = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes  = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  if (bytes.length < 13) throw new Error("ciphertext too short");
  const key = await deriveAESKey(ourPrivHex, theirPubHex);
  const pt  = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(pt);
}
