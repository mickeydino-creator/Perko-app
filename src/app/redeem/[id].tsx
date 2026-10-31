import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { lockedMessage, wrongPinMessage } from '../../../supabase/functions/_shared/loyalty.ts';
import { PinPad } from '../../components/PinPad';
import { Progress } from '../../components/Stamps';
import { Txt } from '../../components/Txt';
import { Button, LoadState, Screen, Tag, TopBar } from '../../components/ui';
import { OnBrand } from '../../components/surface';
import { useTheme } from '../../lib/appearance';
import { api } from '../../lib/api';
import { NetworkError } from '../../lib/backend';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../theme';

/**
 * "ההטבה מוכנה": the customer shows the screen at the counter and the staff member confirms the reward by typing
 * their PIN on this phone. A screenshot cannot confirm anything: only the PIN, checked on the server, does.
 */
export default function Redeem() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(() => api.getCard(id), [id]);
  const card = data?.card;

  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState<{ reward: string } | null>(null);

  const confirm = async (pin: string) => {
    setBusy(true);
    try {
      const r = await api.confirmRedeem(id, pin);
      if (r.status === 'redeemed') setDone({ reward: r.reward });
      else if (r.status === 'wrong_pin') setPinError(wrongPinMessage(r.attemptsLeft));
      else if (r.status === 'locked') {
        setLocked(true);
        setPinError(`${lockedMessage()}.`);
      } else setPinError('ההטבה כבר מומשה או שהכרטיס לא מלא.');
    } catch (e) {
      setPinError(e instanceof NetworkError ? 'אין חיבור לאינטרנט. ההטבה לא מומשה, מנסים שוב.' : 'משהו השתבש. ההטבה לא מומשה.');
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  };

  if (done) return <Done reward={done.reward} business={card?.business.name ?? ''} />;

  const unit = card?.program.type === 'points' ? 'נקודות' : 'חותמות';

  return (
    <Screen bg={t.surface}>
      <TopBar />
      {data === undefined ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {card ? (
        <>
          <View style={{ paddingBottom: 14 }}>
            <Txt kind="lead" size={16} color={t.textMuted}>{card.business.name}</Txt>
            <Txt kind="title" accessibilityRole="header">{card.status === 'complete' ? 'ההטבה מוכנה' : 'ההטבה עוד לא מוכנה'}</Txt>
          </View>

          <OnBrand>
          <View style={{ backgroundColor: colors.lime, borderRadius: 24, padding: 22, paddingTop: 24 }}>
            <Progress type={card.program.type} goal={card.program.goal} current={card.current} onLime />
            <Txt kind="title" size={28} style={{ marginTop: 16 }}>{card.program.reward}</Txt>
            <Txt size={15} color={colors.muted}>{card.current} מתוך {card.program.goal} {unit} נאספו</Txt>
            {card.business.isSample ? <View style={{ marginTop: 10 }}><Tag label="עסק לדוגמה" onLime /></View> : null}
          </View>
          </OnBrand>

          {card.status === 'complete' ? (
            <View style={{ marginTop: 22, gap: 12 }}>
              <Txt kind="title" size={22} align="center">מציגים לקופאי/ת</Txt>
              <Txt kind="label" color={t.textMuted} align="center">הצוות מקליד את הקוד שלו כדי לממש. אחרי המימוש מתחיל כרטיס חדש.</Txt>
              <PinPad onComplete={confirm} busy={busy} error={pinError} disabled={locked} resetKey={resetKey} />
            </View>
          ) : (
            <Txt color={t.textMuted} style={{ marginTop: 20 }}>כשהכרטיס מתמלא, ההטבה מופיעה כאן.</Txt>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Done({ reward, business }: { reward: string; business: string }) {
  const { t } = useTheme();
  return (
    <Screen bg={t.hero} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: 14 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.accent }} />
      <Txt kind="display" accessibilityRole="header">ההטבה מומשה</Txt>
      <Txt kind="lead" color={t.onHeroMuted}>{reward} ב{business}. כרטיס חדש כבר התחיל בארנק.</Txt>
      <Button label="חזרה לכרטיסים" onPress={() => router.dismissTo('/')} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
    </Screen>
  );
}
