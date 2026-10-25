// Line-free, solid icons drawn like the website's app icons (src/styles/app.css .ui-ico--*). No emoji.
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

type P = { size?: number | string; color?: string };

export const HomeIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={3} y={5} width={18} height={14} rx={3} fill={color} /></Svg>
);
export const PinIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill={color} />
  </Svg>
);
export const GiftIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} fill={color} /></Svg>
);
export const UserIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={8} r={4.5} fill={color} />
    <Path d="M3 21c1-5 5-7 9-7s8 2 9 7z" fill={color} />
  </Svg>
);
export const SearchIcon = ({ size = 20, color = colors.muted }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3-1.5 1.5-4.3-4.3A7.5 7.5 0 1 1 10.5 3zm0 2.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" fill={color} />
  </Svg>
);
export const CheckIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
/** Points to the right: "back" in an RTL app. */
export const BackIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9 5l7 7-7 7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
/** Points to the left: "forward" / open in an RTL app. */
export const ChevronIcon = ({ size = 20, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const CloseIcon = ({ size = 24, color = colors.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
  </Svg>
);

/** Drawn QR-like glyph (website: src/components/ui/QrGlyph.astro). Not a readable code. */
export function QrGlyph({ size = 24, color = colors.ink, bg = colors.paper }: P & { bg?: string }) {
  const finders = [[0, 0], [9, 0], [0, 9]];
  const inFinder = (x: number, y: number) => (x < 7 && y < 7) || (x > 7 && y < 7) || (x < 7 && y > 7);
  const cells: [number, number][] = [];
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 15; x++) if (!inFinder(x, y) && (x * 7 + y * 13 + x * y * 3) % 5 < 2) cells.push([x, y]);
  return (
    <Svg width={size} height={size} viewBox="0 0 15 15">
      {finders.map(([x, y]) => (
        <G key={`${x}-${y}`}>
          <Rect x={x} y={y} width={6} height={6} rx={1.2} fill={color} />
          <Rect x={x + 1} y={y + 1} width={4} height={4} rx={0.7} fill={bg} />
          <Rect x={x + 2} y={y + 2} width={2} height={2} rx={0.4} fill={color} />
        </G>
      ))}
      {cells.map(([x, y]) => <Rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} rx={0.2} fill={color} />)}
    </Svg>
  );
}
