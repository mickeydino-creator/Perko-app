import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PlaceInfo, programLine, RulesBox } from '../../components/CardViews';
import { Txt } from '../../components/Txt';
import { Avatar, Button, LoadState, Reveal, Screen, Tag, TopBar } from '../../components/ui';
import { OnBrand } from '../../components/surface';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { colors, radius } from '../../theme';

export default function BusinessPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useLoad(async () => {
    const [business, cards] = await Promise.all([api.getBusiness(id), api.listCards()]);
    return { business, card: cards.find((c) => c.business.id === id) ?? null };
  }, [id]);

  const b = data?.business;
  const add = async () => {
    if (!b?.program) return;
    setAdding(true);
    try {
      await api.addToWallet(b.program.id);
      reload();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Screen>
      <TopBar />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !b ? <Txt kind="head">העסק לא נמצא</Txt> : null}
      {b ? (
        <Reveal style={{ gap: 12 }}>
          <OnBrand>
          <View style={{ backgroundColor: colors.lime, borderRadius: radius.card, padding: 20, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar initial={b.initial} tone="onLime" size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt kind="title" accessibilityRole="header">{b.name}</Txt>
                <Txt color={colors.muted}>{b.kind}</Txt>
              </View>
            </View>
            {b.isSample ? <Tag label="עסק לדוגמה, לא משתתף בפועל" onLime /> : null}
            {b.program ? (
              <View style={{ gap: 2 }}>
                <Txt kind="label" color={colors.muted}>{b.program.name}</Txt>
                <Txt kind="head">{programLine(b)}</Txt>
              </View>
            ) : (
              <Txt>התוכנית של העסק עוד בהכנה.</Txt>
            )}
            {b.program ? (
              data.card ? (
                <Button label="בארנק · לכרטיס" onPress={() => router.push({ pathname: '/card/[id]', params: { id: data.card!.id } })} />
              ) : (
                <Button label="הוספה לארנק" onPress={add} busy={adding} />
              )
            ) : null}
          </View>
          </OnBrand>
          {b.program ? <RulesBox program={b.program} /> : null}
          <PlaceInfo business={b} />
        </Reveal>
      ) : null}
    </Screen>
  );
}
