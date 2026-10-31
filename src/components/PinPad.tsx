// The number pad a staff member uses to confirm a stamp or a reward on the customer's phone.
// The digits are never shown, only dots, so a customer watching does not learn the code. Submits on the 4th digit.
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';
import { PIN_LENGTH } from '../../supabase/functions/_shared/token.ts';
import { useTheme } from '../lib/appearance';
import { useReduceMotion } from '../lib/hooks';
import { ChevronIcon } from './Icons';
import { Txt } from './Txt';

type Props = {
  /** Called with the 4 digits. The pad clears itself when `error` or `resetKey` changes. */
  onComplete: (pin: string) => void;
  busy?: boolean;
  /** Shown under the dots, e.g. "הקוד שגוי. נשארו 2 ניסיונות". */
  error?: string | null;
  /** No input: the customer is locked out. */
  disabled?: boolean;
  /** Change it to clear the digits (after a wrong PIN). */
  resetKey?: number;
};

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']];

export function PinPad({ onComplete, busy, error, disabled, resetKey }: Props) {
  const { t } = useTheme();
  const reduce = useReduceMotion();
  const [pin, setPin] = useState('');
  const shake = useState(() => new Animated.Value(0))[0];

  // A new error (wrong PIN) or a reset clears the digits and shakes the dots.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the pad is the response to a server answer
    setPin('');
    if (!error || reduce) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    shake.setValue(0);
    Animated.sequence(
      [8, -8, 6, -6, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 50, useNativeDriver: true })),
    ).start();
  }, [error, resetKey, reduce, shake]);

  const off = disabled || busy;
  const press = (key: string) => {
    if (off) return;
    Haptics.selectionAsync().catch(() => undefined);
    if (key === 'del') return setPin((p) => p.slice(0, -1));
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  return (
    <View style={{ gap: 18, alignItems: 'center', alignSelf: 'stretch' }}>
      <Animated.View
        style={{ flexDirection: 'row', direction: 'ltr', gap: 16, height: 24, alignItems: 'center', transform: [{ translateX: shake }] }}
        accessible
        accessibilityLabel={`הוקלדו ${pin.length} מתוך ${PIN_LENGTH} ספרות`}
        accessibilityLiveRegion="polite"
      >
        {busy ? (
          <ActivityIndicator color={t.text} accessibilityLabel="בודקים את הקוד" />
        ) : (
          Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View
              key={i}
              style={{
                width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: t.text,
                backgroundColor: i < pin.length ? t.text : 'transparent',
              }}
            />
          ))
        )}
      </Animated.View>
      <Txt kind="label" align="center" color={error ? t.text : t.textMuted} accessibilityRole={error ? 'alert' : undefined} style={{ minHeight: 22 }}>
        {error ?? 'הקוד מוקלד על ידי הצוות בקופה'}
      </Txt>
      {/* Phone keypads read left to right in every language. */}
      <View style={{ gap: 10, direction: 'ltr', alignSelf: 'stretch', opacity: disabled ? 0.4 : 1 }}>
        {ROWS.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((key, c) =>
              key === '' ? (
                <View key={c} style={{ flex: 1 }} />
              ) : (
                <Pressable
                  key={c}
                  onPress={() => press(key)}
                  disabled={off}
                  accessibilityRole="button"
                  accessibilityLabel={key === 'del' ? 'מחיקת ספרה' : key}
                  style={({ pressed }) => ({
                    flex: 1, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: key === 'del' ? 'transparent' : pressed ? t.surfaceStrong : t.surfaceAlt,
                  })}
                >
                  {key === 'del' ? (
                    <ChevronIcon size={26} color={t.text} />
                  ) : (
                    <Txt size={26} weight={700} tabular>{key}</Txt>
                  )}
                </Pressable>
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
