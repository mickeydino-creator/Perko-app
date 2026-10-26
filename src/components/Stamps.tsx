// Stamp grid for stamp programs, progress meter for points programs (website: src/components/ui/Stamps.astro).
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../lib/appearance';
import { useReduceMotion } from '../lib/hooks';
import type { ProgramType } from '../lib/types';
import { colors, motion } from '../theme';
import { CheckIcon } from './Icons';
import { useOnBrand } from './surface';

export function columnsFor(goal: number): number {
  if (goal <= 6) return goal;
  if (goal === 8) return 4;
  return 5;
}

/** The surface the stamps sit on. "dark" is for ink and muted wallet cards: filled stamps are lime. */
export type StampSurface = 'light' | 'lime' | 'dark';

type StampsProps = {
  goal: number;
  current: number;
  /** On a lime surface: empty stamps are ink 14%, the reward stamp is an ink ring. */
  onLime?: boolean;
  surface?: StampSurface;
  /** Overrides the default column count (e.g. one row on a wallet card). */
  columns?: number;
  gap?: number;
  /** Index of a stamp that just landed: it drops in with a short expo-out scale. */
  landIndex?: number;
  size?: 'normal' | 'large';
};

export function Stamps({ goal, current, onLime, surface, columns, gap: gapProp, landIndex, size = 'normal' }: StampsProps) {
  const cols = columns ?? columnsFor(goal);
  const gap = gapProp ?? (size === 'large' ? 12 : 9);
  const { t } = useTheme();
  const brand = useOnBrand();
  // A plain surface in dark mode is ink-raised: use the on-ink stamps (lime discs). Explicit surfaces win.
  const on = surface ?? (onLime ? 'lime' : t.dark && !brand ? 'dark' : 'light');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${current} מתוך ${goal} חותמות`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, rowGap: gap }}
    >
      {Array.from({ length: goal }, (_, i) => (
        <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: gap / 2 }}>
          <Stamp on={i < current} reward={i === goal - 1} surface={on} land={i === landIndex} />
        </View>
      ))}
    </View>
  );
}

function Stamp({ on, reward, surface, land }: { on: boolean; reward: boolean; surface: StampSurface; land?: boolean }) {
  const onLime = surface === 'lime';
  const dark = surface === 'dark';
  const reduce = useReduceMotion();
  const v = useState(() => new Animated.Value(land ? 0 : 1))[0];

  useEffect(() => {
    if (!land) return;
    if (reduce) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: motion.stamp, delay: 180, easing: motion.expoOut, useNativeDriver: true }).start();
  }, [land, reduce, v]);

  const empty = dark ? colors.paperOnInk16 : onLime ? colors.inkOnLime14 : colors.pale;
  const ring = dark ? colors.paperOnInk60 : onLime ? colors.inkOnLime70 : colors.paleStrong;
  const filled = dark ? colors.lime : colors.ink;
  const showRing = reward && !on;

  // "Land": the stamp comes down from 1.6x and settles, like a rubber stamp hitting the card.
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });

  return (
    <View style={{ aspectRatio: 1, borderRadius: 999, backgroundColor: showRing ? 'transparent' : empty, alignItems: 'center', justifyContent: 'center' }}>
      {showRing ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, borderWidth: onLime ? 2.5 : 2.5, borderColor: ring, backgroundColor: onLime || dark ? 'transparent' : colors.paper }} />
      ) : null}
      {on ? (
        <Animated.View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: filled,
            opacity: v, transform: [{ scale }],
          }}
        />
      ) : null}
      {reward ? (
        <View style={{ width: '55%', height: '55%' }}>
          <CheckIcon size="100%" color={dark ? (on ? colors.ink : colors.paper) : on ? colors.lime : onLime ? colors.ink : colors.muted} />
        </View>
      ) : null}
    </View>
  );
}

/** Points progress (website .ui-meter). The fill grows from the start side (right in RTL). */
export function Meter({ goal, current, onLime, dark: darkProp, animate }: { goal: number; current: number; onLime?: boolean; dark?: boolean; animate?: boolean }) {
  const reduce = useReduceMotion();
  const { t } = useTheme();
  const brand = useOnBrand();
  const dark = darkProp ?? (!onLime && t.dark && !brand);
  const pct = Math.min(1, Math.max(0, goal ? current / goal : 0));
  const w = useState(() => new Animated.Value(animate && !reduce ? 0 : pct))[0];
  useEffect(() => {
    if (!animate || reduce) {
      w.setValue(pct);
      return;
    }
    Animated.timing(w, { toValue: pct, duration: 700, delay: 150, easing: motion.out, useNativeDriver: false }).start();
  }, [pct, animate, reduce, w]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${current} מתוך ${goal} נקודות`}
      accessibilityValue={{ min: 0, max: goal, now: current }}
      style={{ height: 14, borderRadius: 999, backgroundColor: dark ? colors.paperOnInk16 : onLime ? colors.inkOnLime14 : colors.pale, overflow: 'hidden', flexDirection: 'row' }}
    >
      <Animated.View
        style={{ height: '100%', borderRadius: 999, backgroundColor: dark ? colors.lime : colors.ink, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
      />
    </View>
  );
}

/** Slim bar for list rows (website .ui-bar). */
export function Bar({ value }: { value: number }) {
  const { t } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 999, backgroundColor: t.track, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, backgroundColor: t.accent, borderRadius: 999 }} />
    </View>
  );
}

/** Stamp grid or points meter, by program type. */
export function Progress({ type, goal, current, onLime, landIndex, animate }: { type: ProgramType; goal: number; current: number; onLime?: boolean; landIndex?: number; animate?: boolean }) {
  return type === 'stamps' ? <Stamps goal={goal} current={current} onLime={onLime} landIndex={landIndex} /> : <Meter goal={goal} current={current} onLime={onLime} animate={animate} />;
}
