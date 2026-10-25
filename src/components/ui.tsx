import { router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO } from '../lib/config';
import { useReduceMotion } from '../lib/hooks';
import type { Tone } from '../lib/types';
import { colors, gutter, motion, radius, touch } from '../theme';
import { BackIcon } from './Icons';
import { Txt } from './Txt';

/* Button ------------------------------------------------------------------------------------- */

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** ink: ink pill with lime text (on light surfaces). lime: lime pill with ink text (on ink). quiet: pale pill. */
  variant?: 'ink' | 'lime' | 'quiet';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Fully rounded pill, one shape everywhere (website .btn). Presses scale to 0.97 like the site. */
export function Button({ label, onPress, variant = 'ink', disabled, busy, small, hint, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  const to = (v: number) =>
    !reduce && Animated.timing(scale, { toValue: v, duration: motion.press, easing: motion.out, useNativeDriver: true }).start();
  const bg = { ink: colors.ink, lime: colors.lime, quiet: colors.paleStrong }[variant];
  const bgPressed = { ink: colors.inkRaised, lime: colors.lime2, quiet: colors.pale }[variant];
  const fg = { ink: colors.lime, lime: colors.ink, quiet: colors.ink }[variant];
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={style}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            minHeight: small ? 44 : 56,
            minWidth: touch,
            paddingHorizontal: small ? 18 : 26,
            borderRadius: radius.pill,
            // Disabled: a flat tint instead of a faded brand colour.
            backgroundColor: disabled ? colors.paleStrong : pressed && !off ? bgPressed : bg,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale }],
          }}
        >
          {busy ? <ActivityIndicator color={fg} /> : <Txt kind="label" size={small ? 15 : 18} weight={700} color={disabled ? colors.muted : fg}>{label}</Txt>}
        </Animated.View>
      )}
    </Pressable>
  );
}

/* Avatar ------------------------------------------------------------------------------------- */

const toneStyle: Record<Tone | 'onLime', { bg: string; fg: string }> = {
  lime: { bg: colors.lime, fg: colors.ink },
  ink: { bg: colors.ink, fg: colors.lime },
  pale: { bg: colors.paleStrong, fg: colors.ink },
  onLime: { bg: colors.ink, fg: colors.lime },
};

/** The business initial in a rounded square (website .ui-avatar). On a lime card use tone "onLime". */
export function Avatar({ initial, tone, size = 44 }: { initial: string; tone: Tone | 'onLime'; size?: number }) {
  const t = toneStyle[tone];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt size={size * 0.38} weight={800} color={t.fg}>{initial}</Txt>
    </View>
  );
}

/* Screen ------------------------------------------------------------------------------------- */

type ScreenProps = {
  children: ReactNode;
  bg?: string;
  scroll?: boolean;
  /** Bottom padding, e.g. to clear the tab bar. */
  bottom?: number;
  /** False inside the tabs: the tab bar already covers the bottom inset. */
  edgeBottom?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** A screen with an explicit light background behind the status bar (the app never follows dark mode). */
export function Screen({ children, bg = colors.pale, scroll = true, bottom = 32, edgeBottom = true, contentStyle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 8, paddingHorizontal: gutter, paddingBottom: bottom + (edgeBottom ? insets.bottom : 0) };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: bg }, pad, contentStyle]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={[pad, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Back button + optional title for pushed screens. */
export function TopBar({ title, onBack, tone = 'ink' }: { title?: string; onBack?: () => void; tone?: 'ink' | 'paper' }) {
  const color = tone === 'ink' ? colors.ink : colors.paper;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: touch, marginBottom: 4, marginHorizontal: -8 }}>
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        accessibilityRole="button"
        accessibilityLabel="חזרה"
        hitSlop={4}
        style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: touch / 2 }}
      >
        <BackIcon color={color} />
      </Pressable>
      {title ? <Txt kind="label" size={17} color={color} style={{ flex: 1 }} accessibilityRole="header">{title}</Txt> : null}
    </View>
  );
}

/** Screen heading block (website .ui-top: small hello line above a heavy title). */
export function Heading({ over, title }: { over?: string; title: string }) {
  return (
    <View style={{ paddingTop: 4, paddingBottom: 16 }}>
      {over ? <Txt kind="lead" size={16} color={colors.muted}>{over}</Txt> : null}
      <Txt kind="title" accessibilityRole="header">{title}</Txt>
    </View>
  );
}

/** A small rounded tag, e.g. "לדוגמה" on sample businesses. */
export function Tag({ label, onLime }: { label: string; onLime?: boolean }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: onLime ? colors.inkOnLime14 : colors.pale,
      }}
    >
      <Txt size={12} weight={600} color={colors.muted}>{label}</Txt>
    </View>
  );
}

/** Thin banner shown in demo mode so nobody mistakes the sample data for a live service. */
export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <View style={{ backgroundColor: colors.paper, borderRadius: radius.row, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 }}>
      <Txt kind="small" color={colors.muted}>
        <Txt kind="small" weight={700}>מצב הדגמה.</Txt> נתונים לדוגמה על המכשיר הזה בלבד, בלי שרת. העסקים כאן הם המחשה.
      </Txt>
    </View>
  );
}

/** Loading, offline and error states with a retry. */
export function LoadState({ loading, error, onRetry }: { loading: boolean; error: 'offline' | 'error' | null; onRetry: () => void }) {
  if (error) {
    return (
      <View style={{ paddingVertical: 32, gap: 12, alignItems: 'flex-start' }}>
        <Txt kind="head">{error === 'offline' ? 'אין חיבור לאינטרנט' : 'משהו השתבש'}</Txt>
        <Txt color={colors.muted}>{error === 'offline' ? 'בודקים את החיבור ומנסים שוב.' : 'לא הצלחנו לטעון את הנתונים.'}</Txt>
        <Button label="לנסות שוב" onPress={onRetry} small />
      </View>
    );
  }
  if (loading) return <ActivityIndicator color={colors.ink} style={{ paddingVertical: 32 }} accessibilityLabel="טוען" />;
  return null;
}

/** Fade-and-rise entrance (website [data-reveal]); none with reduce motion. */
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: motion.expoOut, useNativeDriver: true }).start();
  }
  if (reduce) return <View style={style}>{children}</View>;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
