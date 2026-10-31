// Perko brand tokens with no platform imports: the app (src/theme.ts re-exports them) and the business
// dashboard (dashboard/) read the same colours, radii and light/dark roles. Mirrors src/styles/global.css of the
// website (Perko-marketing repo).
// `colors` are the brand colours, the same in both appearances (loyalty card faces, lime surfaces, ink).

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
  paperOnInk16: 'rgba(248, 248, 244, 0.16)', // empty stamp and track on ink or muted
  paperOnInk60: 'rgba(248, 248, 244, 0.6)', // reward ring on ink or muted
} as const;

export const radius = {
  card: 22, // .ui-card 1.8em
  row: 18, // .ui-row 1.5em
  sheet: 28,
  avatar: 14,
  pill: 999,
} as const;

/** Semantic roles. Light reproduces the original app exactly; dark uses only brand colours and their tints. */
export type Palette = {
  dark: boolean;
  bg: string; // screen background
  surface: string; // rows, sheets, inputs on bg
  surfaceAlt: string; // inputs and tracks inside a surface
  surfaceStrong: string; // quiet buttons, pressed rows
  track: string; // empty stamps and bars on a surface
  text: string;
  textMuted: string;
  placeholder: string;
  accent: string; // fills that carry an action or the active state
  onAccent: string; // text and icons on accent
  accentPressed: string;
  hero: string; // brand screens: onboarding, sign-in, reward done
  onHero: string;
  onHeroMuted: string;
  heroTint: string; // pager dots, switch track on hero
  tabBar: string;
  border: string; // hairline that separates ink cards from an ink background
};

export const lightPalette: Palette = {
  dark: false,
  bg: colors.pale,
  surface: colors.paper,
  surfaceAlt: colors.pale,
  surfaceStrong: colors.paleStrong,
  track: colors.pale,
  text: colors.ink,
  textMuted: colors.muted,
  placeholder: 'rgba(48, 54, 38, 0.45)',
  accent: colors.ink,
  onAccent: colors.lime,
  accentPressed: colors.inkRaised,
  hero: colors.lime,
  onHero: colors.ink,
  onHeroMuted: colors.muted,
  heroTint: colors.inkOnLime14,
  tabBar: colors.paper,
  border: 'transparent',
};

export const darkPalette: Palette = {
  dark: true,
  bg: colors.ink,
  surface: colors.inkRaised,
  surfaceAlt: '#2A2E24', // ink + 10% paper
  surfaceStrong: '#2A2E24',
  track: '#2A2E24',
  text: colors.paper,
  textMuted: colors.slateOnInk,
  placeholder: 'rgba(185, 188, 176, 0.6)',
  accent: colors.lime, // lime with ink text on ink surfaces, as on the website
  onAccent: colors.ink,
  accentPressed: colors.lime2,
  hero: colors.ink,
  onHero: colors.paper,
  onHeroMuted: colors.slateOnInk,
  heroTint: 'rgba(248, 248, 244, 0.14)',
  tabBar: '#191C15',
  border: 'rgba(248, 248, 244, 0.12)',
};
