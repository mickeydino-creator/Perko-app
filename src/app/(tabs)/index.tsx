import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { sortWallet } from '../../../supabase/functions/_shared/loyalty.ts';
import { Txt } from '../../components/Txt';
import { Avatar, Button, DemoBanner, Heading, LoadState, Screen } from '../../components/ui';
import { WalletList } from '../../components/wallet/WalletList';
import { WalletStack } from '../../components/wallet/WalletStack';
import { api } from '../../lib/api';
import { OnBrand } from '../../components/surface';
import { useTheme } from '../../lib/appearance';
import { useLoad, useScreenReader } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import type { Business, Card } from '../../lib/types';
import { colors, gutter, radius, TAB_CLEARANCE, touch } from '../../theme';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  if (h >= 17 && h < 22) return 'ערב טוב';
  return 'לילה טוב';
}

export default function Wallet() {
  const { profile } = useSession();
  const screenReader = useScreenReader();
  const { data, error, loading, reload } = useLoad(async () => {
    const [cards, businesses] = await Promise.all([api.listCards(), api.listBusinesses()]);
    const sorted = sortWallet(cards.map((c) => ({ ...c, goal: c.program.goal })));
    return { cards: sorted as Card[], businesses };
  });

  const details = (c: Card) => router.push({ pathname: '/card/[id]', params: { id: c.id } });
  const redeem = (c: Card) => router.push({ pathname: '/redeem/[id]', params: { id: c.id } });
  const cards = data?.cards ?? [];
  const inWallet = new Set(cards.map((c) => c.business.id));
  const more = (data?.businesses ?? []).filter((b) => b.program && !inWallet.has(b.id)).slice(0, 4);

  const heading = (
    <>
      <Heading over={profile?.name ? `${greeting()}, ${profile.name}` : greeting()} title="הכרטיסים שלי" />
      <DemoBanner />
    </>
  );
  const moreSection = more.length ? (
    <View style={{ marginTop: 26 }}>
      <Txt kind="label" size={17} weight={700} style={{ marginBottom: 10 }} accessibilityRole="header">עסקים משתתפים שעוד לא בארנק</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {more.map((b) => <Chip key={b.id} business={b} />)}
      </View>
    </View>
  ) : null;

  // Loading, error and empty states keep the plain scrolling screen.
  if (!cards.length) {
    return (
      <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
        {heading}
        {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : <EmptyWallet />}
        {moreSection}
      </Screen>
    );
  }

  const header = <View style={{ paddingTop: 8, paddingHorizontal: gutter, paddingBottom: 4 }}>{heading}</View>;
  const footer = moreSection ? <View style={{ paddingHorizontal: gutter }}>{moreSection}</View> : null;

  // With TalkBack on, the same cards in a plain list: no gestures needed to reach each one.
  if (screenReader) return <WalletList cards={cards} header={header} footer={footer} onDetails={details} />;

  return <WalletStack cards={cards} header={header} footer={footer} onDetails={details} onRedeem={redeem} onScan={() => router.push('/scan')} />;
}

function Chip({ business }: { business: Business }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/business/[id]', params: { id: business.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${business.name}, ${business.kind}`}
      style={({ pressed }) => ({
        flexBasis: '48%',
        flexGrow: 1,
        minHeight: touch + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: pressed ? t.surfaceStrong : t.surface,
        borderRadius: radius.row,
        padding: 10,
      })}
    >
      <Avatar initial={business.initial} tone={business.tone} size={36} />
      <View style={{ flex: 1 }}>
        <Txt kind="label" size={14} weight={700} numberOfLines={1}>{business.name}</Txt>
        <Txt size={13} color={t.textMuted} numberOfLines={1}>{business.kind}</Txt>
      </View>
    </Pressable>
  );
}

function EmptyWallet() {
  return (
    <OnBrand>
    <View style={{ backgroundColor: colors.lime, borderRadius: radius.card, padding: 22, gap: 12 }}>
      <Txt kind="head">הארנק עוד ריק</Txt>
      <Txt color={colors.muted}>
        אחרי רכישה מזכה בעסק משתתף סורקים את הקוד שבקופה, והכרטיס נוסף לכאן. אפשר גם להוסיף כרטיסים מהגילוי.
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <Button label="סריקת קוד" onPress={() => router.push('/scan')} small />
        <Button label="לגלות עסקים" onPress={() => router.navigate('/discover')} small variant="quiet" />
      </View>
    </View>
    </OnBrand>
  );
}
