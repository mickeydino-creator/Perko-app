// The Perko logo, as on the website (src/components/Wordmark.astro, AppIcon.astro).
import { View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { Txt } from './Txt';

/**
 * Lowercase "perk" in Heebo 800, tracking -0.055em, and a solid disc as the "o" (a collected stamp).
 * tone "ink": ink letters and disc, for light surfaces. tone "lime": paper letters and lime disc, for ink surfaces.
 */
export function Wordmark({ size = 30, tone = 'ink' }: { size?: number; tone?: 'ink' | 'lime' }) {
  const letters = tone === 'ink' ? colors.ink : colors.paper;
  const disc = tone === 'ink' ? colors.ink : colors.lime;
  const d = size * 0.5;
  return (
    <Txt
      size={size}
      weight={800}
      color={letters}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Perko"
      style={{
        fontFamily: fonts[800],
        letterSpacing: -0.055 * size,
        lineHeight: size * 1.05,
        includeFontPadding: false,
        alignSelf: 'flex-start',
        // The wordmark is Latin: left to right inside the RTL layout.
        writingDirection: 'ltr',
      }}
    >
      perk
      {/* The "o" is a view inside the text: iOS, Android and web all set its bottom on the baseline,
          like the inline-block disc of the website, whatever the font metrics. */}
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: disc, transform: [{ translateY: -0.015 * size }] }} />
    </Txt>
  );
}

/** App icon: lime rounded square, ink "p" whose bowl is a solid disc. */
export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={64} height={64} rx={16} fill={colors.lime} />
      <Rect x={17} y={17} width={11} height={35} rx={5.5} fill={colors.ink} />
      <Circle cx={35} cy={29} r={12.5} fill={colors.ink} />
    </Svg>
  );
}
