import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { sortWallet } from '../../../supabase/functions/_shared/loyalty.ts';
import { CardRow, HeroCard } from '../../components/CardViews';
import { Txt } from '../../components/Txt';
import { Avatar, Button, DemoBanner, Heading, LoadState, Reveal, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import type { Business, Card } from '../../lib/types';
import { colors, radius, TAB_CLEARANCE, touch } from '../../theme';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'בוקר טוב';
  if (h >= 12 && h < 17) return 'צהריים טובים';
  if (h >= 17 && h < 22) return 'ערב טוב';
  return 'לילה טוב';
}

export default function Wallet() {
  const { profile } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const [cards, businesses] = await Promise.all([api.listCards(), api.listBusinesses()]);
    const sorted = sortWallet(cards.map((c) => ({ ...c, goal: c.program.goal })));
    return { cards: sorted as Card[], businesses };
  });

  const open = (c: Card) => router.push({ pathname: '/card/[id]', params: { id: c.id } });
  const [first, ...rest] = data?.cards ?? [];
  const inWallet = new Set(data?.cards.map((c) => c.business.id));
  const more = (data?.businesses ?? []).filter((b) => b.program && !inWallet.has(b.id)).slice(0, 4);

  return (
    <Screen bottom={TAB_CLEARANCE} edgeBottom={false}>
      <Heading over={profile?.name ? `${greeting()}, ${profile.name}` : greeting()} title="הכרטיסים שלי" />
      <DemoBanner />

      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}

      {data && !first ? <EmptyWallet /> : null}

      {first ? (
        <Reveal>
          <HeroCard card={first} onPress={() => open(first)} />
        </Reveal>
      ) : null}

      {rest.length ? (
        <View style={{ gap: 8, marginTop: 10 }}>
          {rest.map((c, i) => (
            <Reveal key={c.id} delay={60 * (i + 1)}>
              <CardRow card={c} onPress={() => open(c)} />
            </Reveal>
          ))}
        </View>
      ) : null}

      {more.length ? (
        <View style={{ marginTop: 26 }}>
          <Txt kind="label" size={17} weight={700} style={{ marginBottom: 10 }} accessibilityRole="header">עסקים משתתפים שעוד לא בארנק</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {more.map((b) => <Chip key={b.id} business={b} />)}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Chip({ business }: { business: Business }) {
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
        backgroundColor: pressed ? colors.paleStrong : colors.paper,
        borderRadius: radius.row,
        padding: 10,
      })}
    >
      <Avatar initial={business.initial} tone={business.tone} size={36} />
      <View style={{ flex: 1 }}>
        <Txt kind="label" size={14} weight={700} numberOfLines={1}>{business.name}</Txt>
        <Txt size={13} color={colors.muted} numberOfLines={1}>{business.kind}</Txt>
      </View>
    </Pressable>
  );
}

function EmptyWallet() {
  return (
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
  );
}
