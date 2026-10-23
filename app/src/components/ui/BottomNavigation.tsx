import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CirclePlus, FileText, House, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Порядок и названия разделов как в макете: Хозяйство / Добавить / Отчеты / Профиль. */
export const NAV_ITEMS: Record<string, NavItem> = {
  '(home)': { key: '(home)', label: 'Хозяйство', icon: House },
  add: { key: 'add', label: 'Добавить', icon: CirclePlus },
  reports: { key: 'reports', label: 'Отчеты', icon: FileText },
  profile: { key: 'profile', label: 'Профиль', icon: User },
};

export interface BottomNavigationProps {
  items: NavItem[];
  activeKey: string;
  onPress: (key: string) => void;
}

export function BottomNavigation({ items, activeKey, onPress }: BottomNavigationProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: 10 + Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onPress(item.key)}
            style={styles.item}
          >
            <View style={[styles.chip, active && { backgroundColor: Colors.surfaceInfo }]}>
              <Icon icon={item.icon} size={24} color={active ? Colors.primary : Colors.textSecondary} />
            </View>
            <Text
              variant="caption"
              color={active ? Colors.primary : Colors.textSecondary}
              style={{ fontFamily: active ? 'Onest_600SemiBold' : 'Onest_400Regular' }}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 8,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  item: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56 },
  chip: { width: 58, height: 34, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
