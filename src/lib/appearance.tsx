// Appearance setting: follow the phone, or always light, or always dark. Stored on the device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from '../theme';

export type Appearance = 'system' | 'light' | 'dark';
const KEY = 'perko.appearance';

type Ctx = { t: Palette; appearance: Appearance; setAppearance: (a: Appearance) => void };
const ThemeCtx = createContext<Ctx>({ t: lightPalette, appearance: 'system', setAppearance: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => (v === 'light' || v === 'dark' || v === 'system' ? setState(v) : undefined))
      .catch(() => undefined);
  }, []);

  const value = useMemo<Ctx>(() => {
    const isDark = appearance === 'dark' || (appearance === 'system' && system === 'dark');
    return {
      t: isDark ? darkPalette : lightPalette,
      appearance,
      setAppearance: (a) => {
        setState(a);
        AsyncStorage.setItem(KEY, a).catch(() => undefined);
      },
    };
  }, [appearance, system]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** The current palette plus the appearance setting. */
export function useTheme(): Ctx {
  return useContext(ThemeCtx);
}
