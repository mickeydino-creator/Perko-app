// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno (npm: specifiers): checked with `deno check`, not this config.
    ignores: ['dist/*', '.expo/*', 'supabase/functions/**', 'supabase/dashboard/**'],
  },
  {
    // Node scripts read their own secrets from process.env; the rule is about EXPO_PUBLIC_ inlining in the app.
    files: ['scripts/**'],
    rules: { 'expo/no-dynamic-env-var': 'off' },
  },
]);
