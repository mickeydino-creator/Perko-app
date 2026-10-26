import { router, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GiftIcon, HomeIcon, PinIcon, QrGlyph, UserIcon } from '../../components/Icons';
import { Txt } from '../../components/Txt';
import { useTheme } from '../../lib/appearance';
import { touch } from '../../theme';

const tabs = {
  index: { label: 'כרטיסים', Icon: HomeIcon },
  discover: { label: 'גילוי', Icon: PinIcon },
  rewards: { label: 'הטבות', Icon: GiftIcon },
  profile: { label: 'פרופיל', Icon: UserIcon },
} as const;

export default function TabsLayout() {
  const { t } = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

/** The website's tab bar (src/components/screens/TabBar.astro): four tabs and a raised ink scan button in the middle. */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTheme();
  const item = (index: number) => {
    const route = state.routes[index];
    const tab = tabs[route.name as keyof typeof tabs];
    const active = state.index === index;
    const color = active ? t.text : t.textMuted;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !e.defaultPrevented) navigateToTab(route.key);
        }}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }}
        style={{ flex: 1, minHeight: touch + 8, alignItems: 'center', justifyContent: 'flex-end', gap: 3, paddingBottom: 4 }}
      >
        <View style={{ opacity: active ? 1 : 0.85 }}>
          <tab.Icon size={24} color={color} />
        </View>
        <Txt size={12} weight={active ? 700 : 500} color={color}>{tab.label}</Txt>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: t.tabBar,
        borderTopWidth: t.dark ? 1 : 0,
        borderTopColor: t.border,
        paddingTop: 8,
        paddingHorizontal: 8,
        // The bar paints behind the Android navigation bar too (edge to edge), so it stays light in dark mode.
        paddingBottom: Math.max(insets.bottom, 10),
      }}
      accessibilityRole="tablist"
    >
      {item(0)}
      {item(1)}
      <Pressable
        onPress={() => router.push('/scan')}
        accessibilityRole="tab"
        accessibilityState={{ selected: false }}
        accessibilityLabel="סריקת קוד בקופה"
        accessibilityHint="פותח את המצלמה לסריקת קוד ה-QR של העסק"
        style={{ flex: 1, alignItems: 'center', gap: 3, paddingBottom: 4 }}
      >
        {({ pressed }) => (
          <>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                marginTop: -26,
                backgroundColor: pressed ? t.accentPressed : t.accent,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.96 : 1 }],
              }}
            >
              <QrGlyph size={28} color={t.onAccent} bg={pressed ? t.accentPressed : t.accent} />
            </View>
            <Txt size={12} weight={700} color={t.text}>סריקה</Txt>
          </>
        )}
      </Pressable>
      {item(2)}
      {item(3)}
    </View>
  );
}
