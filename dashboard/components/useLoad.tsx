'use client';
import { useCallback, useEffect, useState } from 'react';

/** Loads data for a screen and reloads when `deps` change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what fn depends on
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await run(), loading: false });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  }, [run]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data is the effect's job
    reload();
  }, [reload]);
  return { ...state, reload };
}

export function Loading({ error, onRetry }: { error?: string; onRetry: () => void }) {
  if (!error) return <p className="muted">טוענים…</p>;
  return (
    <div className="note" role="alert">
      <p>לא הצלחנו לטעון: {error}</p>
      <button className="btn small quiet" onClick={onRetry} style={{ marginTop: 8 }}>לנסות שוב</button>
    </div>
  );
}
