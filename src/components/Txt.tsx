import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, type as typeScale, type TypeRole, type Weight } from '../theme';

type Props = TextProps & {
  kind?: TypeRole;
  weight?: Weight;
  size?: number;
  color?: string;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
};

/** Heebo text with the app's type roles. Tracking is converted from em to dp, as letter-spacing is on the site. */
export function Txt({ kind = 'body', weight, size, color = colors.ink, align, tabular, style, ...rest }: Props) {
  const r = typeScale[kind];
  const fontSize = size ?? r.size;
  const w = weight ?? r.weight;
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        {
          fontFamily: fonts[w],
          fontSize,
          lineHeight: Math.round(fontSize * r.line),
          letterSpacing: r.tracking * fontSize,
          color,
          textAlign: align,
          fontVariant: tabular ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
    />
  );
}
