import type { ReactNode } from 'react';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/ui/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { Colors, Layout } from '@/constants/theme';
import { useAuth, useSyncStatus } from '@/data';

import { OfflineBanner } from './OfflineBanner';

export function initialsOf(fullName: string | null | undefined): string {
  if (!fullName) return 'АО';
  const letters = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || 'АО';
}

export interface BackTarget {
  label: string;
  /** Куда идти, если истории навигации нет (прямая ссылка / обновление страницы). */
  fallback: Href;
  /** Своё действие вместо перехода назад (например, выход на экране выбора роли). */
  onPress?: () => void;
}

export function BackLink({ label, fallback, onPress }: BackTarget) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Назад: ${label}`}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 24 }}
      onPress={() => {
        if (onPress) onPress();
        else if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
      style={styles.back}
    >
      <Icon icon={ArrowLeft} size={14} color={Colors.primary} />
      <Text variant="caption" color={Colors.primary} style={{ lineHeight: 20 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Строка над заголовком («Здравствуйте, Иван Иванов»). */
  eyebrow?: string;
  /** Подпись под заголовком акцентным цветом («Один раз ввел — везде сдал»). */
  tagline?: string;
  back?: BackTarget;
  /** app — логотип и аватар; brand — только логотип (экраны входа); none — без шапки. */
  header?: 'app' | 'brand' | 'none';
  /** Первая загрузка без кеша (G1): показываем skeleton вместо содержимого. */
  loading?: boolean;
  skeleton?: ReactNode;
  /** Данные из кеша (Query.fromCache) — тоже включают офлайн-плашку. */
  fromCache?: boolean;
  /** Показывать общую офлайн-плашку (по умолчанию да). */
  offlineBanner?: boolean;
  children?: ReactNode;
  /** Закреплённая панель над нижней навигацией (кнопки действий). */
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => Promise<void>;
  /** Нижний отступ под жестовую зону (экраны вне вкладок). */
  safeBottom?: boolean;
}

export function DefaultSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <Skeleton height={96} radius={18} />
      <Skeleton height={20} width="40%" />
      <Skeleton height={88} radius={16} />
      <Skeleton height={88} radius={16} />
    </View>
  );
}

export function Screen({
  title,
  subtitle,
  eyebrow,
  tagline,
  back,
  header = 'app',
  loading = false,
  skeleton,
  fromCache = false,
  offlineBanner = true,
  children,
  footer,
  scroll = true,
  contentStyle,
  onRefresh,
  safeBottom = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const sync = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const showOffline = offlineBanner && header !== 'brand' && (!sync.online || fromCache);

  const body = (
    <View style={[styles.content, contentStyle]}>
      {back || title || subtitle || eyebrow ? (
        <View style={styles.titleBlock}>
          {back ? <BackLink {...back} /> : null}
          {eyebrow ? (
            <Text variant="small" color={Colors.textSecondaryReadable}>
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text variant="h1" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {tagline ? (
            <Text variant="small" color={Colors.primary}>
              {tagline}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="small" color={Colors.textSecondaryReadable} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showOffline ? <OfflineBanner /> : null}
      {loading ? (skeleton ?? <DefaultSkeleton />) : children}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: insets.top }} />
      {header !== 'none' ? (
        <AppHeader
          initials={header === 'app' ? initialsOf(auth.profile?.full_name) : undefined}
          onAvatarPress={() => router.navigate('/profile')}
        />
      ) : null}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, safeBottom && { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await onRefresh();
                  setRefreshing(false);
                }}
              />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
      {footer ? <View style={[styles.footer, safeBottom && { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  content: { paddingHorizontal: Layout.screenPadding, paddingTop: 8, paddingBottom: 8, gap: 24 },
  titleBlock: { gap: 8 },
  subtitle: { lineHeight: 21 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20, alignSelf: 'flex-start' },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
