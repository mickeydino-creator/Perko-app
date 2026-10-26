import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '../components/Brand';
import { QrGlyph } from '../components/Icons';
import { Stamps } from '../components/Stamps';
import { Txt } from '../components/Txt';
import { Button, Reveal } from '../components/ui';
import { OnBrand } from '../components/surface';
import { useTheme } from '../lib/appearance';
import { useSession } from '../lib/session';
import { colors, gutter, radius, touch } from '../theme';

const slides = [
  {
    title: 'כל הכרטיסים.\nמקום אחד.',
    body: 'כרטיסי הנאמנות של העסקים השכונתיים שמשתתפים ב-Perko, בארנק אחד. בלי כרטיס נייר לכל עסק ובלי אפליקציה לכל מועדון.',
    art: 'stamps',
  },
  {
    title: 'סורקים\nבקופה.',
    body: 'אחרי רכישה מזכה סורקים את קוד ה-QR שבקופה, והחותמת או הנקודות נוספות לכרטיס של אותו עסק.',
    art: 'qr',
  },
  {
    title: 'מממשים\nכשמגיעים.',
    body: 'כל עסק קובע את כללי הצבירה ואת ההטבה שלו. כשהכרטיס מלא, מציגים את ההטבה לצוות בקופה.',
    art: 'reward',
  },
] as const;

export default function Onboarding() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { finishOnboarding } = useSession();
  const [i, setI] = useState(0);
  const slide = slides[i];
  const last = i === slides.length - 1;
  const done = () => {
    finishOnboarding();
    router.replace('/sign-in');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.hero, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20, paddingHorizontal: gutter + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch }}>
        <Wordmark size={30} />
        {!last ? (
          <Pressable onPress={done} accessibilityRole="button" accessibilityLabel="דילוג להתחברות" style={{ minHeight: touch, minWidth: touch, justifyContent: 'center', alignItems: 'center' }}>
            <Txt kind="label" color={t.onHeroMuted}>דילוג</Txt>
          </Pressable>
        ) : null}
      </View>

      <Reveal key={i} style={{ flex: 1, justifyContent: 'center', gap: 28 }}>
        <Art kind={slide.art} />
        <View style={{ gap: 14 }}>
          <Txt kind="display" size={44} accessibilityRole="header">{slide.title}</Txt>
          <Txt kind="lead" color={t.onHeroMuted}>{slide.body}</Txt>
        </View>
      </Reveal>

      <View style={{ gap: 18 }}>
        {last ? (
          <Txt kind="small" color={t.onHeroMuted}>
            Perko בשלב גישה מוקדמת, בפיילוט בעמק רפאים ובדרך בית לחם בירושלים.
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', gap: 8 }} accessible accessibilityRole="image" accessibilityLabel={`מסך ${i + 1} מתוך ${slides.length}`}>
            {slides.map((_, n) => (
              <View key={n} style={{ width: n === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: n === i ? t.accent : t.heroTint }} />
            ))}
          </View>
          <Button label={last ? 'בואו נתחיל' : 'המשך'} onPress={() => (last ? done() : setI(i + 1))} />
        </View>
      </View>
    </View>
  );
}

function Art({ kind }: { kind: (typeof slides)[number]['art'] }) {
  const { t } = useTheme();
  if (kind === 'stamps') {
    return (
      <View style={{ backgroundColor: t.dark ? colors.inkRaised : colors.ink, borderRadius: radius.card, padding: 22, gap: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Txt kind="label" color={colors.paper}>קפה פינה · כרטיס קפה</Txt>
        <View style={{ opacity: 1 }}>
          <InkStamps />
        </View>
      </View>
    );
  }
  if (kind === 'qr') {
    return (
      <View style={{ alignSelf: 'flex-start', backgroundColor: t.dark ? colors.inkRaised : colors.ink, borderRadius: radius.card, padding: 24 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ backgroundColor: colors.paper, borderRadius: 16, padding: 14 }}>
          <QrGlyph size={112} color={colors.ink} bg={colors.paper} />
        </View>
      </View>
    );
  }
  return (
    <OnBrand>
    <View style={{ backgroundColor: colors.paper, borderRadius: radius.card, padding: 22, gap: 14 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Stamps goal={6} current={6} />
      <Txt kind="head">קינוח לשניים</Txt>
    </View>
    </OnBrand>
  );
}

/** A stamp row drawn on ink: lime discs, the collected stamp of the brand on a dark surface. */
function InkStamps() {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      {Array.from({ length: 5 }, (_, n) => (
        <View key={n} style={{ flex: 1, aspectRatio: 1, borderRadius: 999, backgroundColor: n < 4 ? colors.lime : (t.dark ? '#2A2E24' : colors.inkRaised) }} />
      ))}
    </View>
  );
}
