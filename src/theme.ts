// Perko design tokens for the app. Mirrors src/styles/global.css of the website (Perko-marketing repo) (light values only).
// There is no dark theme: every screen uses these colours whatever the system setting.
import { Easing } from 'react-native';

export const colors = {
  lime: '#D7FF35', // primary, dominant surface
  lime2: '#BCE82D', // secondary lime: pressed state and small variations only
  ink: '#11130F', // type, buttons, high-contrast surfaces
  paper: '#F8F8F4', // warm off-white: cards and content surfaces
  muted: '#303626', // muted text on lime and off-white
  // Derived tints (not new colours)
  inkRaised: '#1F221B', // ink + 4% paper: raised surface / pressed on ink
  pale: '#EBECE4', // ink 6% on paper: screen background, tracks, empty states
  paleStrong: '#D8DACE', // ink 13% on paper
  slateOnInk: '#B9BCB0', // paper 70% on ink
  inkOnLime14: 'rgba(17, 19, 15, 0.14)', // empty stamp on lime
  inkOnLime70: 'rgba(17, 19, 15, 0.7)', // reward ring on lime
} as const;

/** Heebo families loaded in the root layout, one per weight (Android needs a family per weight). */
export const fonts = {
  400: 'Heebo_400Regular',
  500: 'Heebo_500Medium',
  600: 'Heebo_600SemiBold',
  700: 'Heebo_700Bold',
  800: 'Heebo_800ExtraBold',
  900: 'Heebo_900Black',
} as const;
export type Weight = keyof typeof fonts;

/** Type steps of the app (the website's app fragments scaled to a phone). Tracking is in em, as on the site. */
export const type = {
  display: { size: 34, weight: 800 as Weight, tracking: -0.035, line: 1.05 },
  title: { size: 28, weight: 800 as Weight, tracking: -0.03, line: 1.1 },
  head: { size: 22, weight: 800 as Weight, tracking: -0.03, line: 1.15 },
  lead: { size: 18, weight: 400 as Weight, tracking: 0, line: 1.45 },
  body: { size: 16, weight: 400 as Weight, tracking: 0, line: 1.5 },
  label: { size: 15, weight: 700 as Weight, tracking: 0, line: 1.35 },
  small: { size: 14, weight: 400 as Weight, tracking: 0, line: 1.45 },
} as const;
export type TypeRole = keyof typeof type;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 } as const;
export const gutter = 16;

export const radius = {
  card: 22, // .ui-card 1.8em
  row: 18, // .ui-row 1.5em
  sheet: 28,
  avatar: 14,
  pill: 999,
} as const;

/** Minimum touch target (dp). */
export const touch = 48;

export const motion = {
  expoOut: Easing.bezier(0.16, 1, 0.3, 1),
  out: Easing.bezier(0.22, 1, 0.36, 1),
  press: 140,
  ui: 240,
  stamp: 520,
} as const;
/** Bottom padding of tab screens: clears the raised scan button (the tab bar itself takes its own space). */
export const TAB_CLEARANCE = 44;
