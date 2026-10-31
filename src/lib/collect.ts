// The single client entry point for collecting a stamp or points.
// Two steps: checkCollect() right after the scan (may the customer collect now?), then confirmCollect() with the
// staff PIN typed on the customer's phone. v1 has one source, the counter QR code. An NFC tap can be added later
// as a second source that calls the same two functions with 'nfc': the server, the result handling and the
// screens stay the same.
import NetInfo from '@react-native-community/netinfo';
import { parseQrPayload } from '../../supabase/functions/_shared/token.ts';
import { api } from './api';
import { AuthError, NetworkError } from './backend';
import type { CollectResponse, CollectSource } from './types';

export type CollectOutcome =
  | CollectResponse
  | { status: 'not_perko' } // some other QR code: rejected on the device, no request sent
  | { status: 'offline' }
  | { status: 'signed_out' }
  | { status: 'error' };

/** Quick local check so random QR codes (menus, links) do not hit the server. Does not verify the signature. */
export function looksLikePerkoCode(payload: string): boolean {
  return parseQrPayload(payload) !== null;
}

async function call(payload: string, run: () => Promise<CollectResponse>): Promise<CollectOutcome> {
  if (!looksLikePerkoCode(payload)) return { status: 'not_perko' };

  const net = await NetInfo.fetch().catch(() => null);
  if (net && net.isConnected === false) return { status: 'offline' };

  try {
    return await run();
  } catch (e) {
    if (e instanceof NetworkError) return { status: 'offline' };
    if (e instanceof AuthError) return { status: 'signed_out' };
    return { status: 'error' };
  }
}

/** After the scan: 'pin_required' when a stamp can be added, else the reason it cannot (cooldown, full card...). */
export function checkCollect(payload: string, source: CollectSource = 'qr'): Promise<CollectOutcome> {
  return call(payload, () => api.checkCollect(payload, source));
}

/** With the staff PIN: 'ok' when the stamp was written, 'wrong_pin' or 'locked' when the PIN was not accepted. */
export function confirmCollect(payload: string, pin: string, source: CollectSource = 'qr'): Promise<CollectOutcome> {
  return call(payload, () => api.collect(payload, source, pin));
}
