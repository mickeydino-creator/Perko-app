import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { formatIsraeliPhone, normalizeIsraeliPhone } from '../../supabase/functions/_shared/loyalty.ts';
import { Wordmark } from '../components/Brand';
import { Txt } from '../components/Txt';
import { Button, DemoBanner, Screen, TopBar } from '../components/ui';
import { api } from '../lib/api';
import { NetworkError } from '../lib/backend';
import { DEMO } from '../lib/config';
import { useSession } from '../lib/session';
import { colors, fonts, radius, touch } from '../theme';

const RESEND_SECONDS = 30;

export default function SignIn() {
  const { setProfile, onboarded } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const e164 = normalizeIsraeliPhone(phone);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    if (!e164) {
      setError('מספר נייד ישראלי, למשל 050-123-4567');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sendCode(e164);
      setStep('code');
      setCode('');
      setWait(RESEND_SECONDS);
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e) {
      setError(e instanceof NetworkError ? 'אין חיבור לאינטרנט. בודקים את החיבור ומנסים שוב.' : 'לא הצלחנו לשלוח קוד. מנסים שוב בעוד רגע.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (!e164 || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.verifyCode(e164, value);
      setProfile(p);
      router.replace('/');
    } catch {
      setError('הקוד לא תקין או שפג תוקפו.');
      setBusy(false);
    }
  };

  // First launch: the short introduction comes before the sign-in.
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.lime }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bg={colors.lime}>
        {step === 'code' ? <TopBar onBack={() => setStep('phone')} /> : <View style={{ height: touch, justifyContent: 'center' }}><Wordmark size={30} /></View>}
        <View style={{ gap: 12, marginTop: 28, marginBottom: 28 }}>
          <Txt kind="display" accessibilityRole="header">{step === 'phone' ? 'כניסה עם\nמספר טלפון' : 'הקוד שקיבלתם\nב-SMS'}</Txt>
          <Txt kind="lead" color={colors.muted}>
            {step === 'phone'
              ? 'נשלח קוד חד-פעמי ב-SMS. המספר משמש רק לכניסה לחשבון.'
              : `שלחנו קוד בן 6 ספרות אל ${e164 ? formatIsraeliPhone(e164) : ''}.`}
          </Txt>
        </View>

        <DemoBanner />
        {DEMO && step === 'code' ? <Txt kind="small" color={colors.muted} style={{ marginTop: -4, marginBottom: 12 }}>במצב הדגמה כל קוד בן 6 ספרות מתקבל.</Txt> : null}

        {step === 'phone' ? (
          <Field
            label="מספר נייד"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            placeholder="050-000-0000"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={16}
            onSubmitEditing={send}
          />
        ) : (
          <Field
            ref={codeRef}
            label="קוד אימות"
            value={code}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              setError(null);
              if (digits.length === 6) verify(digits);
            }}
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            big
          />
        )}

        {error ? (
          <Txt kind="label" color={colors.ink} style={{ marginTop: 10 }} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {error}
          </Txt>
        ) : null}

        <View style={{ marginTop: 24, gap: 8 }}>
          {step === 'phone' ? (
            <Button label="שליחת קוד" onPress={send} busy={busy} />
          ) : (
            <>
              <Button label="כניסה" onPress={() => verify()} busy={busy} disabled={code.length !== 6} />
              <Pressable
                onPress={wait > 0 ? undefined : send}
                accessibilityRole="button"
                accessibilityState={{ disabled: wait > 0 }}
                style={{ minHeight: touch, justifyContent: 'center', alignItems: 'center' }}
              >
                <Txt kind="label" color={colors.muted}>{wait > 0 ? `אפשר לשלוח שוב בעוד ${wait} שניות` : 'שליחת קוד חדש'}</Txt>
              </Pressable>
            </>
          )}
        </View>

        <Txt kind="small" color={colors.muted} style={{ marginTop: 24 }}>
          בכניסה אתם מאשרים את מדיניות הפרטיות. Perko בשלב גישה מוקדמת.
        </Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string; big?: boolean };

const Field = ({ ref, label, big, ...input }: FieldProps & { ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) => (
  <View style={{ gap: 8 }}>
    <Txt kind="label">{label}</Txt>
    <TextInput
      ref={ref}
      accessibilityLabel={label}
      placeholderTextColor="rgba(48, 54, 38, 0.45)"
      selectionColor={colors.ink}
      cursorColor={colors.ink}
      {...input}
      style={{
        minHeight: 60,
        borderRadius: radius.row,
        backgroundColor: colors.paper,
        paddingHorizontal: 18,
        fontFamily: fonts[big ? 800 : 600],
        fontSize: big ? 30 : 22,
        letterSpacing: big ? 8 : 1,
        color: colors.ink,
        // Numbers read left to right in the RTL app; centred so the alignment is the same either way.
        textAlign: 'center',
        writingDirection: 'ltr',
      }}
    />
  </View>
);
