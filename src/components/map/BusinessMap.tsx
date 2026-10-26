// The Discover map: one pin per business (its initial, in the brand colours) and the user's own position.
// Apple Maps on iOS, Google Maps on Android (react-native-maps). The list view stays the accessible way in.
import { useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type MapStyleElement } from 'react-native-maps';
import { useTheme } from '../../lib/appearance';
import type { LatLng } from '../../lib/location';
import type { Business } from '../../lib/types';
import { colors, radius, touch } from '../../theme';
import { LocateIcon } from '../Icons';
import { Txt } from '../Txt';

export type MapProps = {
  businesses: Business[];
  me: LatLng | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Ask for the location (first tap on the "my location" button). */
  onLocate: () => void;
  /** Room kept free at the bottom for the selected business card. */
  bottomInset: number;
};

type Pinned = Business & { lat: number; lng: number };
const pinned = (b: Business): b is Pinned => b.lat != null && b.lng != null;

/** Jerusalem, Emek Refaim: where the sample businesses are, used when nothing has a location. */
const FALLBACK = { latitude: 31.7605, longitude: 35.2195, latitudeDelta: 0.02, longitudeDelta: 0.02 };

function regionFor(points: Pinned[]) {
  if (!points.length) return FALLBACK;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.008, (maxLat - minLat) * 1.8),
    longitudeDelta: Math.max(0.008, (maxLng - minLng) * 1.8),
  };
}

export function BusinessMap({ businesses, me, selectedId, onSelect, onLocate, bottomInset }: MapProps) {
  const { t } = useTheme();
  const map = useRef<MapView>(null);
  const points = businesses.filter(pinned);
  const padding = { top: 48, right: 48, bottom: bottomInset + 48, left: 48 };

  const fit = () => {
    if (points.length > 1) map.current?.fitToCoordinates(points.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: padding, animated: false });
  };

  const locate = () => {
    if (!me) return onLocate();
    map.current?.animateToRegion({ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }, 400);
  };

  return (
    <View style={{ flex: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.surface }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        initialRegion={regionFor(points)}
        onMapReady={fit}
        onPress={(e) => {
          // A tap on a marker also reaches the map on Android; only a tap on the map itself clears the selection.
          if (e.nativeEvent.action !== 'marker-press') onSelect(null);
        }}
        showsUserLocation={!!me}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        toolbarEnabled={false}
        userInterfaceStyle={t.dark ? 'dark' : 'light'}
        customMapStyle={Platform.OS === 'android' && t.dark ? DARK_STYLE : undefined}
        mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
        accessibilityLabel="מפת העסקים המשתתפים"
      >
        {points.map((b) => {
          const on = b.id === selectedId;
          return (
            <Marker
              // A new key when the selection changes redraws the pin; otherwise Android keeps a static snapshot.
              key={`${b.id}${on ? ':on' : ''}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              onPress={() => onSelect(b.id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={on ? 2 : 1}
              accessibilityLabel={`${b.name}${b.isSample ? ', לדוגמה' : ''}`}
            >
              <Pin initial={b.initial} on={on} />
            </Marker>
          );
        })}
      </MapView>

      <Pressable
        onPress={locate}
        accessibilityRole="button"
        accessibilityLabel={me ? 'מרכוז המפה על המיקום שלי' : 'הצגת המיקום שלי במפה'}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 12,
          end: 12,
          width: touch,
          height: touch,
          borderRadius: touch / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? t.surfaceStrong : t.bg,
          elevation: 3,
          shadowColor: '#000000',
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        })}
      >
        <LocateIcon size={22} color={t.text} />
      </Pressable>
    </View>
  );
}

/** A rounded pin with the business initial: ink with lime, lime with ink when selected (the brand dot). */
function Pin({ initial, on }: { initial: string; on: boolean }) {
  const size = on ? 44 : 36;
  const bg = on ? colors.lime : colors.ink;
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: bg,
          borderWidth: 2,
          borderColor: on ? colors.ink : colors.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={on ? 18 : 15} weight={800} color={on ? colors.ink : colors.lime}>{initial}</Txt>
      </View>
      <View style={{ width: 8, height: 8, marginTop: -5, transform: [{ rotate: '45deg' }], backgroundColor: on ? colors.ink : colors.paper }} />
    </View>
  );
}

/** Google Maps night style in the app's ink tones (Android; iOS follows userInterfaceStyle). */
const DARK_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1F221B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#B9BCB0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#11130F' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2E24' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#11130F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#303626' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#11130F' }] },
];
