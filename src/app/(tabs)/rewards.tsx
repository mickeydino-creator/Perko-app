import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDay, HeroCard } from '../../components/CardViews';
import { Txt } from '../../components/Txt';
import { DemoBanner, Heading, LoadState, Screen } from '../../components/ui';
import { useTheme } from '../../lib/appearance';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { radius, TAB_CLEARANCE } from '../../theme';

export default function Rewards() {
  const { t } = useTheme();
  const { data, error, loading, reload } = useLoad(async () => {
    const [cards, history] = await Promise.all([api.listCards(), api.listRedemptions()]);
    return { ready: cards.filter((c) => c.status === 'complete'), history };
  });

  return (
    <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
      <Heading title="הטבות" />
      <DemoBanner />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}

      {data ? (
        <>
          <Txt kind="label" size={17} weight={700} style={{ marginBottom: 10 }} accessibilityRole="header">מוכנות למימוש</Txt>
          {data.ready.length ? (
            <View style={{ gap: 10 }}>
              {data.ready.map((c) => (
                <HeroCard key={c.id} card={c} onPress={() => router.push({ pathname: '/redeem/[id]', params: { id: c.id } })} />
              ))}
            </View>
          ) : (
            <View style={{ backgroundColor: t.surface, borderRadius: radius.row, padding: 16 }}>
              <Txt color={t.textMuted}>עוד אין הטבה מוכנה. כשכרטיס מתמלא, ההטבה מופיעה כאן.</Txt>
            </View>
          )}

          <Txt kind="label" size={17} weight={700} style={{ marginTop: 26, marginBottom: 10 }} accessibilityRole="header">מומשו</Txt>
          {data.history.length ? (
            <View style={{ backgroundColor: t.surface, borderRadius: radius.row, paddingHorizontal: 16, paddingVertical: 6 }}>
              {data.history.map((r, i) => (
                <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.surfaceAlt }}>
                  <Txt kind="label" weight={700}>{r.reward}</Txt>
                  <Txt size={14} color={t.textMuted}>{r.businessName} · {formatDay(r.createdAt)}</Txt>
                </View>
              ))}
            </View>
          ) : (
            <Txt color={t.textMuted}>עוד לא מומשו הטבות.</Txt>
          )}
        </>
      ) : null}
    </Screen>
  );
}
