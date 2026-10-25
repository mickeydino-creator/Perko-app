import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Profile } from './types';

const ONBOARDED = 'perko.onboarded';

type Session = {
  ready: boolean;
  profile: Profile | null;
  onboarded: boolean;
  setProfile: (p: Profile | null) => void;
  finishOnboarding: () => void;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.currentProfile().catch(() => null), AsyncStorage.getItem(ONBOARDED).catch(() => null)]).then(([p, o]) => {
      if (!alive) return;
      setProfile(p);
      setOnboarded(o === '1' || !!p);
      setReady(true);
    });
    const off = api.onAuthChange((p) => setProfile(p));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const value = useMemo<Session>(
    () => ({
      ready,
      profile,
      onboarded,
      setProfile,
      finishOnboarding: () => {
        setOnboarded(true);
        AsyncStorage.setItem(ONBOARDED, '1').catch(() => undefined);
      },
    }),
    [ready, profile, onboarded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
