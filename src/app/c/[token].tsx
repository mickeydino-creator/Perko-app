import { Redirect, useLocalSearchParams } from 'expo-router';
import { QR_PREFIX } from '../../../supabase/functions/_shared/token.ts';

/** perko://c/<token>: the counter code opened with the phone's own camera app. Hands it to the scan screen. */
export default function CounterLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <Redirect href={{ pathname: '/scan', params: { payload: `${QR_PREFIX}${token}` } }} />;
}
