import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { programLine } from '../../components/CardViews';
import { SearchIcon } from '../../components/Icons';
import { Txt } from '../../components/Txt';
import { Avatar, DemoBanner, Heading, LoadState, Screen, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { categoryLabels, type Business, type Category } from '../../lib/types';
import { colors, fonts, radius, TAB_CLEARANCE, touch } from '../../theme';

const filters: (Category | 'all')[] = ['all', 'cafe', 'food', 'shop'];

export default function Discover() {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const [businesses, cards] = await Promise.all([api.listBusinesses(), api.listCards()]);
    return { businesses, inWallet: new Set(cards.map((c) => c.business.id)) };
  });

  const q = query.trim();
  const list = (data?.businesses ?? []).filter(
    (b) => (filter === 'all' || b.category === filter) && (!q || b.name.includes(q) || b.kind.includes(q)),
  );

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

  return (
    <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
      <Heading title="גילוי" />
      <DemoBanner />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper, borderRadius: radius.row, paddingHorizontal: 14, minHeight: 52 }}>
        <SearchIcon />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="חיפוש עסקים משתתפים"
          placeholderTextColor={colors.muted}
          accessibilityLabel="חיפוש עסקים משתתפים"
          selectionColor={colors.ink}
          cursorColor={colors.ink}
          style={{ flex: 1, minHeight: touch, fontFamily: fonts[400], fontSize: 16, color: colors.ink }}
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
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? colors.ink : colors.paper }}>
                <Txt kind="label" weight={on ? 700 : 500} color={on ? colors.lime : colors.ink}>{categoryLabels[f]}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !list.length ? <Txt color={colors.muted} style={{ paddingVertical: 24 }}>לא נמצאו עסקים משתתפים.</Txt> : null}

      <View style={{ gap: 8 }}>
        {list.map((b) => {
          const added = data?.inWallet.has(b.id);
          return (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderRadius: radius.row, overflow: 'hidden' }}>
              <Pressable
                onPress={() => router.push({ pathname: '/business/[id]', params: { id: b.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${b.name}, ${b.kind}. ${programLine(b)}${added ? '. בארנק' : ''}`}
                accessibilityHint="פותח את דף העסק"
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: pressed ? colors.paleStrong : 'transparent' })}
              >
                <Avatar initial={b.initial} tone={b.tone} />
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt kind="label" size={16} weight={800}>{b.name}</Txt>
                    {b.isSample ? <Tag label="לדוגמה" /> : null}
                  </View>
                  <Txt size={14} color={colors.muted}>{b.kind}</Txt>
                  <Txt size={14} weight={600}>{programLine(b)}</Txt>
                </View>
              </Pressable>
              <View style={{ paddingEnd: 12 }}>
                {added ? (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.pale }}>
                    <Txt size={14} weight={700} color={colors.muted}>בארנק</Txt>
                  </View>
                ) : b.program ? (
                  <Pressable
                    onPress={() => add(b)}
                    accessibilityRole="button"
                    accessibilityLabel={`הוספת ${b.name} לארנק`}
                    disabled={adding === b.id}
                    style={{ minHeight: touch, justifyContent: 'center' }}
                  >
                    {({ pressed }) => (
                      <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: pressed ? colors.inkRaised : colors.ink, opacity: adding === b.id ? 0.6 : 1 }}>
                        <Txt size={14} weight={700} color={colors.lime}>הוספה</Txt>
                      </View>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {data?.businesses.some((b) => b.isSample) ? (
        <Txt kind="small" color={colors.muted} style={{ marginTop: 18 }}>
          העסקים המסומנים ״לדוגמה״ הם המחשה של המוצר, לא עסקים שמשתתפים בפועל.
        </Txt>
      ) : null}
    </Screen>
  );
}
