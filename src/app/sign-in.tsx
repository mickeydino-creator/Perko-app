import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { formatIsraeliPhone, normalizeEmail, normalizeIsraeliPhone } from '../../supabase/functions/_shared/loyalty.ts';
import { Wordmark } from '../components/Brand';
import { Txt } from '../components/Txt';
import { Button, DemoBanner, Screen, TopBar } from '../components/ui';
import { useTheme } from '../lib/appearance';
import { api } from '../lib/api';
import { NetworkError } from '../lib/backend';
import { DEMO, EMAIL_CODE_LENGTH, PHONE_SIGN_IN, PRIVACY_POLICY_URL, TERMS_URL } from '../lib/config';
import { useSession } from '../lib/session';
import type { SignInTarget } from '../lib/types';
import { fonts, radius, touch } from '../theme';

const RESEND_SECONDS = 30;

type Method = 'email' | 'phone';

const copy = {
  email: {
    title: 'כניסה עם\nאימייל',
    lead: 'נשלח קוד חד-פעמי למייל. הכתובת משמשת רק לכניסה לחשבון.',
    codeTitle: 'הקוד שקיבלתם\nבמייל',
    codeLead: (to: string) => `שלחנו קוד אל ${to}. אם הוא לא מגיע, כדאי לבדוק גם בספאם.`,
    invalid: 'כתובת אימייל, למשל noa@example.com',
  },
  phone: {
    title: 'כניסה עם\nמספר טלפון',
    lead: 'נשלח קוד חד-פעמי ב-SMS. המספר משמש רק לכניסה לחשבון.',
    codeTitle: 'הקוד שקיבלתם\nב-SMS',
    codeLead: (to: string) => `שלחנו קוד בן 6 ספרות אל ${to}.`,
    invalid: 'מספר נייד ישראלי, למשל 050-123-4567',
  },
} as const;

export default function SignIn() {
  const { t } = useTheme();
  const { setProfile, onboarded } = useSession();
  // Email only for now (PHONE_SIGN_IN): SMS needs a paid provider before the pilot.
  const [method, setMethod] = useState<Method>('email');
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const e164 = normalizeIsraeliPhone(phone);
  const mail = normalizeEmail(email);
  const target: SignInTarget | null =
    method === 'phone' ? (e164 ? { kind: 'phone', phone: e164 } : null) : mail ? { kind: 'email', email: mail } : null;
  // SMS codes are 6 digits; email codes follow the project's Email OTP Length (EMAIL_CODE_LENGTH).
  const codeMax = method === 'phone' ? 6 : EMAIL_CODE_LENGTH;
  const tx = copy[method];

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    if (!target) {
      setError(tx.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sendCode(target);
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
    if (!target || value.length !== codeMax) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.verifyCode(target, value);
      setProfile(p);
      router.replace('/');
    } catch {
      setError('הקוד לא תקין או שפג תוקפו.');
      setBusy(false);
    }
  };

  const switchTo = (m: Method) => {
    setMethod(m);
    setError(null);
  };

  // First launch: the short introduction comes before the sign-in.
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.hero }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bg={t.hero}>
        {step === 'code' ? <TopBar onBack={() => setStep('enter')} /> : <View style={{ height: touch, justifyContent: 'center' }}><Wordmark size={30} /></View>}
        <View style={{ gap: 12, marginTop: 28, marginBottom: 24 }}>
          <Txt kind="display" accessibilityRole="header">{step === 'enter' ? tx.title : tx.codeTitle}</Txt>
          <Txt kind="lead" color={t.onHeroMuted}>
            {step === 'enter' ? tx.lead : tx.codeLead(target?.kind === 'phone' ? formatIsraeliPhone(target.phone) : (target?.email ?? ''))}
          </Txt>
        </View>

        <DemoBanner />
        {DEMO && step === 'code' ? <Txt kind="small" color={t.onHeroMuted} style={{ marginTop: -4, marginBottom: 12 }}>במצב הדגמה כל קוד בן 6 ספרות מתקבל.</Txt> : null}

        {step === 'enter' ? (
          <>
            {PHONE_SIGN_IN ? <MethodSwitch method={method} onChange={switchTo} /> : null}
            {method === 'email' ? (
              <Field
                label="אימייל"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={254}
                onSubmitEditing={send}
              />
            ) : (
              <Field
                label="מספר נייד"
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setError(null);
                }}
                placeholder="050-000-0000"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
                onSubmitEditing={send}
              />
            )}
          </>
        ) : (
          <Field
            ref={codeRef}
            label="קוד אימות"
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, codeMax);
              setCode(digits);
              setError(null);
              if (digits.length === codeMax) verify(digits);
            }}
            placeholder={"0".repeat(codeMax)}
            keyboardType="number-pad"
            autoComplete={method === 'phone' ? 'sms-otp' : 'one-time-code'}
            textContentType="oneTimeCode"
            maxLength={codeMax}
            big
          />
        )}

        {error ? (
          <Txt kind="label" color={t.onHero} style={{ marginTop: 10 }} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {error}
          </Txt>
        ) : null}

        <View style={{ marginTop: 24, gap: 8 }}>
          {step === 'enter' ? (
            <Button label="שליחת קוד" onPress={send} busy={busy} />
          ) : (
            <>
              <Button label="כניסה" onPress={() => verify()} busy={busy} disabled={code.length !== codeMax} />
              <Pressable
                onPress={wait > 0 ? undefined : send}
                accessibilityRole="button"
                accessibilityState={{ disabled: wait > 0 }}
                style={{ minHeight: touch, justifyContent: 'center', alignItems: 'center' }}
              >
                <Txt kind="label" color={t.onHeroMuted}>{wait > 0 ? `אפשר לשלוח שוב בעוד ${wait} שניות` : 'שליחת קוד חדש'}</Txt>
              </Pressable>
            </>
          )}
        </View>

        <Txt kind="small" color={t.onHeroMuted} style={{ marginTop: 24 }}>
          הכתובת או המספר משמשים רק לכניסה לחשבון ולשליחת קוד חד-פעמי, ונשמרים אצל ספק הענן שלנו. בכניסה אתם מאשרים את{' '}
          <LegalLink label="תנאי השימוש" url={TERMS_URL} /> ואת <LegalLink label="מדיניות הפרטיות" url={PRIVACY_POLICY_URL} />. Perko בשלב גישה מוקדמת.
        </Txt>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function LegalLink({ label, url }: { label: string; url: string | null }) {
  const { t } = useTheme();
  if (!url) return <>{label}</>;
  return (
    <Txt
      kind="small"
      color={t.onHero}
      onPress={() => WebBrowser.openBrowserAsync(url)}
      accessibilityRole="link"
      style={{ textDecorationLine: 'underline' }}
    >
      {label}
    </Txt>
  );
}

/** Two-option pill switch: email or phone. */
function MethodSwitch({ method, onChange }: { method: Method; onChange: (m: Method) => void }) {
  const { t } = useTheme();
  const options: { id: Method; label: string }[] = [
    { id: 'email', label: 'אימייל' },
    { id: 'phone', label: 'טלפון' },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: t.heroTint, borderRadius: radius.pill, padding: 4, marginBottom: 16 }}>
      {options.map((o) => {
        const on = o.id === method;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="tab"
            accessibilityLabel={`כניסה עם ${o.label}`}
            accessibilityState={{ selected: on }}
            style={{ minHeight: touch - 4, minWidth: 96, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent' }}
          >
            <Txt kind="label" weight={700} color={on ? t.onAccent : t.onHero}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string; big?: boolean };

const Field = ({ ref, label, big, ...input }: FieldProps & { ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) => {
  const { t } = useTheme();
  return (
  <View style={{ gap: 8 }}>
    <Txt kind="label">{label}</Txt>
    <TextInput
      ref={ref}
      accessibilityLabel={label}
      placeholderTextColor={t.placeholder}
      selectionColor={t.text}
      cursorColor={t.text}
      {...input}
      style={{
        minHeight: 60,
        borderRadius: radius.row,
        backgroundColor: t.surface,
        paddingHorizontal: 18,
        fontFamily: fonts[big ? 800 : 600],
        fontSize: big ? 30 : 22,
        letterSpacing: big ? 8 : 1,
        color: t.text,
        // Numbers read left to right in the RTL app; centred so the alignment is the same either way.
        textAlign: 'center',
        writingDirection: 'ltr',
      }}
    />
  </View>
);
};
