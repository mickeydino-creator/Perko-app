// react-native-maps has no web version; the web preview shows a note and the list stays available.
import { View } from 'react-native';
import { useTheme } from '../../lib/appearance';
import { radius } from '../../theme';
import { Txt } from '../Txt';
import type { MapProps } from './BusinessMap';

export function BusinessMap(_: MapProps) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.card, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Txt align="center" color={t.textMuted}>המפה זמינה באפליקציה בטלפון. ברשימה מופיעים כל העסקים.</Txt>
    </View>
  );
}
