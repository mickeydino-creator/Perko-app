# Perko - customer app (v1)

The design source (brand tokens, logo, illustrative screens) is the website in
[mickeydino-creator/Perko-marketing](https://github.com/mickeydino-creator/Perko-marketing).

The Perko customer app: one wallet for the loyalty cards of participating neighbourhood businesses in Jerusalem
(pilot area: Emek Refaim and Derech Beit Lehem). Customers collect stamps or points by scanning the counter QR code
after an eligible purchase, follow their progress and redeem rewards by each business's own rules.

Perko is in early access. The five businesses in the seed and in demo mode are **sample data** taken from the
marketing site, labelled "לדוגמה" in the app. None of them is a participant. The prospects in
`research/prospects.json` (Perko-marketing repo) are deliberately not in the app or the seed: none has agreed to participate.

- iOS and Android (bundle id / package `org.perko.app`). Android-only extras: navigation-bar style and the back button.
- Hebrew only, right-to-left. Light and dark appearance: Profile → מראה (לפי הטלפון / בהיר / כהה), stored on the device.
  Dark mode uses only brand colours (ink background, ink-raised surfaces, off-white text, lime accent with ink text);
  loyalty cards and lime brand cards keep their own colours. Roles live in `src/theme.ts` (`lightPalette`,
  `darkPalette`), read with `useTheme()`; `OnBrand` marks lime/off-white cards whose colours never change.
- QR collection only (no NFC in v1). Every stamp and every reward is confirmed by a staff member typing a 4-digit PIN
  on the customer's phone (see [Staff PIN at the counter](#staff-pin-at-the-counter)).
- Business owners manage their program, team PINs, log, insights, alerts and counter card in the
  [business dashboard](#business-dashboard) (`dashboard/`, Next.js).

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
    scan.tsx               camera scanner, staff PIN pad, result sheet (stamp "land" animation)
    redeem/[id].tsx        "ההטבה מוכנה", confirmed by the staff PIN
    c/[token].tsx          perko://c/... deep link (counter code opened by the phone's camera app)
  src/theme.ts             design tokens, mirrors src/styles/global.css of Perko-marketing
  src/tokens.ts            the platform-free part (colours, radii, light/dark roles), shared with dashboard/
  src/components/          Wordmark/AppIcon, stamps/meter, cards, buttons, icons
  src/components/wallet/   the wallet card (WalletCard), the gesture stack (WalletStack), the TalkBack list (WalletList)
  src/lib/collect.ts       the one client entry point for collecting (QR now, NFC later)
  src/lib/backend.ts       data-layer interface; supabaseBackend.ts (real) and demoBackend.ts (local sample data)
  supabase/migrations/     schema, RLS, atomic write functions
  supabase/seed.sql        the five sample businesses (is_sample = true)
  supabase/functions/      collect, redeem, delete-account, business-admin + _shared (rules, tokens, PINs)
  dashboard/               business owner dashboard (Next.js, deployed to Vercel)
  scripts/admin.ts         pilot admin: businesses, programs, owners, PINs, counter QR codes (PNG + printable PDF)
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
The staff PIN of every sample business is **1234**; three wrong PINs in a row lock that business until midnight,
as on the server.
Demo mode starts with three sample cards mirroring the website mockups, one stamp away from a reward, so the full
flow (scan → card complete → redeem → new card) can be tried in a minute.

### Checks

```sh
npm run typecheck       # tsc, app + shared code + scripts
npm run lint            # ESLint (eslint-config-expo, React Compiler rules)
npm test                # unit tests: stamps/points, cooldown, rate limit, QR signatures, PIN hashing, phone numbers
scripts/test-db.sh      # schema, RLS, PIN lockout, owner access, write functions on a throwaway local Postgres (needs psql)
npx deno check supabase/functions/*/index.ts   # Edge Functions (Deno)
npx expo-doctor
cd dashboard && npm install && npm run typecheck && npx next build   # business dashboard
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
   npx supabase secrets set QR_SECRET_V1=... PIN_SECRET=...
   npx supabase functions deploy collect redeem delete-account business-admin
   ```
   `PIN_SECRET` keys the staff PIN hashes. Changing it invalidates every PIN (owners then create new ones).
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase.
5. App config: copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project settings → API). Restart `npx expo start`.

### Email sign-in (until SMS is set up)

The sign-in screen offers email (default for now) or phone. Both use a one-time code (`signInWithOtp` /
`verifyOtp`), no links or deep links. For email, edit the templates in Authentication → Emails so they send a code:
in **Magic Link** and **Confirm signup**, paste `supabase/templates/otp.html` (Hebrew, brand design, contains
`{{ .Token }}`) with the subject "הקוד שלך לכניסה ל-Perko". Editing templates on a hosted project requires custom SMTP.
Supabase's built-in mail server only delivers to members of the project's organisation and only a few emails an
hour; for real users set up custom SMTP (Authentication → Emails → SMTP Settings).

### Setting up from the Supabase website only (no terminal)

Everything above can also be done in the dashboard:

1. **Schema and sample data:** SQL Editor → paste each file of `supabase/migrations/` in name order → Run, then the
   same with `supabase/seed.sql`.
2. **Secrets:** Edge Functions → Secrets → add `QR_SECRET_V1` and `PIN_SECRET`.
3. **Functions:** Edge Functions → Deploy a new function → Via Editor, once per function, named exactly `collect`,
   `redeem`, `delete-account` and `business-admin`; paste the matching single file from `supabase/dashboard/` (generated from
   `supabase/functions` by `node scripts/build-dashboard-functions.ts`; regenerate after any change there).
   Keep "Verify JWT" on.
4. **A counter QR code:** SQL Editor → paste `supabase/dashboard/create-qr.sql`, put in the `QR_SECRET_V1` value and
   the business slug → Run. The result is the text of the QR code; turn it into an image with any QR generator.

Local stack instead (needs Docker): `npx supabase start`, then `npx supabase db reset` (migration + seed) and
`npx supabase functions serve --env-file supabase/functions/.env`. The test number `972500000000` / code
`123456` from `config.toml` signs in without SMS.

### How the backend works

- **Tables** (all with RLS): `profiles`, `businesses` (with `pin_mode`), `programs` (type stamps|points, goal, step,
  reward, rules, `cooldown_minutes`, default 120), `cards` (user, program, current, status active|complete|redeemed,
  and a snapshot of the program's type, goal, step, reward and rule texts), `stamp_events` (card, business, amount,
  `source` = 'qr', reserved 'nfc', `staff_pin_id`), `redemptions` (with `staff_pin_id`), `qr_codes`, `staff_pins`,
  `pin_failures`, `business_alerts`, `business_members`.
- **Program changes apply to new cards only.** A trigger copies the program's type, goal, step, reward, rule and
  redeem rule onto every new card (whoever inserts it); collect, redeem and the app read them from the card. The
  cooldown is read live from the program, so a change to it applies at once.
- **The client never writes stamps.** Users can read their own rows and add an *empty* card ("הוספה לארנק"); column
  grants and RLS block any other write. `qr_codes` is invisible to clients.
- **collect** takes two calls. `action: 'check'` verifies the QR signature (HMAC-SHA256 with `QR_SECRET_V<n>`), checks
  the code and business are active, the customer's PIN lockout at the business, a per-user rate limit (3 per minute,
  12 per hour, across businesses) and the cooldown (one collection per user and business within the program's
  `cooldown_minutes`, also across a redemption), and answers `pin_required` without writing anything.
  `action: 'collect'` repeats all of it with the staff PIN, opens the card on the first stamp, then writes through
  `apply_collect()`, which updates the card and records the event (with the staff PIN's id) in one transaction with a
  version check so two simultaneous scans cannot both pass.
- **redeem** takes the card and the staff PIN; after the lockout and PIN checks `apply_redeem()` marks the card
  redeemed, records the redemption (reward from the card, staff PIN's id) and opens a new card with the program's
  current rules. A screenshot cannot confirm anything: only a PIN checked on the server does.
- **business-admin** does the owner actions that need a secret: PIN mode, team and staff PINs, signed counter codes.
  It accepts the signed-in owner of the business, or the service role key (the admin script).
- **delete-account** deletes the auth user; all their rows cascade.
- The rules live once in `supabase/functions/_shared/loyalty.ts` and `token.ts` (no imports), used by the
  functions, the app (labels, demo mode), the dashboard and the tests. `pins.ts` (server only) checks and issues PINs.

## Staff PIN at the counter

The counter QR code is printed and static: on its own, a photo of it would let a customer collect from home every
two hours. So every stamp and every reward is confirmed by a staff member typing a 4-digit PIN on the customer's
phone.

1. The customer scans the code. The app calls `collect` with `action: 'check'`: a cooldown, a full card or a lockout
   is answered right away, before anyone types anything.
2. The app shows **"מציגים לקופאי/ת"** with a number pad. The customer turns the phone to the cashier, who types
   their PIN (dots only on screen). On the 4th digit the app calls `collect` again with the PIN; the stamp is
   written only if it matches an active PIN of that business.
3. Rewards work the same way: "ההטבה מוכנה" shows the same pad, and `redeem` checks the PIN.

- **Modes** (`businesses.pin_mode`): *one code for the whole team* (default, a single active `staff_pins` row named
  "צוות") or *a code per staff member* (the log then shows who confirmed each action, and one person's code can be
  revoked alone). PINs are unique within a business, generated by the server (never a weak one such as 1234 or
  0000), shown once, and stored as HMAC-SHA256(`PIN_SECRET`, business id + PIN): a leaked table cannot be
  brute-forced without the secret.
- **Lockout:** 3 consecutive wrong PINs (counted from midnight or from the customer's last successful PIN at that
  business) block the customer at that business until midnight Israel time. Every wrong PIN is logged
  (`pin_failures`); a lockout raises a `pin_lockout` alert in the owner's dashboard, and 10 or more wrong PINs at a
  business within an hour (across customers, someone guessing) raise one `pin_failures` alert per hour.
- **Weakness to know:** in shared mode a customer watching the cashier may learn the team code. The dashboard asks
  owners to change it from time to time and at once when someone leaves; per-staff mode limits the damage to one
  person's code.
- The rate limit and the cooldown are unchanged.

## Business dashboard

`dashboard/` is a Next.js app (Hebrew, RTL, the app's colours from `src/tokens.ts`, Heebo) where a business owner
signs in with a one-time email code and manages their business:

1. **תוכנית:** goal, reward, collection rule, redemption rule and cooldown, edited in place under RLS. Changes reach
   new cards only (the cooldown applies at once); the screen says so.
2. **צוות:** PIN mode, add and remove staff, create and reset PINs (shown once).
3. **יומן:** stamps and redemptions with date, time (Israel), staff name or "צוות", and the customer by name, the
   last 4 digits of their phone or a masked email.
4. **תובנות:** active customers, returning customers (visits on 2+ days), rewards redeemed, visits and visits per
   customer, for the last 7 and 30 days.
5. **התראות:** PIN lockouts and bursts of wrong PINs.
6. **קוד לקופה:** the counter card as PNG and A6 PDF (the same card as `qr:print`, drawn by
   `dashboard/lib/counterCard.ts`), and extra codes.

Access: `business_members` (user, business, role `owner` | `staff`; staff is reserved and has no dashboard access
yet). RLS lets an owner read and edit only their own business; the log, insights and alerts come from RPCs
(`business_log`, `business_insights`, `business_alert_list`) that check membership; anything that needs a secret
goes through `business-admin`, never from the browser. The sign-in screen never creates accounts: owners are added
with `owners:add`.

### Deploying the dashboard to Vercel

1. Vercel → Add New → Project → import this repository.
2. **Root Directory:** `dashboard`. Keep "Include files outside the root directory in the Build Step" on (the
   dashboard imports `src/tokens.ts` and `supabase/functions/_shared`). Framework: Next.js (detected).
3. **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the same values as the
   app's `.env`. Never the service role key.
4. Deploy, then Settings → Domains → add `business.getperko.com`. In Cloudflare add the CNAME Vercel shows for
   `business` (DNS only, grey cloud).
5. Add an owner: `npm run admin -- owners:add --business <slug> --email <email>`. They sign in with a code sent to
   that address (the email template must contain `{{ .Token }}`, see "Email sign-in" above).

Locally: `cd dashboard && cp .env.example .env.local` (fill in the two values), `npm install`, `npm run dev`.

### Upgrading a live project to staff PINs

Order matters: once the new `collect` and `redeem` run, a business without an active PIN cannot collect at all.

1. Apply the migrations (`npx supabase db push`). Nothing changes for users yet.
2. Set `PIN_SECRET` and deploy `business-admin`.
3. Give every active business a PIN: `owners:add` and let the owner create one in the dashboard, or
   `npm run admin -- pins:set --business <slug>` (shown once; for the sample businesses too).
4. Deploy `collect` and `redeem`, then remove the old `REDEEM_SECRET` secret.
5. Ship the app update: older app versions cannot show the PIN pad.

## The Discover map

Discover has a "רשימה | מפה" switch. The map (react-native-maps: Apple Maps on iOS, Google Maps on Android) pins every
business that has `lat`/`lng`, with the same search and category filters as the list; tapping a pin shows the
business card with "הוספה" and a link to its page.

- **Location:** asked the first time the map opens (`expo-location`, while in use only). It is used on the phone for
  the blue dot, "my location" and distances (the list then sorts closest first); it is never sent to the server or
  stored. Without permission the map just shows the businesses.
- **Data:** `businesses.lat` / `lng` (migration `20261027090000_business_location.sql`), set with
  `businesses:upsert`. The sample businesses have approximate points on Emek Refaim and Derech Beit Lechem,
  illustrations like the businesses themselves.
- **Expo Go** shows the map on both platforms with no setup. **An Android build needs a Google Maps API key**
  (Google Cloud → Maps SDK for Android, restricted to `org.perko.app` and the signing certificate): add
  `["react-native-maps", { "androidGoogleMapsApiKey": "..." }]` to the plugins in `app.json`. iOS uses Apple Maps
  and needs no key.
- The web preview has no map (react-native-maps is native only) and shows a note instead; screen-reader users get
  the list, where each row also reads the distance.

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
npm run admin -- owners:add --business <slug> --email <email>  # dashboard access for the business owner
npm run admin -- pins:set --business <slug> [--name "דנה"]     # a staff PIN, shown once (--name in per-staff mode)
npm run admin -- qr:create --business <slug> --label "קופה"
npm run admin -- qr:print --business <slug>                     # re-render active codes
npm run admin -- qr:revoke --id <qr uuid>
npm run admin -- list
npm run admin -- qr:render --id <uuid> --name "שם העסק"         # offline render, secret only
```

Each code is written to `scripts/out/<slug>/` as a PNG (1200 px) and an A6 PDF counter card (lime, wordmark,
business name, vector QR, "סורקים כאן אחרי רכישה מזכה"). Print at 100% scale. Businesses created by the script
are not marked as samples; only add a business after it has agreed to take part. Creating a business stays in the
script; owners then run it in the dashboard. `businesses:upsert` edits the running program in place, like the
dashboard (open cards keep their rules). `pins:set` goes through `business-admin` with the service role key, so
`PIN_SECRET` never needs to be on your machine (it requires the legacy JWT service role key, the one the functions
also see as `SUPABASE_SERVICE_ROLE_KEY`).

## Running on iOS

Expo Go on an iPhone runs the app as is. For a build: `npx eas-cli@latest build -p ios --profile preview`
(needs an Apple Developer account; EAS creates the certificates). As on Android, the RTL layout is only reliable
in a build, not in Expo Go.

## Running on Android

- **Expo Go** is enough to try the flows (all modules used ship in Expo Go). However, Expo Go resets the RTL
  setting of the apps it hosts, so the layout direction there is not reliable.
- **For the real RTL layout, icon and splash, use a build** (the `expo-localization` plugin sets `forcesRTL` natively):
  ```sh
  npx eas-cli@latest build -p android --profile preview    # installable APK
  # or locally with Android Studio installed:  npx expo run:android
  ```
- Check both appearances: set Profile → מראה to כהה and to בהיר, and with "לפי הטלפון" switch the phone's own dark
  mode; the status bar and the Android navigation bar follow.
- Regenerate icons/splash after changing the logo: `npm run assets`.

## What was verified in this version, and what was not

- Verified: type-check; unit tests; schema, RLS and write functions on Postgres 16; Edge Functions type-check under
  Deno; expo-doctor; printed QR codes decode and pass signature verification; every screen and flow
  (onboarding, sign-in, wallet, discover + filter, business page, add to wallet, card detail, scan result states,
  redeem with rotating code, cooldown after redeem, invalid code, rewards, profile) walked through in demo mode in the
  web preview at phone size with the browser in dark mode, RTL, screenshots reviewed and layout fixed.
- Staff PINs and the dashboard (this version): unit tests for PIN hashing and weak PINs; `scripts/test-db.sh` for the
  snapshot, PIN uniqueness, lockout and its reset, alerts, owner RLS and the RPCs; `deno check` of every function and
  of `supabase/dashboard/`; the scan and redeem PIN flows (wrong PIN, attempts left, success) in demo mode in the web
  preview; the dashboard built with `next build` and every screen exercised in a browser at desktop and phone width,
  light and dark, against a mocked Supabase API, including the PIN shown once, saving the program and the PDF card.
- **Not yet verified:** the PIN flow and the dashboard against a live Supabase project, a run on an Android emulator or device (the build environment had no Android emulator), the
  live camera scan, the Edge Functions against a running Supabase project, and real SMS delivery. These are the first
  things to check on a phone.

## Real vs mocked

- Real: the Supabase schema, RLS, Edge Functions, signed QR tokens, staff PINs and the lockout, cooldown and rate
  limits, account deletion, the admin script and printable codes, the camera scanner, the business dashboard.
- Mocked: demo mode (no `.env`) replaces the backend with local sample data, accepts any SMS code, does not check QR
  signatures and uses PIN 1234 everywhere. The five businesses are illustrative. Address and hours in the seed are
  placeholders.
- Placeholders: privacy policy link (`src/lib/config.ts`), contact details.

## Before a real pilot

1. Supabase project on a paid plan (no pausing), migrations applied, secrets set, functions deployed, backups on.
2. SMS provider for phone OTP with Israeli delivery tested, sender name, rate limits and spend caps.
3. Real businesses that have agreed in writing, entered with `businesses:upsert`; remove the sample businesses
   (`update businesses set active = false where is_sample`).
4. Printed counter QR codes per business, a PIN per business (or per staff member), and a short staff briefing (what
   an eligible purchase is, typing the PIN on the customer's phone, the lockout).
5. Privacy policy (Hebrew, covering phone numbers, visit history and the on-device use of location) published and linked in `src/lib/config.ts`,
   plus the Play Console data-safety form and the account-deletion URL.
6. Google Play developer account, app signing, `org.perko.app` package name confirmed, store listing, internal
   testing track (`eas build --profile production` + `eas submit`).
7. A test on at least two Android phones (one in dark mode, one with large text) and with the camera permission
   denied.
