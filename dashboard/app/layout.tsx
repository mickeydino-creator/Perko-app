import '@fontsource-variable/heebo';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { colors, darkPalette, lightPalette, radius, type Palette } from '../../src/tokens.ts';

export const metadata: Metadata = {
  title: 'Perko לעסקים',
  description: 'ניהול תוכנית הנאמנות של העסק ב-Perko: תוכנית, צוות, יומן, תובנות וקוד לקופה.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: lightPalette.bg },
    { media: '(prefers-color-scheme: dark)', color: darkPalette.bg },
  ],
};

// The app's tokens (src/tokens.ts) as CSS variables: brand colours, and the light and dark roles.
const roles = (p: Palette) =>
  (['bg', 'surface', 'surfaceAlt', 'surfaceStrong', 'text', 'textMuted', 'placeholder', 'accent', 'onAccent', 'accentPressed', 'hero', 'onHero', 'border'] as const)
    .map((k) => `--${k}:${p[k]};`)
    .join('');
const brand = Object.entries(colors).map(([k, v]) => `--${k}:${v};`).join('');
const css = `:root{${brand}${roles(lightPalette)}--radius-card:${radius.card}px;--radius-row:${radius.row}px;--radius-sheet:${radius.sheet}px;color-scheme:light}
@media (prefers-color-scheme: dark){:root{${roles(darkPalette)}color-scheme:dark}}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
