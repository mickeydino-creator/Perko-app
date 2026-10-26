import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// perko://auth/callback: where Google (and later Apple) send the user back after signing in. The in-app browser
// session reads the tokens itself (supabaseBackend.signInWithProvider); this route only keeps Expo Router from
// showing "not found" if the link also reaches the app, and closes the popup on web.
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  return <Redirect href="/" />;
}
