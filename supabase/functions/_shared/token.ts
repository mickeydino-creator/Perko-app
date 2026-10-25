// Signed counter QR tokens and short-lived redemption codes.
// Uses only WebCrypto, available in Deno (Edge Functions) and Node 20+ (admin script, tests).
// The secrets never reach the app: the app only scans and forwards the payload.

/** Scheme printed in the counter QR. Opening it with any camera app deep-links into Perko. */
export const QR_PREFIX = 'perko://c/';

/** A redemption code is valid for one window and the one before it (so a code read at second 29 still works). */
export const REDEEM_WINDOW_SECONDS = 30;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function qrSignature(secret: string, version: number, qrId: string): Promise<string> {
  // 16 bytes of the HMAC (128 bits) keep the printed code small and are plenty against guessing.
  return b64url((await hmac(secret, `perko.qr.v${version}.${qrId.toLowerCase()}`)).slice(0, 16));
}

/** Build the payload printed on a business's counter code. */
export async function signQrPayload(secret: string, version: number, qrId: string): Promise<string> {
  if (!UUID.test(qrId)) throw new Error('qrId must be a uuid');
  return `${QR_PREFIX}v${version}.${qrId.toLowerCase()}.${await qrSignature(secret, version, qrId)}`;
}

export type ParsedQr = { version: number; qrId: string; signature: string };

/** Parse without verifying. Returns null for anything that is not a Perko counter code. */
export function parseQrPayload(payload: string): ParsedQr | null {
  const raw = payload.trim();
  if (!raw.startsWith(QR_PREFIX)) return null;
  const m = /^v(\d{1,3})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{22})$/.exec(raw.slice(QR_PREFIX.length));
  if (!m || !UUID.test(m[2])) return null;
  return { version: Number(m[1]), qrId: m[2].toLowerCase(), signature: m[3] };
}

/**
 * Verify a scanned payload. `secrets` maps key version to secret so codes can be rotated:
 * print new codes with a new version, keep the old secret until the old codes are collected, then drop it.
 */
export async function verifyQrPayload(payload: string, secrets: Record<number, string>): Promise<ParsedQr | null> {
  const parsed = parseQrPayload(payload);
  if (!parsed) return null;
  const secret = secrets[parsed.version];
  if (!secret) return null;
  const expected = await qrSignature(secret, parsed.version, parsed.qrId);
  return safeEqual(expected, parsed.signature) ? parsed : null;
}

export function redeemWindow(now: Date): number {
  return Math.floor(now.getTime() / 1000 / REDEEM_WINDOW_SECONDS);
}

async function codeFor(secret: string, cardId: string, window: number): Promise<string> {
  const h = await hmac(secret, `perko.redeem.${cardId}.${window}`);
  // Dynamic truncation as in HOTP (RFC 4226), 6 digits.
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** The code the customer shows at the counter right now, and when it stops being shown. */
export async function issueRedeemCode(secret: string, cardId: string, now: Date): Promise<{ code: string; expiresAt: string }> {
  const w = redeemWindow(now);
  return { code: await codeFor(secret, cardId, w), expiresAt: new Date((w + 1) * REDEEM_WINDOW_SECONDS * 1000).toISOString() };
}

/** Accepts the current code and the previous one only. A screenshot is stale within a minute. */
export async function verifyRedeemCode(secret: string, cardId: string, code: string, now: Date): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const w = redeemWindow(now);
  for (const win of [w, w - 1]) {
    if (safeEqual(await codeFor(secret, cardId, win), code)) return true;
  }
  return false;
}
