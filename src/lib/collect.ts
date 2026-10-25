// The single client entry point for collecting a stamp or points.
// v1 has one source, the counter QR code. An NFC tap can be added later as a second source that calls
// collect(payload, 'nfc'): the server function, the result handling and the screens stay the same.
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

export async function collect(payload: string, source: CollectSource = 'qr'): Promise<CollectOutcome> {
  if (!looksLikePerkoCode(payload)) return { status: 'not_perko' };

  const net = await NetInfo.fetch().catch(() => null);
  if (net && net.isConnected === false) return { status: 'offline' };

  try {
    return await api.collect(payload, source);
  } catch (e) {
    if (e instanceof NetworkError) return { status: 'offline' };
    if (e instanceof AuthError) return { status: 'signed_out' };
    return { status: 'error' };
  }
}
