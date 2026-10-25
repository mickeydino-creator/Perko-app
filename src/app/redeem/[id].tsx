import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Progress } from '../../components/Stamps';
import { Txt } from '../../components/Txt';
import { Button, LoadState, Screen, Tag, TopBar } from '../../components/ui';
import { api } from '../../lib/api';
import { NetworkError } from '../../lib/backend';
import { useLoad, useReduceMotion } from '../../lib/hooks';
import { colors, fonts, radius } from '../../theme';

type Code = { code: string; expiresAt: number };

export default function Redeem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(() => api.getCard(id), [id]);
  const card = data?.card;

  const [code, setCode] = useState<Code | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reward: string } | null>(null);
  const fetching = useRef(false);

  const fetchCode = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const r = await api.redeemCode(id);
      if (r.status === 'code') {
        setCode({ code: r.code, expiresAt: new Date(r.expiresAt).getTime() });
        setCodeError(null);
      } else {
        setCode(null);
        setCodeError(r.status === 'not_ready' ? 'הכרטיס עוד לא מלא, או שההטבה כבר מומשה.' : 'הכרטיס לא נמצא.');
      }
    } catch (e) {
      setCodeError(e instanceof NetworkError ? 'אין חיבור לאינטרנט. קוד המימוש מגיע מהשרת, מתחברים ומנסים שוב.' : 'לא הצלחנו להביא קוד מימוש.');
    } finally {
      fetching.current = false;
    }
  }, [id]);

  // A live clock: the screen visibly changes every second, and the code every 30 seconds.
  useEffect(() => {
    if (done || card?.status !== 'complete') return;
    fetchCode();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [card?.status, done, fetchCode]);

  useEffect(() => {
    if (code && now >= code.expiresAt) fetchCode();
  }, [now, code, fetchCode]);

  const confirm = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const r = await api.confirmRedeem(id, code.code);
      if (r.status === 'redeemed') setDone({ reward: r.reward });
      else if (r.status === 'expired') {
        setCodeError('הקוד התחלף בינתיים. הנה הקוד החדש, מאשרים שוב.');
        await fetchCode();
      } else setCodeError('ההטבה כבר מומשה או שהכרטיס לא מלא.');
    } catch (e) {
      setCodeError(e instanceof NetworkError ? 'אין חיבור לאינטרנט. ההטבה לא מומשה, מנסים שוב.' : 'משהו השתבש. ההטבה לא מומשה.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (done) return <Done reward={done.reward} business={card?.business.name ?? ''} />;

  const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
  const unit = card?.program.type === 'points' ? 'נקודות' : 'חותמות';

  return (
    <Screen bg={colors.paper}>
      <TopBar />
      {data === undefined ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {card ? (
        <>
          <View style={{ paddingBottom: 14 }}>
            <Txt kind="lead" size={16} color={colors.muted}>{card.business.name}</Txt>
            <Txt kind="title" accessibilityRole="header">{card.status === 'complete' ? 'ההטבה מוכנה' : 'ההטבה עוד לא מוכנה'}</Txt>
          </View>

          <View style={{ backgroundColor: colors.lime, borderRadius: 24, padding: 22, paddingTop: 24 }}>
            <Progress type={card.program.type} goal={card.program.goal} current={card.current} onLime />
            <Txt kind="title" size={28} style={{ marginTop: 16 }}>{card.program.reward}</Txt>
            <Txt size={15} color={colors.muted}>{card.current} מתוך {card.program.goal} {unit} נאספו</Txt>
            {card.business.isSample ? <View style={{ marginTop: 10 }}><Tag label="עסק לדוגמה" onLime /></View> : null}
          </View>

          {card.status === 'complete' ? (
            <View style={{ marginTop: 22, gap: 12 }}>
              <Txt kind="label" color={colors.muted} align="center">מציגים את המסך לצוות בקופה</Txt>
              <LiveCode code={code?.code ?? null} secondsLeft={secondsLeft} now={now} />
              {codeError ? <Txt kind="label" align="center" accessibilityRole="alert">{codeError}</Txt> : null}

              {confirming ? (
                <View style={{ gap: 8 }}>
                  <Txt kind="label" align="center">לממש עכשיו, מול הצוות? אחרי המימוש מתחיל כרטיס חדש.</Txt>
                  <Button label="כן, לממש" onPress={confirm} busy={busy} disabled={!code} />
                  <Button label="ביטול" variant="quiet" onPress={() => setConfirming(false)} />
                </View>
              ) : (
                <Button label="מימוש ההטבה" onPress={() => setConfirming(true)} disabled={!code} />
              )}
              <Txt kind="small" color={colors.muted} align="center">הקוד מתחלף כל 30 שניות, כך שצילום מסך לא שווה מימוש.</Txt>
            </View>
          ) : (
            <Txt color={colors.muted} style={{ marginTop: 20 }}>כשהכרטיס מתמלא, ההטבה מופיעה כאן.</Txt>
          )}
        </>
      ) : null}
    </Screen>
  );
}

/** The short-lived code, a countdown bar and a ticking clock so staff can tell a live screen from a screenshot. */
function LiveCode({ code, secondsLeft, now }: { code: string | null; secondsLeft: number; now: number }) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!code || reduce) return;
    pulse.setValue(0.4);
    Animated.timing(pulse, { toValue: 1, duration: 360, useNativeDriver: true }).start();
  }, [code, reduce, pulse]);

  const clock = new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const spaced = code ? `${code.slice(0, 3)} ${code.slice(3)}` : '--- ---';
  return (
    <View
      style={{ backgroundColor: colors.ink, borderRadius: radius.card, paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center', gap: 10 }}
      accessible
      accessibilityLabel={code ? `קוד מימוש ${code.split('').join(' ')}. מתחלף בעוד ${secondsLeft} שניות.` : 'טוען קוד מימוש'}
    >
      <Animated.Text
        style={{ fontFamily: fonts[800], fontSize: 46, letterSpacing: 6, color: colors.lime, opacity: pulse, writingDirection: 'ltr', fontVariant: ['tabular-nums'] }}
      >
        {spaced}
      </Animated.Text>
      <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.inkRaised, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${(secondsLeft / 30) * 100}%`, backgroundColor: colors.lime, borderRadius: 3 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' }}>
        <Txt size={13} color={colors.slateOnInk}>מתחלף בעוד {secondsLeft} שנ׳</Txt>
        <Txt size={13} weight={700} color={colors.paper} tabular>{clock}</Txt>
      </View>
    </View>
  );
}

function Done({ reward, business }: { reward: string; business: string }) {
  return (
    <Screen bg={colors.lime} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: 14 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.ink }} />
      <Txt kind="display" accessibilityRole="header">ההטבה מומשה</Txt>
      <Txt kind="lead" color={colors.muted}>{reward} ב{business}. כרטיס חדש כבר התחיל בארנק.</Txt>
      <Button label="חזרה לכרטיסים" onPress={() => router.dismissTo('/')} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
    </Screen>
  );
}
