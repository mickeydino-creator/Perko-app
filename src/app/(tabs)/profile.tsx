import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { formatIsraeliPhone } from '../../../supabase/functions/_shared/loyalty.ts';
import { Wordmark } from '../../components/Brand';
import { ChevronIcon } from '../../components/Icons';
import { Txt } from '../../components/Txt';
import { Button, DemoBanner, Heading, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { NetworkError } from '../../lib/backend';
import { PRIVACY_POLICY_URL } from '../../lib/config';
import { useSession } from '../../lib/session';
import { colors, fonts, radius, TAB_CLEARANCE, touch } from '../../theme';

export default function Profile() {
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

      <View style={{ backgroundColor: colors.paper, borderRadius: radius.row, padding: 16, gap: 14 }}>
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
            selectionColor={colors.ink}
            cursorColor={colors.ink}
            style={{ minHeight: 52, borderRadius: 14, backgroundColor: colors.pale, paddingHorizontal: 14, fontFamily: fonts[500], fontSize: 17, color: colors.ink }}
          />
          <Button label={saved ? 'נשמר' : 'שמירה'} small onPress={saveName} disabled={saved || (name.trim() || null) === (profile?.name ?? null)} style={{ alignSelf: 'flex-start' }} />
        </View>
        <View style={{ gap: 2 }}>
          <Txt kind="label">טלפון</Txt>
          <Txt size={17} style={{ writingDirection: 'ltr' }}>{profile?.phone ? formatIsraeliPhone(profile.phone) : ''}</Txt>
        </View>
      </View>

      {message ? <Txt kind="label" style={{ marginTop: 10 }} accessibilityRole="alert">{message}</Txt> : null}

      <View style={{ backgroundColor: colors.paper, borderRadius: radius.row, marginTop: 12, overflow: 'hidden' }}>
        <Row
          label="מדיניות פרטיות"
          note={PRIVACY_POLICY_URL ? undefined : 'תפורסם לפני הפיילוט'}
          onPress={PRIVACY_POLICY_URL ? () => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL!) : undefined}
        />
        <Row label="יציאה מהחשבון" onPress={signOut} />
      </View>

      <View style={{ backgroundColor: colors.paper, borderRadius: radius.row, padding: 16, marginTop: 12, gap: 10 }}>
        <Txt kind="label" weight={800}>מחיקת החשבון</Txt>
        <Txt size={15} color={colors.muted}>מוחקת את החשבון, את כל הכרטיסים, החותמות וההיסטוריה. אי אפשר לשחזר.</Txt>
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
        <Txt kind="small" color={colors.muted}>
          גישה מוקדמת · גרסה {Constants.expoConfig?.version ?? ''}{api.mode === 'demo' ? ' · מצב הדגמה' : ''}
        </Txt>
      </View>
    </Screen>
  );
}

function Row({ label, note, onPress }: { label: string; note?: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={note ? `${label}, ${note}` : label}
      style={({ pressed }) => ({
        minHeight: touch + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: pressed ? colors.pale : 'transparent', borderBottomWidth: 1, borderBottomColor: colors.pale,
      })}
    >
      <View>
        <Txt kind="label" size={16}>{label}</Txt>
        {note ? <Txt size={13} color={colors.muted}>{note}</Txt> : null}
      </View>
      {onPress ? <ChevronIcon size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}
