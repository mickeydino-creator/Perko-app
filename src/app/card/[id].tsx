import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { remaining, remainingLabel } from '../../../supabase/functions/_shared/loyalty.ts';
import { formatDate, PlaceInfo, RulesBox } from '../../components/CardViews';
import { Progress } from '../../components/Stamps';
import { Txt } from '../../components/Txt';
import { Avatar, Button, LoadState, Reveal, Screen, Tag, TopBar } from '../../components/ui';
import { OnBrand } from '../../components/surface';
import { useTheme } from '../../lib/appearance';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { colors, radius } from '../../theme';

export default function CardDetail() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(() => api.getCard(id), [id]);
  const card = data?.card;
  const unit = card?.program.type === 'points' ? 'נקודות' : 'חותמות';

  return (
    <Screen>
      <TopBar />
      {data === undefined ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data === null ? <Txt kind="head">הכרטיס לא נמצא</Txt> : null}
      {card ? (
        <Reveal style={{ gap: 12 }}>
          {/* Website: Solution.astro .card-detail */}
          <OnBrand>
          <View style={{ backgroundColor: colors.lime, borderRadius: radius.card, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar initial={card.business.initial} tone="onLime" size={52} />
              <View style={{ flex: 1 }}>
                <Txt kind="head" accessibilityRole="header">{card.business.name}</Txt>
                <Txt size={15} color={colors.muted}>{card.business.kind} · {card.program.name}</Txt>
              </View>
            </View>
            <Txt size={18} style={{ marginTop: 26 }} accessibilityLabel={`${card.current} מתוך ${card.program.goal} ${unit}`}>
              <Txt size={60} weight={800} style={{ letterSpacing: -2.4, lineHeight: 64 }}>{card.current}</Txt> מתוך {card.program.goal} {unit}
            </Txt>
            <View style={{ marginTop: 16 }}>
              <Progress type={card.program.type} goal={card.program.goal} current={card.current} onLime animate />
            </View>
            <Txt kind="label" size={17} weight={700} style={{ marginTop: 16 }}>
              {card.status === 'complete' ? `ההטבה מוכנה: ${card.program.reward}` : `${remainingLabel(card.program.type, remaining(card.program, card.current))}: ${card.program.reward}`}
            </Txt>
            {card.business.isSample ? <View style={{ marginTop: 10 }}><Tag label="עסק לדוגמה" onLime /></View> : null}
            {card.status === 'complete' ? (
              <Button label="מימוש ההטבה" onPress={() => router.push({ pathname: '/redeem/[id]', params: { id: card.id } })} style={{ marginTop: 18 }} hint="פותח את מסך ההטבה להצגה בקופה" />
            ) : null}
          </View>
          </OnBrand>

          <RulesBox program={card.program} />

          <View style={{ backgroundColor: t.surface, borderRadius: radius.row, paddingHorizontal: 16, paddingVertical: 14 }}>
            <Txt kind="label" weight={800} style={{ marginBottom: 6 }} accessibilityRole="header">היסטוריה</Txt>
            {data!.events.length === 0 ? (
              <Txt size={15} color={t.textMuted}>עוד לא נאספו {unit} בכרטיס הזה.</Txt>
            ) : (
              data!.events.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.surfaceAlt }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent }} />
                    <Txt size={15} weight={600}>{card.program.type === 'points' ? `${e.amount} נקודות` : e.amount === 1 ? 'חותמת' : `${e.amount} חותמות`}</Txt>
                  </View>
                  <Txt size={14} color={t.textMuted}>{formatDate(e.createdAt)}</Txt>
                </View>
              ))
            )}
          </View>

          <PlaceInfo business={card.business} />
          <Button label="לדף העסק" variant="quiet" onPress={() => router.push({ pathname: '/business/[id]', params: { id: card.business.id } })} />
        </Reveal>
      ) : null}
    </Screen>
  );
}
