// The Perko logo, as on the website (src/components/Wordmark.astro, AppIcon.astro).
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';
import { WORDMARK } from './wordmarkPath';

/**
 * Lowercase "perk" in Heebo 800, tracking -0.055em, and a solid disc as the "o" (a collected stamp).
 * Drawn from vector paths (wordmarkPath.ts) so the disc sits on the baseline exactly as on the website,
 * on iOS, Android and web alike. `size` is the font size in dp.
 * tone "ink": ink letters and disc, for light surfaces. tone "lime": paper letters and lime disc, for ink surfaces.
 */
export function Wordmark({ size = 30, tone = 'ink' }: { size?: number; tone?: 'ink' | 'lime' }) {
  const letters = tone === 'ink' ? colors.ink : colors.paper;
  const disc = tone === 'ink' ? colors.ink : colors.lime;
  const k = size / WORDMARK.em;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Perko" style={{ alignSelf: 'flex-start' }}>
      <Svg width={WORDMARK.width * k} height={WORDMARK.height * k} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}>
        <Path d={WORDMARK.letters} fill={letters} />
        <Circle cx={WORDMARK.disc.cx} cy={WORDMARK.disc.cy} r={WORDMARK.disc.r} fill={disc} />
      </Svg>
    </View>
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
