// Обратная связь: Badge, Alert, Skeleton.
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import FilePenLine from 'lucide-react-native/icons/file-pen-line';
import Info from 'lucide-react-native/icons/info';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Unlink from 'lucide-react-native/icons/unlink';

import { Colors, Radius } from '@/constants/theme';

import { Icon } from './Icon';
import { Text } from './Text';

// ─── Badge ──────────────────────────────────────────────────────────────────

export type BadgeTone = 'success' | 'draft' | 'overdue' | 'neutral';

const badgeStyles: Record<BadgeTone, { bg: string; text: string; icon: string; glyph: LucideIcon }> = {
  success: { bg: Colors.surfaceSuccess, text: Colors.successReadable, icon: Colors.success, glyph: CircleCheck },
  draft: { bg: Colors.surfaceWarning, text: Colors.warningReadable, icon: Colors.warning, glyph: FilePenLine },
  overdue: { bg: Colors.surfaceError, text: Colors.textErrorReadable, icon: Colors.error, glyph: CircleAlert },
  neutral: { bg: Colors.border, text: Colors.textSecondaryReadable, icon: Colors.textSecondary, glyph: Unlink },
};

export interface BadgeProps {
  tone: BadgeTone;
  label: string;
  icon?: LucideIcon;
}

export function Badge({ tone, label, icon }: BadgeProps) {
  const palette = badgeStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]} accessibilityLabel={label}>
      <Icon icon={icon ?? palette.glyph} size={14} color={palette.icon} />
      <Text variant="caption" color={palette.text}>
        {label}
      </Text>
    </View>
  );
}

// ─── Alert ──────────────────────────────────────────────────────────────────

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const alertStyles: Record<AlertTone, { bg: string; title: string; text: string; icon: string; glyph: LucideIcon }> = {
  info: { bg: Colors.surfaceInfoSoft, title: Colors.primary, text: Colors.primary, icon: Colors.primary, glyph: Info },
  success: { bg: Colors.surfaceSuccess, title: Colors.successReadable, text: Colors.successReadable, icon: Colors.success, glyph: CircleCheck },
  warning: { bg: Colors.surfaceWarning, title: Colors.warningReadable, text: Colors.warningReadable, icon: Colors.warning, glyph: TriangleAlert },
  error: { bg: Colors.surfaceError, title: Colors.textErrorReadable, text: Colors.textErrorReadable, icon: Colors.error, glyph: CircleAlert },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: string;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}

export function Alert({ tone = 'info', title, children, icon, style }: AlertProps) {
  const palette = alertStyles[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'none'}
      style={[styles.alert, { backgroundColor: palette.bg }, style]}
    >
      <View style={styles.alertIcon}>
        <Icon icon={icon ?? palette.glyph} size={20} color={palette.icon} />
      </View>
      <View style={styles.alertBody}>
        {title ? (
          <Text variant="label" color={palette.title} style={{ fontSize: 13 }}>
            {title}
          </Text>
        ) : null}
        {children ? (
          <Text variant="caption" color={palette.text}>
            {children}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Skeleton (G1) ──────────────────────────────────────────────────────────

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: Colors.skeleton, opacity }, style]} />;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 10, alignSelf: 'stretch' },
  alertIcon: { height: 18, justifyContent: 'center' },
  alertBody: { flex: 1, gap: 2 },
});
