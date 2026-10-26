import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { formatIsraeliPhone, normalizeEmail, normalizeIsraeliPhone } from '../../supabase/functions/_shared/loyalty.ts';
import { Wordmark } from '../components/Brand';
import { Txt } from '../components/Txt';
import { Button, DemoBanner, Screen, TopBar } from '../components/ui';
import { useTheme } from '../lib/appearance';
import { api } from '../lib/api';
import { NetworkError } from '../lib/backend';
import { APPLE_SIGN_IN, DEMO, EMAIL_CODE_LENGTH, GOOGLE_SIGN_IN, PHONE_SIGN_IN, PRIVACY_POLICY_URL, TERMS_URL } from '../lib/config';
import { useSession } from '../lib/session';
import type { OAuthProvider, SignInTarget } from '../lib/types';
import Svg, { Path } from 'react-native-svg';
import { colors, fonts, radius, touch } from '../theme';

const RESEND_SECONDS = 30;
/** Social buttons first, email as the second option. */
const SOCIAL = GOOGLE_SIGN_IN || APPLE_SIGN_IN;

type Method = 'email' | 'phone';

const copy = {
  email: {
    title: 'כניסה\nל-Perko',
    lead: SOCIAL ? 'ממשיכים עם חשבון Google, או מקבלים קוד חד-פעמי במייל.' : 'נשלח קוד חד-פעמי למייל. הכתובת משמשת רק לכניסה לחשבון.',
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
  // With social sign-in, the email form opens only on request.
  const [emailOpen, setEmailOpen] = useState(!SOCIAL);
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null);
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

  const social = async (provider: OAuthProvider) => {
    setOauthBusy(provider);
    setError(null);
    try {
      const p = await api.signInWithProvider(provider);
      if (p) {
        setProfile(p);
        router.replace('/');
      }
    } catch (e) {
      setError(e instanceof NetworkError ? 'אין חיבור לאינטרנט. בודקים את החיבור ומנסים שוב.' : 'הכניסה לא הושלמה. מנסים שוב, או נכנסים עם אימייל.');
    } finally {
      setOauthBusy(null);
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

        {step === 'enter' && SOCIAL ? (
          <View style={{ gap: 10, marginBottom: 18 }}>
            {GOOGLE_SIGN_IN ? <GoogleButton onPress={() => social('google')} busy={oauthBusy === 'google'} /> : null}
            {APPLE_SIGN_IN ? <AppleButton onPress={() => social('apple')} busy={oauthBusy === 'apple'} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={{ flex: 1, height: 1, backgroundColor: t.heroTint }} />
              <Txt kind="label" color={t.onHeroMuted}>או</Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: t.heroTint }} />
            </View>
          </View>
        ) : null}

        {step === 'enter' && !emailOpen ? (
          <Button label="כניסה עם אימייל" variant="quiet" onPress={() => setEmailOpen(true)} hint="פותח שדה לכתובת אימייל, ונשלח אליה קוד חד-פעמי" />
        ) : step === 'enter' ? (
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
            emailOpen ? <Button label="שליחת קוד" onPress={send} busy={busy} /> : null
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
          פרטי הכניסה (כתובת המייל, ובכניסה עם Google גם השם שבחשבון) משמשים רק לכניסה לחשבון, ונשמרים אצל ספק הענן שלנו. בכניסה אתם מאשרים את{' '}
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

/** "Continue with Google" per Google's branding guidelines: the four-colour G, light or dark neutral pill. */
function GoogleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const { t } = useTheme();
  const bg = t.dark ? '#131314' : '#FFFFFF';
  const fg = t.dark ? '#E3E3E3' : '#1F1F1F';
  const stroke = t.dark ? '#8E918F' : '#747775';
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel="המשך עם Google"
      accessibilityState={{ busy }}
      style={({ pressed }) => ({
        minHeight: 56, borderRadius: radius.pill, borderWidth: 1, borderColor: stroke, backgroundColor: bg,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: pressed || busy ? 0.8 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={20} height={20} viewBox="0 0 48 48">
            <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </Svg>
          </View>
          <Txt kind="label" size={17} weight={600} color={fg}>המשך עם Google</Txt>
        </>
      )}
    </Pressable>
  );
}

/** "Continue with Apple" (Apple's guidelines: black pill, or white on dark). Shown once APPLE_SIGN_IN is on. */
function AppleButton({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  const { t } = useTheme();
  const bg = t.dark ? colors.paper : '#000000';
  const fg = t.dark ? '#000000' : '#FFFFFF';
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel="המשך עם Apple"
      accessibilityState={{ busy }}
      style={({ pressed }) => ({ minHeight: 56, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.8 : 1 })}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Txt kind="label" size={17} weight={600} color={fg}>המשך עם Apple</Txt>}
    </Pressable>
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
