// The wallet for screen-reader users: the same physical cards in a plain list, no gestures needed.
// Each card is one focusable button with "next" and "previous" actions that move TalkBack focus.
import { useRef, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/appearance';
import type { Card } from '../../lib/types';
import { gutter, TAB_CLEARANCE } from '../../theme';
import { cardA11y } from '../CardViews';
import { WalletCardFace } from './WalletCard';

type Props = { cards: Card[]; header: ReactNode; footer: ReactNode; onDetails: (card: Card) => void };

export function WalletList({ cards, header, footer, onDetails }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useTheme();
  const refs = useRef<(View | null)[]>([]);
  const focus = (i: number) => {
    const node = refs.current[i] && findNodeHandle(refs.current[i]);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: TAB_CLEARANCE }}>
      <View style={{ paddingTop: insets.top }}>{header}</View>
      <View style={{ gap: 14, paddingHorizontal: gutter }}>
        {cards.map((card, i) => (
          <Pressable
            key={card.id}
            ref={(r) => {
              refs.current[i] = r as View | null;
            }}
            onPress={() => onDetails(card)}
            accessibilityRole="button"
            accessibilityLabel={cardA11y(card)}
            accessibilityHint="פותח את פרטי הכרטיס"
            accessibilityActions={[
              { name: 'activate' },
              ...(i < cards.length - 1 ? [{ name: 'next', label: 'הכרטיס הבא' }] : []),
              ...(i > 0 ? [{ name: 'previous', label: 'הכרטיס הקודם' }] : []),
            ]}
            onAccessibilityAction={(e) => {
              const a = e.nativeEvent.actionName;
              if (a === 'activate') onDetails(card);
              else if (a === 'next') focus(i + 1);
              else if (a === 'previous') focus(i - 1);
            }}
          >
            <WalletCardFace card={card} width={width - gutter * 2} />
          </Pressable>
        ))}
      </View>
      {footer}
    </ScrollView>
  );
}
