# Perko - customer app (v1)

The design source (brand tokens, logo, illustrative screens) is the website in
[mickeydino-creator/Perko-marketing](https://github.com/mickeydino-creator/Perko-marketing).

The Perko customer app: one wallet for the loyalty cards of participating neighbourhood businesses in Jerusalem
(pilot area: Emek Refaim and Derech Beit Lehem). Customers collect stamps or points by scanning the counter QR code
after an eligible purchase, follow their progress and redeem rewards by each business's own rules.

Perko is in early access. The five businesses in the seed and in demo mode are **sample data** taken from the
marketing site, labelled "לדוגמה" in the app. None of them is a participant. The prospects in
`research/prospects.json` (Perko-marketing repo) are deliberately not in the app or the seed: none has agreed to participate.

- Android only (iOS later; the code has no platform-specific paths beyond Android system bars).
- Hebrew only, right-to-left. Light mode only, whatever the phone's setting.
- QR collection only (no NFC in v1).

## Stack

Expo SDK 58, TypeScript, Expo Router, React Native 0.88 · Supabase (phone OTP auth, Postgres with RLS, Edge Functions) ·
Heebo via `@expo-google-fonts/heebo` · `expo-camera` for scanning.

```
Perko-app/
  src/app/                 screens (Expo Router)
    onboarding.tsx         3 intro screens
    sign-in.tsx            phone number + SMS code
    (tabs)/index.tsx       wallet: a stack of physical cards, the one closest to a reward first
    (tabs)/discover.tsx    participating businesses, category filter, "הוספה"
    (tabs)/rewards.tsx     ready rewards and redemption history
    (tabs)/profile.tsx     name, phone, privacy link, sign out, delete account
    business/[id].tsx      business page: program, rules, address/hours, "הוספה לארנק"
    card/[id].tsx          card detail: progress, dated history, rules
    scan.tsx               camera scanner + result sheet (stamp "land" animation)
    redeem/[id].tsx        "ההטבה מוכנה" with a code that changes every 30 s
    c/[token].tsx          perko://c/... deep link (counter code opened by the phone's camera app)
  src/theme.ts             design tokens, mirrors src/styles/global.css of Perko-marketing (light values only)
  src/components/          Wordmark/AppIcon, stamps/meter, cards, buttons, icons
  src/components/wallet/   the wallet card (WalletCard), the gesture stack (WalletStack), the TalkBack list (WalletList)
  src/lib/collect.ts       the one client entry point for collecting (QR now, NFC later)
  src/lib/backend.ts       data-layer interface; supabaseBackend.ts (real) and demoBackend.ts (local sample data)
  supabase/migrations/     schema, RLS, atomic write functions
  supabase/seed.sql        the five sample businesses (is_sample = true)
  supabase/functions/      collect, redeem, delete-account + _shared (rules and tokens shared with app and tests)
  scripts/admin.ts         pilot admin: businesses, programs, counter QR codes (PNG + printable PDF)
  scripts/generate-assets.ts  Android icon, adaptive icon, splash, favicon from the website's app icon
  tests/                   unit tests (node:test)
```

## Quick start (demo mode, no backend)

Needs Node 22.18 or later.

```sh
git clone https://github.com/mickeydino-creator/Perko-app && cd Perko-app
npm install
npx expo start          # press "a" for a connected Android device/emulator, or scan the QR code with Expo Go
```

Without `.env` the app runs in **demo mode**: a banner says so, data lives on the device only, any 6-digit SMS code
is accepted, and the scan screen has a "סריקת קוד לדוגמה" button that simulates scanning a sample business's
counter code (the camera also works; demo mode accepts the demo payloads only, not real signed codes).
Demo mode starts with three sample cards mirroring the website mockups, one stamp away from a reward, so the full
flow (scan → card complete → redeem → new card) can be tried in a minute.

### Checks

```sh
npm run typecheck       # tsc, app + shared code + scripts
npm run lint            # ESLint (eslint-config-expo, React Compiler rules)
npm test                # unit tests: stamps/points, cooldown, rate limit, redeem codes, QR signatures, phone numbers
scripts/test-db.sh      # schema + RLS + write functions on a throwaway local Postgres (needs psql)
npx deno check supabase/functions/*/index.ts   # Edge Functions (Deno)
npx expo-doctor
```

## Supabase

1. Create a project at supabase.com (region close to Israel, e.g. Frankfurt).
2. Link and apply the schema:
   ```sh
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push                 # supabase/migrations
   # sample data, only if you want the five illustrative businesses in this project:
   psql "<connection string>" -f supabase/seed.sql
   ```
3. Phone auth: Dashboard → Authentication → Sign In / Providers → Phone: enable, choose an SMS provider
   (Twilio, MessageBird, Vonage or Textlocal) and enter its credentials. Disable email sign-up.
   For testing without SMS, add a test number and code there (as `supabase/config.toml` does locally).
4. Edge Function secrets (generate each with `openssl rand -base64 32`, see `supabase/functions/.env.example`):
   ```sh
   npx supabase secrets set QR_SECRET_V1=... REDEEM_SECRET=...
   npx supabase functions deploy collect redeem delete-account
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase.
5. App config: copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project settings → API). Restart `npx expo start`.

Local stack instead (needs Docker): `npx supabase start`, then `npx supabase db reset` (migration + seed) and
`npx supabase functions serve --env-file supabase/functions/.env`. The test number `972500000000` / code
`123456` from `config.toml` signs in without SMS.

### How the backend works

- **Tables** (all with RLS): `profiles`, `businesses`, `programs` (type stamps|points, goal, step, reward, rules,
  `cooldown_minutes`, default 120), `cards` (user, program, current, status active|complete|redeemed),
  `stamp_events` (card, business, amount, `source` = 'qr', reserved 'nfc'), `redemptions`, `qr_codes`.
- **The client never writes stamps.** Users can read their own rows and add an *empty* card ("הוספה לארנק"); column
  grants and RLS block any other write. `qr_codes` is invisible to clients.
- **collect** verifies the QR signature (HMAC-SHA256 with `QR_SECRET_V<n>`), checks the code and business are active,
  enforces a per-user rate limit (3 per minute, 12 per hour, across businesses) and the cooldown (one collection per
  user and business within the program's `cooldown_minutes`, also across a redemption), opens the card on the first
  scan, then writes through `apply_collect()`, which updates the card and records the event in one transaction with a
  version check so two simultaneous scans cannot both pass.
- **redeem** returns a 6-digit code derived from `REDEEM_SECRET`, the card and the current 30-second window; the app
  shows it with a countdown and a ticking clock. Confirming sends the code back; the server accepts the current or
  previous window only, then `apply_redeem()` marks the card redeemed, records the redemption and opens a new card.
  A screenshot cannot confirm anything and visibly goes stale.
- **delete-account** deletes the auth user; all their rows cascade.
- The rules live once in `supabase/functions/_shared/loyalty.ts` and `token.ts` (no imports), used by the
  functions, the app (labels, demo mode) and the tests.

## The wallet stack

The home screen shows the cards as physical cards (ID-1 proportions 1.586:1, 20 dp corners, elevation, a 1 dp top-edge
highlight, one brand colour per business chosen by a hash of its id, a cropped disc echoing the logo's dot).

- **Stack:** each card shows its 70 dp header strip (initial, name, count, or "מוכנה למימוש" with a ring when the
  reward is ready). The screen scrolls with a Reanimated pan + `withDecay` instead of a ScrollView, because Android's
  ScrollView cannot overscroll: pulling past the top spreads the cards (rubber band), scrolling down pins the cards
  that pass the top edge into a thin compressed pile.
- **Focus:** a tap springs the card to the top, the others drop into a pile above the tab bar, and the quick actions
  appear ("מימוש ההטבה" when ready, "סריקה בקופה", "פרטי הכרטיס"). A horizontal swipe moves between cards (RTL: dragging
  right brings the next card); a swipe down, a tap on the card or Android back returns to the stack. Light haptics on
  snap and switch.
- **Accessibility:** every card is a button labelled with `cardA11y` and has "הכרטיס הבא" / "הכרטיס הקודם" actions.
  With TalkBack on, the wallet renders as a plain list of the same cards (`WalletList`). With "remove animations" on,
  changes are instant.
- Built on react-native-reanimated 4 and react-native-gesture-handler 3 (hook API); all motion runs on the UI thread.

### QR payload and key rotation

A counter code encodes `perko://c/v<version>.<qr uuid>.<signature>`. Opening it with the phone's own camera app
deep-links into the scan screen. To rotate: set `QR_SECRET_V2`, print new codes with `QR_KEY_VERSION=2`, and remove
`QR_SECRET_V1` once the old prints are gone. To revoke one code: `qr:revoke` (sets `active = false`).

### Adding NFC later

`src/lib/collect.ts` is the only place the app collects: add an NFC reader that calls `collect(payload, 'nfc')`.
On the server, accept `source: 'nfc'` in `collect` (the column already allows it). Screens and result handling stay
as they are.

## Pilot admin script

Runs on your machine with the service role key (in `.env`, never committed, never `EXPO_PUBLIC_`).

```sh
# .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QR_SECRET_V1 (same value as the function secret)
npm run admin -- businesses:upsert --file scripts/pilot.json   # template: scripts/pilot.example.json
npm run admin -- qr:create --business <slug> --label "קופה"
npm run admin -- qr:print --business <slug>                     # re-render active codes
npm run admin -- qr:revoke --id <qr uuid>
npm run admin -- list
npm run admin -- qr:render --id <uuid> --name "שם העסק"         # offline render, secret only
```

Each code is written to `scripts/out/<slug>/` as a PNG (1200 px) and an A6 PDF counter card (lime, wordmark,
business name, vector QR, "סורקים כאן אחרי רכישה מזכה"). Print at 100% scale. Businesses created by the script
are not marked as samples; only add a business after it has agreed to take part.

## Running on Android

- **Expo Go** is enough to try the flows (all modules used ship in Expo Go). However, Expo Go resets the RTL
  setting of the apps it hosts, so the layout direction there is not reliable.
- **For the real RTL layout, icon and splash, use a build** (the `expo-localization` plugin sets `forcesRTL` natively):
  ```sh
  npx eas-cli@latest build -p android --profile preview    # installable APK
  # or locally with Android Studio installed:  npx expo run:android
  ```
- Check with the phone in dark mode: every screen, the status bar and the navigation bar must stay light
  (`userInterfaceStyle: "light"`, explicit colours on every screen, `expo-navigation-bar` style "dark").
- Regenerate icons/splash after changing the logo: `npm run assets`.

## What was verified in this version, and what was not

- Verified: type-check; unit tests; schema, RLS and write functions on Postgres 16; Edge Functions type-check under
  Deno; expo-doctor; printed QR codes decode and pass signature verification; every screen and flow
  (onboarding, sign-in, wallet, discover + filter, business page, add to wallet, card detail, scan result states,
  redeem with rotating code, cooldown after redeem, invalid code, rewards, profile) walked through in demo mode in the
  web preview at phone size with the browser in dark mode, RTL, screenshots reviewed and layout fixed.
- **Not yet verified:** a run on an Android emulator or device (the build environment had no Android emulator), the
  live camera scan, the Edge Functions against a running Supabase project, and real SMS delivery. These are the first
  things to check on a phone.

## Real vs mocked

- Real: the Supabase schema, RLS, Edge Functions, signed QR tokens, rotating redemption codes, cooldown and rate
  limits, account deletion, the admin script and printable codes, the camera scanner.
- Mocked: demo mode (no `.env`) replaces the backend with local sample data, accepts any SMS code and does not check QR
  signatures. The five businesses are illustrative. Address and hours in the seed are placeholders.
- Placeholders: privacy policy link (`src/lib/config.ts`), contact details.

## Before a real pilot

1. Supabase project on a paid plan (no pausing), migrations applied, secrets set, functions deployed, backups on.
2. SMS provider for phone OTP with Israeli delivery tested, sender name, rate limits and spend caps.
3. Real businesses that have agreed in writing, entered with `businesses:upsert`; remove the sample businesses
   (`update businesses set active = false where is_sample`).
4. Printed counter QR codes per business, and a short staff briefing (what an eligible purchase is, how redemption
   looks, the live code).
5. Privacy policy (Hebrew, covering phone numbers and visit history) published and linked in `src/lib/config.ts`,
   plus the Play Console data-safety form and the account-deletion URL.
6. Google Play developer account, app signing, `org.perko.app` package name confirmed, store listing, internal
   testing track (`eas build --profile production` + `eas submit`).
7. A test on at least two Android phones (one in dark mode, one with large text) and with the camera permission
   denied.
