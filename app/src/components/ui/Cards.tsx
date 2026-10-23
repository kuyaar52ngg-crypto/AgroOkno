// Карточки дизайн-системы: Card, StatCard, QuickAction, EventRow, ListRow, ReportCard, DataTable, DestinationsCard.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ArrowRight, ChevronRight } from 'lucide-react-native';

import { Colors, Radius, Shadow } from '@/constants/theme';

import { CheckBox } from './Controls';
import { Badge } from './Feedback';
import type { BadgeTone } from './Feedback';
import { Icon } from './Icon';
import { Text } from './Text';

// ─── Card ───────────────────────────────────────────────────────────────────

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'error' | 'primary';
}

export function Card({ children, style, onPress, accessibilityLabel, tone = 'default' }: CardProps) {
  const toneStyle: ViewStyle =
    tone === 'error'
      ? { borderColor: Colors.error }
      : tone === 'primary'
        ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
        : {};
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.card, toneStyle, pressed && { opacity: 0.85 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

// ─── StatCard ───────────────────────────────────────────────────────────────

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'primary';
  style?: StyleProp<ViewStyle>;
}

export function StatCard({ label, value, unit, tone = 'default', style }: StatCardProps) {
  const primary = tone === 'primary';
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value} ${unit ?? ''}`}
      style={[styles.stat, primary ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : null, style]}
    >
      <Text variant="label" color={primary ? Colors.onPrimary : Colors.text} style={{ fontSize: 14 }}>
        {label}
      </Text>
      <View style={styles.statValue}>
        <Text variant="number" color={primary ? Colors.onPrimary : Colors.text}>
          {value}
        </Text>
        {unit ? (
          <Text variant="small" color={primary ? Colors.onPrimaryMuted : Colors.textSecondary}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── QuickAction ────────────────────────────────────────────────────────────

export interface QuickActionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}

export function QuickAction({ icon, title, description, onPress }: QuickActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}
    >
      <Icon icon={icon} size={24} color={Colors.primary} />
      <View style={styles.quickText}>
        <Text variant="label" style={{ lineHeight: 18 }}>
          {title}
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── EventRow ───────────────────────────────────────────────────────────────

export interface EventRowProps {
  icon: LucideIcon;
  title: string;
  meta: string;
  value?: string;
  onPress?: () => void;
  pendingSync?: boolean;
}

export function EventRow({ icon, title, meta, value, onPress, pendingSync }: EventRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${value ? `, ${value}` : ''}. ${meta}${pendingSync ? '. Ожидает синхронизации' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.event, pressed && { opacity: 0.85 }]}
    >
      <Icon icon={icon} size={24} color={Colors.primary} />
      <View style={styles.eventText}>
        <Text variant="bodySemibold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {value ? (
        <Text variant="label" color={Colors.primary}>
          {value}
        </Text>
      ) : null}
      <Icon icon={ChevronRight} size={20} color={Colors.primary} />
    </Pressable>
  );
}

// ─── ListRow ────────────────────────────────────────────────────────────────

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  /** Строка без шевроном (просто значение). */
  noChevron?: boolean;
}

export function ListRow({ title, subtitle, value, icon, onPress, destructive = false, last = false, noChevron = false }: ListRowProps) {
  const color = destructive ? Colors.textErrorReadable : Colors.text;
  const content = (
    <>
      {icon ? <Icon icon={icon} size={20} color={destructive ? Colors.error : Colors.primary} /> : null}
      <View style={styles.rowText}>
        <Text variant={destructive ? 'bodySemibold' : 'bodySemibold'} color={color}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" color={Colors.textSecondaryReadable}>
          {value}
        </Text>
      ) : null}
      {onPress && !destructive && !noChevron ? <Icon icon={ChevronRight} size={20} color={Colors.primary} /> : null}
    </>
  );
  const containerStyle = [styles.listRow, !last && styles.listRowBorder];
  if (!onPress) return <View style={containerStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [containerStyle, pressed && { opacity: 0.75 }]}
    >
      {content}
    </Pressable>
  );
}

/** Группа ListRow внутри белой карточки. */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.listGroup, style]}>{children}</View>;
}

// ─── ReportCard ─────────────────────────────────────────────────────────────

export type ReportCardStatus = 'submitted' | 'draft' | 'overdue' | 'not_started' | 'failed';

const reportBadge: Record<ReportCardStatus, { tone: BadgeTone; label: string }> = {
  submitted: { tone: 'success', label: 'Сдан' },
  draft: { tone: 'draft', label: 'Черновик' },
  overdue: { tone: 'overdue', label: 'Просрочен' },
  not_started: { tone: 'neutral', label: 'Не начат' },
  failed: { tone: 'overdue', label: 'Не отправлен' },
};

export interface ReportCardProps {
  title: string;
  description: string;
  status: ReportCardStatus;
  meta: string;
  onPress: () => void;
}

export function ReportCard({ title, description, status, meta, onPress }: ReportCardProps) {
  const overdue = status === 'overdue';
  const badge = reportBadge[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${badge.label}. ${description}. ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.report, overdue && { borderColor: Colors.error }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.reportHead}>
        <Text variant="bodyLg" style={styles.reportTitle}>
          {title}
        </Text>
        <Badge tone={badge.tone} label={badge.label} />
      </View>
      <Text variant="caption" color={Colors.textSecondaryReadable}>
        {description}
      </Text>
      <View style={styles.reportFoot}>
        <Text variant="caption" color={overdue ? Colors.error : Colors.textSecondaryReadable} style={styles.reportMeta}>
          {meta}
        </Text>
        <Icon icon={ArrowRight} size={16} color={Colors.primary} />
      </View>
    </Pressable>
  );
}

// ─── DataTable («Показатель / Значение / ед.») ──────────────────────────────

export interface DataRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface DataTableProps {
  title?: string;
  description?: string;
  rows: DataRow[];
  /** Заголовок колонок «Показатель — Значение / ед.». */
  showHeader?: boolean;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

export function DataTable({ title, description, rows, showHeader = true, style, footer }: DataTableProps) {
  return (
    <View style={[styles.table, style]}>
      {title ? (
        <Text variant="bodyLg" style={styles.tableTitle}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="caption" color={Colors.textSecondaryReadable} style={styles.tableDescription}>
          {description}
        </Text>
      ) : null}
      {showHeader && rows.length > 0 ? (
        <View style={styles.tableHeader}>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Показатель
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            Значение / ед.
          </Text>
        </View>
      ) : null}
      {rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={[styles.tableRow, index < rows.length - 1 && styles.tableRowBorder]}>
          <Text variant="small" style={styles.tableLabel}>
            {row.label}
          </Text>
          <Text variant="label" style={styles.tableValue} align="right">
            {row.value}
          </Text>
        </View>
      ))}
      {footer}
    </View>
  );
}

// ─── DestinationsCard («Куда попадут данные») ───────────────────────────────

export interface DestinationsCardProps {
  items: string[];
  note?: string;
  /** checks — зелёные галочки (формы ввода), plain — строки с разделителями (результат сохранения). */
  variant?: 'checks' | 'plain';
  title?: string;
}

export const DESTINATIONS_NOTE =
  'Данные обновятся после сохранения. Отчеты отправляются только после вашей проверки и подтверждения.';

export function DestinationsCard({ items, note = DESTINATIONS_NOTE, variant = 'checks', title = 'Куда попадут данные' }: DestinationsCardProps) {
  return (
    <View style={styles.dest}>
      <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
        {title}
      </Text>
      <View style={variant === 'checks' ? styles.destChecks : undefined}>
        {items.map((item, i) =>
          variant === 'checks' ? (
            <CheckBox key={`${item}-${i}`} checked tone="success" label={item} />
          ) : (
            <View key={`${item}-${i}`} style={[styles.destPlain, styles.tableRowBorder]}>
              <Text variant="small">{item}</Text>
            </View>
          ),
        )}
      </View>
      <Text variant="caption" color={Colors.textSecondaryReadable}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    minHeight: 96,
    padding: 14,
    gap: 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'space-between',
  },
  statValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  quick: {
    flex: 1,
    minHeight: 112,
    padding: 16,
    gap: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  quickText: { gap: 4 },
  event: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  eventText: { flex: 1, gap: 2 },
  rowText: { flex: 1, gap: 2 },
  listGroup: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
    ...Shadow,
  },
  listRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  report: {
    padding: 16,
    gap: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignSelf: 'stretch',
  },
  reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reportTitle: { fontFamily: 'Onest_600SemiBold', flexShrink: 1 },
  reportFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reportMeta: { flexShrink: 1 },
  table: {
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignSelf: 'stretch',
  },
  tableTitle: { fontFamily: 'Onest_600SemiBold', marginBottom: 12 },
  tableDescription: { marginTop: -6, marginBottom: 12 },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8 },
  tableRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 8 },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableLabel: { flex: 1 },
  tableValue: { flexShrink: 1, maxWidth: '55%' },
  dest: {
    padding: 16,
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignSelf: 'stretch',
  },
  destChecks: { gap: 4 },
  destPlain: { minHeight: 48, justifyContent: 'center' },
});
