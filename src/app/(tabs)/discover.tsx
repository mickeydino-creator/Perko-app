import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { programLine } from '../../components/CardViews';
import { ChevronIcon, SearchIcon } from '../../components/Icons';
import { BusinessMap } from '../../components/map/BusinessMap';
import { Txt } from '../../components/Txt';
import { Avatar, DemoBanner, Heading, LoadState, Screen, Tag } from '../../components/ui';
import { useTheme } from '../../lib/appearance';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { distanceTo, formatDistance, useMyLocation } from '../../lib/location';
import { categoryLabels, type Business, type Category } from '../../lib/types';
import { fonts, radius, TAB_CLEARANCE, touch } from '../../theme';

const filters: (Category | 'all')[] = ['all', 'cafe', 'food', 'shop'];
type View_ = 'list' | 'map';
/** Height kept for the selected business card over the map. */
const CARD_SPACE = 150;

export default function Discover() {
  const { t } = useTheme();
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [view, setView] = useState<View_>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const location = useMyLocation();
  const { data, error, loading, reload } = useLoad(async () => {
    const [businesses, cards] = await Promise.all([api.listBusinesses(), api.listCards()]);
    return { businesses, inWallet: new Set(cards.map((c) => c.business.id)) };
  });

  const q = query.trim();
  const { me } = location;
  // Closest first once the location is known; otherwise the server's order (by name).
  const list = useMemo(() => {
    const found = (data?.businesses ?? [])
      .filter((b) => (filter === 'all' || b.category === filter) && (!q || b.name.includes(q) || b.kind.includes(q)))
      .map((b) => ({ b, d: distanceTo(me, b) }));
    if (me) found.sort((x, y) => (x.d ?? Infinity) - (y.d ?? Infinity));
    return found;
  }, [data, filter, q, me]);
  const selected = list.find((x) => x.b.id === selectedId) ?? null;

  const show = (v: View_) => {
    setView(v);
    // The map is where the location is useful: ask the first time it opens.
    if (v === 'map' && !location.me && !location.denied) location.request();
  };

  const add = async (b: Business) => {
    if (!b.program) return;
    setAdding(b.id);
    try {
      await api.addToWallet(b.program.id);
      reload();
    } finally {
      setAdding(null);
    }
  };

  const header = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Heading title="גילוי" />
        <ViewToggle view={view} onChange={show} />
      </View>
      <DemoBanner />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderRadius: radius.row, paddingHorizontal: 14, minHeight: 52 }}>
        <SearchIcon color={t.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="חיפוש עסקים משתתפים"
          placeholderTextColor={t.placeholder}
          accessibilityLabel="חיפוש עסקים משתתפים"
          selectionColor={t.text}
          cursorColor={t.text}
          style={{ flex: 1, minHeight: touch, fontFamily: fonts[400], fontSize: 16, color: t.text }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 14, flexWrap: 'wrap' }} accessibilityRole="tablist">
        {filters.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={categoryLabels[f]}
              style={{ minHeight: touch, justifyContent: 'center' }}
            >
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? t.accent : t.surface }}>
                <Txt kind="label" weight={on ? 700 : 500} color={on ? t.onAccent : t.text}>{categoryLabels[f]}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !list.length ? <Txt color={t.textMuted} style={{ paddingVertical: 24 }}>לא נמצאו עסקים משתתפים.</Txt> : null}
    </>
  );

  if (view === 'map') {
    return (
      <Screen scroll={false} bottom={TAB_CLEARANCE + 12} edgeBottom={false}>
        {header}
        {data ? (
          <View style={{ flex: 1 }}>
            <BusinessMap
              businesses={list.map((x) => x.b)}
              me={me}
              selectedId={selected ? selectedId : null}
              onSelect={setSelectedId}
              onLocate={location.request}
              bottomInset={selected ? CARD_SPACE : 0}
            />
            {selected ? (
              <View style={{ position: 'absolute', start: 10, end: 10, bottom: 10 }}>
                <BusinessRow b={selected.b} distance={selected.d} added={!!data.inWallet.has(selected.b.id)} adding={adding === selected.b.id} onAdd={add} raised />
              </View>
            ) : null}
            {location.denied ? (
              <Txt kind="small" color={t.textMuted} style={{ marginTop: 8 }}>
                בלי הרשאת מיקום המפה מציגה את העסקים בלבד. אפשר לאשר מיקום בהגדרות הטלפון.
              </Txt>
            ) : null}
          </View>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
      {header}
      <View style={{ gap: 8 }}>
        {list.map(({ b, d }) => (
          <BusinessRow key={b.id} b={b} distance={d} added={!!data?.inWallet.has(b.id)} adding={adding === b.id} onAdd={add} />
        ))}
      </View>

      {data?.businesses.some((b) => b.isSample) ? (
        <Txt kind="small" color={t.textMuted} style={{ marginTop: 18 }}>
          העסקים המסומנים ״לדוגמה״ הם המחשה של המוצר, לא עסקים שמשתתפים בפועל.
        </Txt>
      ) : null}
    </Screen>
  );
}

/** "רשימה | מפה" switch next to the heading. */
function ViewToggle({ view, onChange }: { view: View_; onChange: (v: View_) => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: radius.pill, padding: 3, marginBottom: 12 }} accessibilityRole="tablist">
      {(['list', 'map'] as const).map((v) => {
        const on = v === view;
        const label = v === 'list' ? 'רשימה' : 'מפה';
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`תצוגת ${label}`}
            hitSlop={4}
            style={{ minHeight: 40, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent' }}
          >
            <Txt kind="label" size={15} weight={on ? 700 : 500} color={on ? t.onAccent : t.text}>{label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

type RowProps = { b: Business; distance: number | null; added: boolean; adding: boolean; onAdd: (b: Business) => void; raised?: boolean };

/** A business in the list, and the card of the selected pin on the map. */
function BusinessRow({ b, distance, added, adding, onAdd, raised }: RowProps) {
  const { t } = useTheme();
  const away = distance != null ? formatDistance(distance) : null;
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', backgroundColor: raised ? t.bg : t.surface, borderRadius: radius.row, overflow: 'hidden' },
        raised ? { elevation: 6, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } : null,
      ]}
    >
      <Pressable
        onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${b.name}, ${b.kind}. ${programLine(b)}${away ? `. במרחק ${away}` : ''}${added ? '. בארנק' : ''}`}
        accessibilityHint="פותח את דף העסק"
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: pressed ? t.surfaceStrong : 'transparent' })}
      >
        <Avatar initial={b.initial} tone={b.tone} />
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt kind="label" size={16} weight={800} numberOfLines={1} style={{ flexShrink: 1 }}>{b.name}</Txt>
            {b.isSample ? <Tag label="לדוגמה" /> : null}
          </View>
          <Txt size={14} color={t.textMuted} numberOfLines={1}>{away ? `${b.kind} · ${away}` : b.kind}</Txt>
          <Txt size={14} weight={600} numberOfLines={1}>{programLine(b)}</Txt>
        </View>
        {raised ? <ChevronIcon size={18} color={t.textMuted} /> : null}
      </Pressable>
      <View style={{ paddingHorizontal: 12, flexShrink: 0 }}>
        {added ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: t.surfaceAlt }}>
            <Txt size={14} weight={700} color={t.textMuted}>בארנק</Txt>
          </View>
        ) : b.program ? (
          <Pressable
            onPress={() => onAdd(b)}
            accessibilityRole="button"
            accessibilityLabel={`הוספת ${b.name} לארנק`}
            disabled={adding}
            style={{ minHeight: touch, justifyContent: 'center' }}
          >
            {({ pressed }) => (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: pressed ? t.accentPressed : t.accent, opacity: adding ? 0.6 : 1 }}>
                <Txt size={14} weight={700} color={t.onAccent}>הוספה</Txt>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
