import { Pressable, StyleSheet, View } from 'react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';

import { Colors, Spacing } from '@/constants/theme';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { Text } from './Text';

export interface AppHeaderProps {
  /** Инициалы в аватаре; если не заданы — аватар не показывается (экраны входа). */
  initials?: string;
  onAvatarPress?: () => void;
  /** Вариант с кнопкой «назад» слева от логотипа. */
  onBack?: () => void;
}

export function AppHeader({ initials, onAvatarPress, onBack }: AppHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.brand}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Назад" hitSlop={12} onPress={onBack} style={styles.back}>
            <Icon icon={ArrowLeft} size={20} color={Colors.primary} />
          </Pressable>
        ) : null}
        <Logo />
      </View>
      {initials ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Профиль"
          onPress={onAvatarPress}
          hitSlop={4}
          style={styles.avatar}
        >
          <Text variant="caption" color={Colors.primary} style={styles.initials} allowFontScaling={false}>
            {initials}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
  },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceInfo, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Onest_600SemiBold' },
});
