import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
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

/** True while TalkBack (or another screen reader) is on. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // react-native-web always answers true; web is only a development preview of this Android app.
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled().then(setOn).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
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
    // The caller passes the dependencies, as with useEffect.
    // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(run);
  return { data, error, loading, reload: run };
}
