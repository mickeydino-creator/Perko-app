// The wallet as a stack of physical cards (Apple Wallet / Google Wallet style).
//
// Stack mode: cards overlap and show their 70 dp header strip. The screen scrolls with a custom pan + decay so
// that pulling past the top spreads the cards (Android's ScrollView cannot overscroll), and cards that scroll past
// the top edge compress into a thin pile. Focus mode: the tapped card springs to the top, the others drop into a
// pile at the bottom and quick actions appear. A horizontal swipe moves to the next card (RTL: dragging right
// brings the next one), a swipe down, a tap on the card or Android back returns to the stack.
//
// Everything that moves is a shared value read in useAnimatedStyle, so it runs on the UI thread.
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Platform, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../../lib/appearance';
import { useReduceMotion } from '../../lib/hooks';
import type { Card } from '../../lib/types';
import { gutter, TAB_CLEARANCE } from '../../theme';
import { cardA11y } from '../CardViews';
import { Txt } from '../Txt';
import { Button } from '../ui';
import { cardHeight, STRIP, WalletCardFace } from './WalletCard';

/** Close to critical damping: a short, confident settle with the smallest overshoot. */
const SPRING = { damping: 24, stiffness: 260, mass: 0.9 };
const PILE_PEEK = 64; // how much of the front pile card shows above the tab bar
const PILE_STEP = 8; // offset between pile cards
const PILE_SCALE = 0.92;
const SWIPE_COMMIT = 0.28; // share of the card width that commits a swipe

function settle(value: number, reduce: boolean) {
  'worklet';
  return reduce ? withTiming(value, { duration: 0 }) : withSpring(value, SPRING);
}

/** iOS-style rubber band: the further past the edge, the stronger the resistance. */
function rubber(over: number, dimension: number) {
  'worklet';
  const c = 0.55;
  return (1 - 1 / ((over * c) / dimension + 1)) * dimension;
}

function clampRubber(value: number, max: number, dimension: number) {
  'worklet';
  if (value < 0) return -rubber(-value, dimension);
  if (value > max) return max + rubber(value - max, dimension);
  return value;
}

function haptic(kind: 'snap' | 'switch') {
  if (Platform.OS === 'web') return;
  (kind === 'snap' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.selectionAsync()).catch(() => undefined);
}

type Props = {
  cards: Card[];
  header: ReactNode;
  footer: ReactNode;
  onDetails: (card: Card) => void;
  onScan: () => void;
  onRedeem: (card: Card) => void;
};

export function WalletStack({ cards, header, footer, onDetails, onScan, onRedeem }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const reduce = useReduceMotion();
  const { t } = useTheme();
  const n = cards.length;
  const W = screenW - gutter * 2;
  const H = cardHeight(W);
  const stackH = (n - 1) * STRIP + H;

  const [focused, setFocused] = useState<number | null>(null);

  // Geometry measured on layout, read on the UI thread.
  const viewportH = useSharedValue(0);
  const headerH = useSharedValue(0);
  const footerH = useSharedValue(0);
  const topInset = useSharedValue(insets.top);
  useEffect(() => {
    topInset.set(insets.top);
  }, [insets.top, topInset]);
  const reduceSV = useSharedValue(reduce);
  useEffect(() => {
    reduceSV.set(reduce);
  }, [reduce, reduceSV]);

  const scrollY = useSharedValue(0);
  const scrollStart = useSharedValue(0);
  const progress = useSharedValue(0); // 0 stack, 1 focus
  const focusIdx = useSharedValue(-1);
  const dragY = useSharedValue(0); // swipe-down on the focused card

  const maxScroll = useDerivedValue(() => Math.max(0, headerH.value + stackH + footerH.value + TAB_CLEARANCE - viewportH.value));

  // --- Focus changes (JS) ---------------------------------------------------------------------------
  const open = useCallback(
    (i: number) => {
      cancelAnimation(scrollY);
      scrollY.set(Math.min(Math.max(scrollY.value, 0), maxScroll.value));
      focusIdx.set(i);
      progress.set(settle(1, reduce));
      setFocused(i);
      haptic('snap');
    },
    [focusIdx, maxScroll, progress, reduce, scrollY],
  );
  const close = useCallback(() => {
    focusIdx.set(-1);
    dragY.set(settle(0, reduce));
    progress.set(settle(0, reduce));
    setFocused(null);
    haptic('snap');
  }, [dragY, focusIdx, progress, reduce]);
  const switchTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= n) return;
      focusIdx.set(i);
      setFocused(i);
      haptic('switch');
    },
    [focusIdx, n],
  );

  // Android back closes the focused card first.
  useFocusEffect(
    useCallback(() => {
      if (focused === null) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [focused, close]),
  );

  // --- Vertical scroll with rubber band ---------------------------------------------------------------
  const scrollPan = usePanGesture({
    enabled: focused === null,
    activeOffsetY: [-8, 8],
    failOffsetX: [-24, 24],
    onBegin: () => {
      'worklet';
      cancelAnimation(scrollY);
      scrollStart.set(scrollY.value);
    },
    onUpdate: (e) => {
      'worklet';
      scrollY.set(clampRubber(scrollStart.value - e.translationY, maxScroll.value, viewportH.value || 800));
    },
    onDeactivate: (e) => {
      'worklet';
      scrollY.set(withDecay({ velocity: -e.velocityY, clamp: [0, maxScroll.value], rubberBandEffect: true, rubberBandFactor: 0.9 }));
    },
  });

  // --- Header and footer fade out while a card is focused ------------------------------------------------
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: topInset.value + 12 + H + 18 + (1 - progress.value) * 24 }],
  }));

  const onRoot = (e: LayoutChangeEvent) => viewportH.set(e.nativeEvent.layout.height);
  const current = focused === null ? null : cards[focused];

  return (
    <GestureDetector gesture={scrollPan}>
      <View style={{ flex: 1, backgroundColor: t.bg, overflow: 'hidden' }} onLayout={onRoot}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, contentStyle]} pointerEvents={focused === null ? 'box-none' : 'none'}>
          <Animated.View style={[fadeStyle, { paddingTop: insets.top }]} onLayout={(e) => headerH.set(e.nativeEvent.layout.height)}>
            {header}
          </Animated.View>
          <View style={{ height: stackH }} />
          <Animated.View style={fadeStyle} onLayout={(e) => footerH.set(e.nativeEvent.layout.height)}>
            {footer}
          </Animated.View>
        </Animated.View>

        {/* Cards live in viewport coordinates so every visible card is touchable. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          {cards.map((card, i) => (
            <StackCard
              key={card.id}
              card={card}
              index={i}
              count={n}
              width={W}
              height={H}
              focused={focused}
              scrollY={scrollY}
              headerH={headerH}
              viewportH={viewportH}
              topInset={topInset}
              progress={progress}
              focusIdx={focusIdx}
              dragY={dragY}
              reduce={reduceSV}
              onOpen={open}
              onClose={close}
              onSwitch={switchTo}
            />
          ))}

          <Animated.View
            style={[{ position: 'absolute', top: 0, left: gutter, right: gutter, gap: 14 }, actionsStyle]}
            pointerEvents={current ? 'box-none' : 'none'}
            accessibilityElementsHidden={!current}
            importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
          >
            {current ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {current.status === 'complete' ? <Button label="מימוש ההטבה" onPress={() => onRedeem(current)} small /> : null}
                  <Button label="סריקה בקופה" onPress={onScan} small variant={current.status === 'complete' ? 'quiet' : 'ink'} />
                  <Button label="פרטי הכרטיס" onPress={() => onDetails(current)} small variant="quiet" />
                </View>
                {n > 1 ? <Pager index={focused!} count={n} /> : null}
              </>
            ) : null}
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

function Pager({ index, count }: { index: number; count: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`כרטיס ${index + 1} מתוך ${count}`}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: Math.min(count, 10) }, (_, k) => (
          <View key={k} style={{ width: k === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === index ? t.accent : t.surfaceStrong }} />
        ))}
      </View>
      <Txt size={13} color={t.textMuted}>החלקה לצד למעבר בין כרטיסים</Txt>
    </View>
  );
}

type CardProps = {
  card: Card;
  index: number;
  count: number;
  width: number;
  height: number;
  focused: number | null;
  scrollY: SharedValue<number>;
  headerH: SharedValue<number>;
  viewportH: SharedValue<number>;
  topInset: SharedValue<number>;
  progress: SharedValue<number>;
  focusIdx: SharedValue<number>;
  dragY: SharedValue<number>;
  reduce: SharedValue<boolean>;
  onOpen: (i: number) => void;
  onClose: () => void;
  onSwitch: (i: number) => void;
};

function StackCard(props: CardProps) {
  const { card, index: i, count: n, width: W, height: H, focused, scrollY, headerH, viewportH, topInset, progress, focusIdx, dragY, reduce } = props;
  const { onOpen, onClose, onSwitch } = props;

  const f = useSharedValue(0); // 1 when this card is the focused one
  const slot = useSharedValue(i); // position in the bottom pile
  const x = useSharedValue(0); // horizontal drag / incoming offset
  const axis = useSharedValue(0); // 0 undecided, 1 horizontal, 2 vertical

  useAnimatedReaction(
    () => focusIdx.value,
    (fi, prev) => {
      if (fi === prev) return;
      const r = reduce.value;
      if (fi >= 0) {
        f.set(settle(fi === i ? 1 : 0, r));
        slot.set(settle(i < fi ? i : i - 1, r));
        // The incoming card arrives from the side it was waiting on (RTL: the next card is on the left).
        if (fi === i && prev !== null && prev >= 0 && !r) {
          x.set((fi > prev ? -1 : 1) * W * 0.25);
          x.set(withSpring(0, SPRING));
        }
        if (prev === i) x.set(settle(0, r));
      } else {
        f.set(settle(prev === i ? 1 : 0, r)); // keep the closing card in place while progress runs back
        x.set(settle(0, r));
      }
    },
  );

  const isFocused = focused === i;

  const tap = useTapGesture({
    runOnJS: true,
    maxDeltaX: 10,
    maxDeltaY: 10,
    onActivate: () => {
      if (focused === null) onOpen(i);
      else if (focused === i) onClose();
      else onSwitch(i);
    },
  });

  const swipe = usePanGesture({
    enabled: isFocused,
    activeOffsetX: [-12, 12],
    activeOffsetY: 12,
    onBegin: () => {
      'worklet';
      axis.set(0);
    },
    onUpdate: (e) => {
      'worklet';
      // Lock the axis once the finger has clearly moved one way.
      if (axis.value === 0) {
        const ax = Math.abs(e.translationX);
        const ay = Math.abs(e.translationY);
        if (Math.max(ax, ay) < 8) return;
        axis.set(ax > ay ? 1 : 2);
      }
      if (axis.value === 1) {
        // RTL: dragging right brings the next card, left the previous one. Resist where there is none.
        const target = e.translationX > 0 ? i + 1 : i - 1;
        x.set(target >= 0 && target < n ? e.translationX : e.translationX * 0.3);
      } else {
        dragY.set(Math.max(0, e.translationY) * 0.85);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const r = reduce.value;
      if (axis.value === 1) {
        const dir = e.translationX > 0 ? 1 : -1;
        const target = i + dir;
        const far = Math.abs(e.translationX) > W * SWIPE_COMMIT || Math.abs(e.velocityX) > 700;
        if (far && target >= 0 && target < n) {
          scheduleOnRN(onSwitch, target);
        } else {
          x.set(settle(0, r));
        }
      } else if (axis.value === 2) {
        if (e.translationY > 110 || e.velocityY > 900) scheduleOnRN(onClose);
        else dragY.set(settle(0, r));
      }
    },
  });

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const stackTop = headerH.value - scrollY.value;

    // Stack layout: overscroll spreads, scrolling past the top compresses.
    const over = Math.max(0, -scrollY.value);
    const pinned = Math.min(Math.max(scrollY.value - headerH.value + topInset.value, 0), (n - 1) * STRIP);
    let local = i * STRIP + over * i * 0.35;
    let stackScale = 1;
    if (i * STRIP < pinned) {
      const depth = Math.min((pinned - i * STRIP) / STRIP, 4);
      local = pinned - depth * 4;
      stackScale = 1 - depth * 0.025;
    }
    const yStack = stackTop + local;

    // Focus layout: focused card at the top, the rest in a pile at the bottom.
    const others = Math.max(1, n - 1);
    const pileTop = viewportH.value - PILE_PEEK - Math.min(others - 1, 3) * PILE_STEP;
    const yPile = pileTop + Math.min(slot.value, 3) * PILE_STEP;
    const yFocus = topInset.value + 12 + (focusIdx.value === i ? dragY.value : 0);
    const yFocusMode = interpolate(f.value, [0, 1], [yPile, yFocus]);
    const focusScale = interpolate(f.value, [0, 1], [PILE_SCALE, 1]);

    return {
      // On top only while focused (or still travelling back to the stack).
      zIndex: f.value > 0.5 && p > 0.02 ? 100 : i,
      transform: [
        { translateX: x.value },
        { translateY: interpolate(p, [0, 1], [yStack, yFocusMode]) },
        { scale: interpolate(p, [0, 1], [stackScale, focusScale]) },
      ],
    };
  });

  const label = cardA11y(card);
  const actions = useMemo(
    () => [
      { name: 'activate', label: focused === i ? 'חזרה לערימה' : 'פתיחת הכרטיס' },
      ...(i < n - 1 ? [{ name: 'next', label: 'הכרטיס הבא' }] : []),
      ...(i > 0 ? [{ name: 'previous', label: 'הכרטיס הקודם' }] : []),
    ],
    [focused, i, n],
  );

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: gutter, width: W, height: H }, style]}>
        <GestureDetector gesture={swipe}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={focused === i ? 'הקשה מחזירה לערימה' : 'פותח את הכרטיס'}
            accessibilityState={{ selected: focused === i }}
            accessibilityActions={actions}
            onAccessibilityAction={(e) => {
              const a = e.nativeEvent.actionName;
              const target = a === 'next' ? i + 1 : a === 'previous' ? i - 1 : i;
              if (a === 'activate' && focused === i) onClose();
              else if (focused === null) onOpen(target);
              else onSwitch(target);
            }}
          >
            <WalletCardFace card={card} width={W} />
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}
