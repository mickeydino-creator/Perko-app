'use client';
// Session and the business being managed. Owners of several businesses switch between them in the header;
// the choice is remembered on this computer.
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { myBusinesses, type Business } from '../lib/api';
import { configured, sb } from '../lib/supabase';

type Ctx = {
  businesses: Business[];
  business: Business;
  choose: (id: string) => void;
  /** Re-read the businesses (after the PIN mode changed). */
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const DashboardContext = createContext<Ctx | null>(null);
const KEY = 'perko.dashboard.business';

export function useDashboard(): Ctx {
  const c = useContext(DashboardContext);
  if (!c) throw new Error('useDashboard outside DashboardProvider');
  return c;
}

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' | 'none' | 'error' | 'ready'; businesses: Business[]; id: string | null; error?: string }>({
    status: 'loading', businesses: [], id: null,
  });

  const load = useCallback(async () => {
    if (!configured) return setState({ status: 'error', businesses: [], id: null, error: 'הדשבורד לא מחובר ל-Supabase (משתני הסביבה חסרים).' });
    const { data } = await sb().auth.getSession();
    if (!data.session) return router.replace('/login');
    try {
      const businesses = await myBusinesses();
      const saved = remembered();
      const id = businesses.find((b) => b.id === saved)?.id ?? businesses[0]?.id ?? null;
      setState({ status: businesses.length ? 'ready' : 'none', businesses, id });
    } catch (e) {
      setState({ status: 'error', businesses: [], id: null, error: e instanceof Error ? e.message : String(e) });
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the session is the effect's job
    load();
    if (!configured) return;
    const { data } = sb().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });
    return () => data.subscription.unsubscribe();
  }, [load, router]);

  const signOut = async () => {
    await sb().auth.signOut();
    router.replace('/login');
  };

  if (state.status === 'loading') return <main className="center"><p className="muted">טוענים…</p></main>;
  if (state.status === 'error') return <main className="center"><div className="card login"><h2>משהו השתבש</h2><p>{state.error}</p><button className="btn" onClick={load}>לנסות שוב</button></div></main>;
  if (state.status === 'none') {
    return (
      <main className="center">
        <div className="card login">
          <h2>אין עסק בחשבון הזה</h2>
          <p className="muted">הכתובת שנכנסת איתה לא רשומה כבעלים של עסק ב-Perko. אם זו טעות, כתבו לנו ל-hello@getperko.com.</p>
          <button className="btn quiet" onClick={signOut}>יציאה</button>
        </div>
      </main>
    );
  }

  const business = state.businesses.find((b) => b.id === state.id)!;
  const choose = (id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // remembering is a convenience only
    }
    setState((s) => ({ ...s, id }));
  };
  return (
    <DashboardContext.Provider value={{ businesses: state.businesses, business, choose, reload: load, signOut }}>
      {children}
    </DashboardContext.Provider>
  );
}
