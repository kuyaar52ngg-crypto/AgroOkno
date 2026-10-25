import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { Colors, Radius } from '@/constants/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Показывает спиннер и текст loadingTitle («Сохраняем…»). */
  loading?: boolean;
  loadingTitle?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  /** Компактная высота 48 (как в стр. «03 · Компоненты»); по умолчанию 56, как на экранах макета. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const palette: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  primary: { bg: Colors.primary, border: Colors.primary, text: Colors.onPrimary },
  secondary: { bg: Colors.surface, border: Colors.border, text: Colors.primary },
  ghost: { bg: 'transparent', border: 'transparent', text: Colors.primary },
  danger: { bg: Colors.error, border: Colors.error, text: Colors.onPrimary },
  dangerOutline: { bg: Colors.surface, border: Colors.border, text: Colors.textErrorReadable },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  loadingTitle = 'Сохраняем…',
  disabled = false,
  icon,
  compact = false,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled && !loading;
  const colors = inactive && variant === 'primary' ? { bg: Colors.disabled, border: Colors.disabled, text: Colors.textSecondaryReadable } : palette[variant];
  const textColor = inactive && variant !== 'primary' ? Colors.textSecondaryReadable : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingTitle : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: colors.bg, borderColor: colors.border, minHeight: compact ? 48 : 56, borderRadius: compact ? Radius.md : 10 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={textColor} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : icon ? <Icon icon={icon} size={20} color={textColor} /> : null}
        <Text variant="bodySemibold" color={textColor} style={styles.label}>
          {loading ? loadingTitle : title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.85 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { flexShrink: 1, textAlign: 'center' },
});
