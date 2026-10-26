// The user's location for the Discover map and distances. Asked only when the user opens the map; it stays on the
// device (never sent to the server or stored).
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type LatLng = { lat: number; lng: number };
export type LocationState = { me: LatLng | null; denied: boolean; request: () => Promise<void> };

async function current(): Promise<LatLng | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}

export function useMyLocation(): LocationState {
  const [me, setMe] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);

  // Already allowed earlier: use it without asking again.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (p.granted) {
          const pos = await current();
          if (live) setMe(pos);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const request = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      setDenied(!p.granted);
      if (p.granted) setMe(await current());
    } catch {
      setDenied(true);
    }
  }, []);

  return { me, denied, request };
}

/** Great-circle distance in metres. */
export function distance(a: LatLng, b: LatLng): number {
  const r = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** "350 מ׳", "1.2 ק״מ", "14 ק״מ". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} מ׳`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)} ק״מ`;
  return `${Math.round(m / 1000)} ק״מ`;
}

/** Distance from the user to a business, or null when either location is unknown. */
export function distanceTo(me: LatLng | null, b: { lat: number | null; lng: number | null }): number | null {
  return me && b.lat != null && b.lng != null ? distance(me, { lat: b.lat, lng: b.lng }) : null;
}
