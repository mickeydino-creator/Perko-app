import {
  Heebo_400Regular,
  Heebo_500Medium,
  Heebo_600SemiBold,
  Heebo_700Bold,
  Heebo_800ExtraBold,
  Heebo_900Black,
  useFonts,
} from '@expo-google-fonts/heebo';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../theme';

// Hebrew only: the layout is always right-to-left. The expo-localization plugin (forcesRTL in app.json)
// sets this natively in development and release builds; this call covers the first launch.
if (Platform.OS !== 'web' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

// Web is only a development preview: give the document the same direction and language.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'he';
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Light app only: explicit colours for the window behind the screens and for the Android navigation bar,
// so a phone in dark mode still shows the light app.
SystemUI.setBackgroundColorAsync(colors.pale).catch(() => undefined);
if (Platform.OS === 'android') {
  try {
    NavigationBar.setStyle('dark'); // dark buttons on our light surfaces
  } catch {
    // older runtimes: the app.json plugin config applies
  }
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Heebo_400Regular, Heebo_500Medium, Heebo_600SemiBold, Heebo_700Bold, Heebo_800ExtraBold, Heebo_900Black });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider style={{ backgroundColor: colors.pale }}>
      <SessionProvider>
        {/* direction: belt and braces for the RTL layout inside the app. */}
        <View style={{ flex: 1, direction: 'rtl', backgroundColor: colors.pale }}>
          <Routes />
        </View>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Routes() {
  const { ready, profile, onboarded } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  const signedIn = !!profile;
  return (
    <>
      {/* Dark icons on the light status bar. The scan screen switches to light icons on its ink background. */}
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.pale }, animation: 'fade_from_bottom', animationDuration: 240 }}>
        <Stack.Protected guard={!signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: colors.ink } }} />
          <Stack.Screen name="business/[id]" />
          <Stack.Screen name="card/[id]" />
          <Stack.Screen name="redeem/[id]" options={{ contentStyle: { backgroundColor: colors.paper } }} />
          <Stack.Screen name="c/[token]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
