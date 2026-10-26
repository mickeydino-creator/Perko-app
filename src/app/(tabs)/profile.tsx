import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { formatIsraeliPhone } from '../../../supabase/functions/_shared/loyalty.ts';
import { Wordmark } from '../../components/Brand';
import { ChevronIcon } from '../../components/Icons';
import { Txt } from '../../components/Txt';
import { Button, DemoBanner, Heading, Screen } from '../../components/ui';
import { useTheme, type Appearance } from '../../lib/appearance';
import { api } from '../../lib/api';
import { NetworkError } from '../../lib/backend';
import { PRIVACY_POLICY_URL } from '../../lib/config';
import { useSession } from '../../lib/session';
import { fonts, radius, TAB_CLEARANCE, touch } from '../../theme';

export default function Profile() {
  const { t } = useTheme();
  const { profile, setProfile } = useSession();
  const [name, setName] = useState(profile?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<'idle' | 'confirm' | 'busy'>('idle');

  const saveName = async () => {
    try {
      await api.updateName(name);
      setProfile(profile ? { ...profile, name: name.trim() || null } : null);
      setSaved(true);
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof NetworkError ? 'אין חיבור לאינטרנט. השם לא נשמר.' : 'השם לא נשמר.');
    }
  };

  const signOut = async () => {
    await api.signOut();
    setProfile(null);
  };

  const remove = async () => {
    setDeleting('busy');
    try {
      await api.deleteAccount();
      setProfile(null);
    } catch (e) {
      setDeleting('confirm');
      setMessage(e instanceof NetworkError ? 'אין חיבור לאינטרנט. החשבון לא נמחק.' : 'החשבון לא נמחק. מנסים שוב.');
    }
  };

  return (
    <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
      <Heading title="פרופיל" />
      <DemoBanner />

      <View style={{ backgroundColor: t.surface, borderRadius: radius.row, padding: 16, gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Txt kind="label">שם</Txt>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setSaved(false);
            }}
            onSubmitEditing={saveName}
            placeholder="איך לקרוא לך?"
            placeholderTextColor="rgba(48, 54, 38, 0.55)"
            accessibilityLabel="שם"
            maxLength={60}
            selectionColor={t.text}
            cursorColor={t.text}
            style={{ minHeight: 52, borderRadius: 14, backgroundColor: t.surfaceAlt, paddingHorizontal: 14, fontFamily: fonts[500], fontSize: 17, color: t.text }}
          />
          <Button label={saved ? 'נשמר' : 'שמירה'} small onPress={saveName} disabled={saved || (name.trim() || null) === (profile?.name ?? null)} style={{ alignSelf: 'flex-start' }} />
        </View>
        <View style={{ gap: 2 }}>
          <Txt kind="label">{profile?.phone ? 'טלפון' : 'אימייל'}</Txt>
          <Txt size={17} style={{ writingDirection: 'ltr' }}>{profile?.phone ? formatIsraeliPhone(profile.phone) : (profile?.email ?? '')}</Txt>
        </View>
      </View>

      {message ? <Txt kind="label" style={{ marginTop: 10 }} accessibilityRole="alert">{message}</Txt> : null}

      <AppearancePicker />

      <View style={{ backgroundColor: t.surface, borderRadius: radius.row, marginTop: 12, overflow: 'hidden' }}>
        <Row
          label="מדיניות פרטיות"
          note={PRIVACY_POLICY_URL ? undefined : 'תפורסם לפני הפיילוט'}
          onPress={PRIVACY_POLICY_URL ? () => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL!) : undefined}
        />
        <Row label="יציאה מהחשבון" onPress={signOut} />
      </View>

      <View style={{ backgroundColor: t.surface, borderRadius: radius.row, padding: 16, marginTop: 12, gap: 10 }}>
        <Txt kind="label" weight={800}>מחיקת החשבון</Txt>
        <Txt size={15} color={t.textMuted}>מוחקת את החשבון, את כל הכרטיסים, החותמות וההיסטוריה. אי אפשר לשחזר.</Txt>
        {deleting === 'idle' ? (
          <Button label="מחיקת החשבון" variant="quiet" small onPress={() => setDeleting('confirm')} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button label="כן, למחוק לצמיתות" small onPress={remove} busy={deleting === 'busy'} />
            <Button label="ביטול" variant="quiet" small onPress={() => setDeleting('idle')} />
          </View>
        )}
      </View>

      <View style={{ marginTop: 28, gap: 6 }}>
        <Wordmark size={24} />
        <Txt kind="small" color={t.textMuted}>
          גישה מוקדמת · גרסה {Constants.expoConfig?.version ?? ''}{api.mode === 'demo' ? ' · מצב הדגמה' : ''}
        </Txt>
      </View>
    </Screen>
  );
}

const appearanceOptions: { id: Appearance; label: string }[] = [
  { id: 'system', label: 'לפי הטלפון' },
  { id: 'light', label: 'בהיר' },
  { id: 'dark', label: 'כהה' },
];

/** Profile > מראה: follow the phone, or always light, or always dark. */
function AppearancePicker() {
  const { t, appearance, setAppearance } = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.row, padding: 16, marginTop: 12, gap: 10 }}>
      <Txt kind="label" weight={800} accessibilityRole="header">מראה</Txt>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: radius.pill, padding: 4 }}>
        {appearanceOptions.map((o) => {
          const on = o.id === appearance;
          return (
            <Pressable
              key={o.id}
              onPress={() => setAppearance(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`מראה: ${o.label}`}
              style={{ flex: 1, minHeight: touch - 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent' }}
            >
              <Txt kind="label" weight={on ? 700 : 500} color={on ? t.onAccent : t.text}>{o.label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({ label, note, onPress }: { label: string; note?: string; onPress?: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      style={({ pressed }) => ({
        minHeight: touch + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: pressed ? t.surfaceAlt : 'transparent', borderBottomWidth: 1, borderBottomColor: t.surfaceAlt,
      })}
    >
      <View>
        <Txt kind="label" size={16}>{label}</Txt>
        {note ? <Txt size={13} color={t.textMuted}>{note}</Txt> : null}
      </View>
      {onPress ? <ChevronIcon size={18} color={t.textMuted} /> : null}
    </Pressable>
  );
}
