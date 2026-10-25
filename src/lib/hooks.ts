import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { NetworkError } from './backend';

/** Follows the system "remove animations" setting. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export type Loaded<T> = {
  data: T | undefined;
  error: 'offline' | 'error' | null;
  loading: boolean;
  reload: () => void;
};

/** Loads data when the screen gains focus (so the wallet is fresh after a scan or a redemption). */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Loaded<T>['error']>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    load()
      .then((d) => {
        if (n !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => n === seq.current && setError(e instanceof NetworkError ? 'offline' : 'error'))
      .finally(() => n === seq.current && setLoading(false));
  }, deps);

  useFocusEffect(run);
  return { data, error, loading, reload: run };
}
