// Perko design tokens for the app. Mirrors src/styles/global.css of the website (Perko-marketing repo).
// Colours, radii and the light/dark palettes live in src/tokens.ts (no platform imports), shared with dashboard/.
// Screens take their roles (background, surface, text, accent...) from `useTheme()`.
import { Easing } from 'react-native';

export { colors, darkPalette, lightPalette, radius, type Palette } from './tokens';

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
