import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cooldownMessage, remaining, remainingLabel } from '../../supabase/functions/_shared/loyalty.ts';
import { CloseIcon } from '../components/Icons';
import { Progress } from '../components/Stamps';
import { Txt } from '../components/Txt';
import { Button } from '../components/ui';
import { collect, type CollectOutcome } from '../lib/collect';
import { DEMO } from '../lib/config';
import { demoQrPayload, SAMPLE_BUSINESSES } from '../lib/demoBackend';
import { useReduceMotion } from '../lib/hooks';
import { colors, gutter, motion, radius, touch } from '../theme';

const FRAME = 248;

export default function Scan() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ payload?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CollectOutcome | null>(null);
  const lastPayload = useRef<string | null>(null);
  const locked = useRef(false);
  const demoIndex = useRef(0);

  const run = useCallback(async (payload: string) => {
    if (locked.current) return;
    locked.current = true;
    lastPayload.current = payload;
    setBusy(true);
    const result = await collect(payload, 'qr');
    setBusy(false);
    setOutcome(result);
  }, []);

  // Opened from a perko:// link (the counter code scanned with the phone's own camera app).
  useEffect(() => {
    if (params.payload) run(params.payload);
  }, [params.payload, run]);

  const onScanned = (r: BarcodeScanningResult) => {
    if (!outcome && !busy) run(r.data);
  };

  const again = () => {
    setOutcome(null);
    // Short pause so the same code still in frame is not read again instantly.
    setTimeout(() => (locked.current = false), 600);
  };
  const retry = () => {
    const p = lastPayload.current;
    locked.current = false;
    setOutcome(null);
    if (p) run(p);
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const granted = permission?.granted;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      {granted ? (
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={outcome || busy ? undefined : onScanned}
          accessibilityLabel="תצוגת המצלמה"
        />
      ) : null}

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: gutter, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="סגירת הסריקה"
          style={({ pressed }) => ({
            width: touch, height: touch, borderRadius: touch / 2, alignItems: 'center', justifyContent: 'center',
            backgroundColor: pressed ? colors.inkRaised : 'rgba(17, 19, 15, 0.6)',
          })}
        >
          <CloseIcon color={colors.paper} />
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 28 }}>
        {outcome ? null : !permission ? (
          <ActivityIndicator color={colors.lime} />
        ) : granted ? (
          <>
            <Txt kind="lead" weight={600} color={colors.paper} align="center">מכוונים את המצלמה לקוד שבקופה</Txt>
            <Frame />
            {busy ? <ActivityIndicator color={colors.lime} accessibilityLabel="שומרים את הסריקה" /> : <View style={{ height: 20 }} />}
          </>
        ) : (
          <PermissionAsk canAsk={permission.canAskAgain} onAsk={requestPermission} />
        )}
        {DEMO && !outcome ? (
          <Button
            label="סריקת קוד לדוגמה"
            variant="lime"
            small
            busy={busy}
            hint="מצב הדגמה: מדמה סריקה של קוד בקופה של עסק לדוגמה"
            onPress={() => {
              const n = (demoIndex.current++ % SAMPLE_BUSINESSES.length) + 1;
              locked.current = false;
              run(demoQrPayload(n));
            }}
          />
        ) : null}
      </View>

      {outcome ? <ResultSheet outcome={outcome} onAgain={again} onRetry={retry} onClose={close} /> : null}
    </View>
  );
}

/** Lime corners around the target (website .ui-cam__frame). */
function Frame() {
  const c = { position: 'absolute' as const, width: 46, height: 46, borderColor: colors.lime };
  const w = 5;
  return (
    <View style={{ width: FRAME, height: FRAME }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[c, { top: 0, right: 0, borderTopWidth: w, borderRightWidth: w, borderTopRightRadius: 18 }]} />
      <View style={[c, { top: 0, left: 0, borderTopWidth: w, borderLeftWidth: w, borderTopLeftRadius: 18 }]} />
      <View style={[c, { bottom: 0, right: 0, borderBottomWidth: w, borderRightWidth: w, borderBottomRightRadius: 18 }]} />
      <View style={[c, { bottom: 0, left: 0, borderBottomWidth: w, borderLeftWidth: w, borderBottomLeftRadius: 18 }]} />
    </View>
  );
}

function PermissionAsk({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  return (
    <View style={{ gap: 14, alignSelf: 'stretch' }}>
      <Txt kind="title" color={colors.paper}>{canAsk ? 'צריך גישה למצלמה' : 'הגישה למצלמה חסומה'}</Txt>
      <Txt kind="lead" color={colors.slateOnInk}>
        {canAsk
          ? 'המצלמה משמשת רק לסריקת קוד ה-QR שבקופה. שום תמונה לא נשמרת.'
          : 'כדי לסרוק את הקוד שבקופה, מאשרים גישה למצלמה בהגדרות הטלפון: הרשאות > מצלמה.'}
      </Txt>
      <Button label={canAsk ? 'אישור גישה למצלמה' : 'פתיחת ההגדרות'} variant="lime" onPress={canAsk ? onAsk : () => Linking.openSettings()} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
    </View>
  );
}

/** The bottom sheet with the result (website .ui-sheet). Slides up with expo-out; no motion with reduce motion. */
function ResultSheet({ outcome, onAgain, onRetry, onClose }: { outcome: CollectOutcome; onAgain: () => void; onRetry: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const y = useState(() => new Animated.Value(reduce ? 0 : 1))[0];
  useEffect(() => {
    if (!reduce) Animated.timing(y, { toValue: 0, duration: 420, easing: motion.expoOut, useNativeDriver: true }).start();
  }, [reduce, y]);
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });

  const c = content(outcome);
  return (
    <Animated.View
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: colors.paper,
        borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
        paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 22,
        gap: 4,
        transform: [{ translateY }],
      }}
    >
      <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.paleStrong, alignSelf: 'center', marginBottom: 14 }} />
      <Txt kind="title" accessibilityRole="header">{c.title}</Txt>
      {c.sub ? <Txt kind="lead" size={16} color={colors.muted} style={{ marginBottom: 14 }}>{c.sub}</Txt> : null}
      {c.card ? (
        <Progress
          type={c.card.type}
          goal={c.card.goal}
          current={c.card.current}
          landIndex={outcome.status === 'ok' && c.card.type === 'stamps' ? c.card.current - 1 : undefined}
          animate
        />
      ) : null}
      {c.foot ? <Txt size={16} style={{ marginTop: 14 }}>{c.foot}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        {c.primary === 'redeem' && 'cardId' in outcome ? (
          <Button label="למימוש ההטבה" onPress={() => router.replace({ pathname: '/redeem/[id]', params: { id: outcome.cardId } })} />
        ) : null}
        {c.primary === 'retry' ? <Button label="לנסות שוב" onPress={onRetry} /> : null}
        {c.primary === 'again' ? <Button label="סריקה נוספת" onPress={onAgain} /> : null}
        {c.primary === 'done' ? <Button label="סיום" onPress={onClose} /> : <Button label="סיום" variant="quiet" onPress={onClose} />}
      </View>
    </Animated.View>
  );
}

type Content = {
  title: string;
  sub?: string;
  foot?: string;
  card?: { type: 'stamps' | 'points'; goal: number; current: number };
  primary: 'done' | 'again' | 'retry' | 'redeem';
};

function content(o: CollectOutcome): Content {
  switch (o.status) {
    case 'ok': {
      const missing = remaining({ goal: o.goal }, o.current);
      const title = o.type === 'points' ? `נוספו ${o.added} נקודות` : o.added === 1 ? 'נוספה חותמת' : `נוספו ${o.added} חותמות`;
      return {
        title: o.completed ? 'הכרטיס מלא' : title,
        sub: `${o.businessName} · ${o.programName}`,
        card: { type: o.type, goal: o.goal, current: o.current },
        foot: o.completed ? `ההטבה מוכנה: ${o.reward}. מציגים אותה לצוות בקופה.` : `${o.current} מתוך ${o.goal}. ${remainingLabel(o.type, missing)}: ${o.reward}.`,
        primary: o.completed ? 'redeem' : 'done',
      };
    }
    case 'complete':
      return {
        title: 'הכרטיס כבר מלא',
        sub: `${o.businessName} · ${o.programName}`,
        card: { type: o.type, goal: o.goal, current: o.current },
        foot: `קודם מממשים את ההטבה (${o.reward}), ואז מתחיל כרטיס חדש.`,
        primary: 'redeem',
      };
    case 'cooldown':
      return { title: 'כבר נאספה חותמת', sub: `${o.businessName}. ${cooldownMessage(o.remainingMinutes)}.`, primary: 'done' };
    case 'invalid':
    case 'not_perko':
      return { title: 'הקוד לא מוכר', sub: 'זה לא קוד Perko פעיל. סורקים את הקוד שבקופה של עסק משתתף.', primary: 'again' };
    case 'inactive':
      return { title: 'הקוד לא פעיל', sub: 'הקוד הזה הושבת, או שהעסק לא צובר כרגע. אפשר לשאול את הצוות בקופה.', primary: 'again' };
    case 'rate_limited':
      return { title: 'יותר מדי סריקות', sub: 'נסו שוב בעוד כמה דקות.', primary: 'done' };
    case 'offline':
      return { title: 'אין חיבור לאינטרנט', sub: 'הסריקה לא נשמרה. מתחברים לרשת ומנסים שוב.', primary: 'retry' };
    case 'signed_out':
      return { title: 'צריך להתחבר מחדש', sub: 'החיבור לחשבון פג. נכנסים שוב וסורקים.', primary: 'done' };
    default:
      return { title: 'משהו השתבש', sub: 'הסריקה לא נשמרה. מנסים שוב בעוד רגע.', primary: 'retry' };
  }
}
