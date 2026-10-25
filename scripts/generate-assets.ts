// Generates the Android icons, splash image and favicon from the Perko app icon
// (website: src/components/AppIcon.astro, public/favicon.svg). Run: npm run assets
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const LIME = '#D7FF35';
const INK = '#11130F';

// The "p": a stem and a solid disc as its bowl (the collected stamp). Coordinates in the 64-unit icon box.
const glyph = (fill: string) =>
  `<rect x="17" y="17" width="11" height="35" rx="5.5" fill="${fill}"/><circle cx="35" cy="29" r="12.5" fill="${fill}"/>`;

// Full icon exactly as on the site: lime rounded square + ink "p".
const icon = (rounded: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rounded ? 16 : 0}" fill="${LIME}"/>${glyph(INK)}</svg>`;

// Adaptive icon layers use a 108 dp canvas whose middle 72 dp is visible: map the 64 box onto those 72 dp.
const adaptive = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(18 18) scale(1.125)">${glyph(fill)}</g></svg>`;

// Splash: the glyph alone, centred, on transparent (the splash background is lime).
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(-0.25 -2.25)">${glyph(INK)}</g></svg>`;

mkdirSync('assets', { recursive: true });
const out = (svg: string, size: number, file: string) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`assets/${file}`);

await Promise.all([
  out(icon(false), 1024, 'icon.png'), // Android masks the legacy icon itself
  out(adaptive(INK), 1024, 'android-icon-foreground.png'),
  out(adaptive('#FFFFFF'), 1024, 'android-icon-monochrome.png'),
  out(splash, 1024, 'splash-icon.png'),
  out(icon(true), 48, 'favicon.png'),
]);
console.log('assets written');
