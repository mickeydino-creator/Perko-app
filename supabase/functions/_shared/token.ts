// Signed counter QR tokens and staff PIN hashes.
// Uses only WebCrypto, available in Deno (Edge Functions) and Node 20+ (admin script, tests).
// The secrets never reach the app: the app only scans and forwards the payload.

/** Scheme printed in the counter QR. Opening it with any camera app deep-links into Perko. */
export const QR_PREFIX = 'perko://c/';

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

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Staff PINs are 4 digits, typed by a staff member on the customer's phone. */
export const PIN_LENGTH = 4;

export function isPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * What the database stores for a staff PIN: HMAC-SHA256 keyed with PIN_SECRET over the business id and the PIN.
 * Without the secret a leaked table cannot be brute-forced (10,000 PINs would take a moment with a plain hash).
 * The business id makes the same PIN in two businesses look unrelated.
 */
export async function hashPin(secret: string, businessId: string, pin: string): Promise<string> {
  if (!isPinFormat(pin)) throw new Error('a PIN is 4 digits');
  return hex(await hmac(secret, `perko.pin.${businessId.toLowerCase()}.${pin}`));
}

/** PINs a guesser tries first: one digit repeated (0000) and runs (1234, 9876). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** A random PIN, never a weak one. Uses WebCrypto, so it is unpredictable. */
export function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    // 4,294,960,000 is a multiple of 10,000: dropping the top few values keeps every PIN equally likely.
    if (n >= 4_294_960_000) continue;
    const pin = String(n % 10_000).padStart(PIN_LENGTH, '0');
    if (!isWeakPin(pin)) return pin;
  }
}
