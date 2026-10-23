import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Colors, Radius } from '@/constants/theme';

import { Icon } from './Icon';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  /** default — белая с рамкой, active — синяя, soft — светло-голубая (кнопки счётчика). */
  variant?: 'default' | 'active' | 'soft';
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, onPress, accessibilityLabel, variant = 'default', disabled = false, size = 44, style }: IconButtonProps) {
  const bg = disabled ? Colors.surfaceInfo : variant === 'active' ? Colors.primary : variant === 'soft' ? Colors.surfaceInfo : Colors.surface;
  const border = variant === 'default' ? Colors.border : 'transparent';
  const color = disabled ? Colors.disabled : variant === 'active' ? Colors.onPrimary : Colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, backgroundColor: bg, borderColor: border },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon icon={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
});
