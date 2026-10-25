// Мелкие контролы дизайн-системы: Checkbox, Radio (карточка-вариант), Toggle, Counter, Chips, Segmented Tabs.
import { Pressable, StyleSheet, View } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';

import { Colors, FontFamily, Radius } from '@/constants/theme';

import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text, useTextScale } from './Text';

// ─── Checkbox ───────────────────────────────────────────────────────────────

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  /** brand — синий (форма), success — зелёный (список «Куда попадут данные»). */
  tone?: 'brand' | 'success';
  /** Для чекбокса без onChange (список требований): как озвучить состояние, например «выполнено» / «не выполнено». */
  statusText?: { on: string; off: string };
}

export function CheckBox({ checked, onChange, label, description, disabled = false, tone = 'brand', statusText }: CheckboxProps) {
  const fill = tone === 'success' ? Colors.success : Colors.primary;
  const box = (
    <View
      style={[
        styles.box,
        checked ? { backgroundColor: fill, borderColor: fill } : { backgroundColor: Colors.surface, borderColor: disabled ? Colors.disabled : Colors.borderControl },
        disabled && !checked && { backgroundColor: Colors.border },
      ]}
    >
      {checked ? <Icon icon={Check} size={16} color={Colors.onPrimary} strokeWidth={2.5} /> : null}
    </View>
  );
  const content = (
    <View
      style={styles.row}
      accessible={!onChange && statusText && label ? true : undefined}
      accessibilityLabel={!onChange && statusText && label ? `${label}. ${checked ? statusText.on : statusText.off}` : undefined}
    >
      {box}
      {label ? (
        <View style={styles.flex}>
          <Text variant="small" color={disabled ? Colors.textSecondary : Colors.text}>
            {label}
          </Text>
          {description ? (
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!onChange) return content;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.touch}
    >
      {content}
    </Pressable>
  );
}

// ─── Radio ──────────────────────────────────────────────────────────────────

export interface RadioCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  disabled?: boolean;
}

export function RadioCard({ selected, onSelect, title, description, disabled = false }: RadioCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.radioCard, selected && styles.radioCardSelected]}
    >
      <View style={[styles.radio, { borderColor: selected ? Colors.primary : Colors.borderControl }]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        {description ? (
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

export interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ value, onChange, label, description, disabled = false }: ToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={styles.flex}>
        <Text variant="label">{label}</Text>
        {description ? (
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? Colors.primary : Colors.borderControl }, disabled && { opacity: 0.5 }]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

// ─── Counter ────────────────────────────────────────────────────────────────

export interface CounterProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  disabled?: boolean;
  /** sm — компактный «− N +» для списка скота. */
  size?: 'md' | 'sm';
  decrementLabel?: string;
  incrementLabel?: string;
}

export function Counter({ value, onChange, min = 0, max = 9999, label, disabled = false, size = 'md', decrementLabel, incrementLabel }: CounterProps) {
  const dec = decrementLabel ?? (label ? `Уменьшить: ${label}` : 'Уменьшить');
  const inc = incrementLabel ?? (label ? `Увеличить: ${label}` : 'Увеличить');
  const valueLabel = label ? `${label}: ${value}` : String(value);
  if (size === 'sm') {
    return (
      <View style={styles.counterSm}>
        <IconButton icon={Minus} variant="default" size={44} accessibilityLabel={dec} disabled={disabled || value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
        <Text variant="subtitle" align="center" style={styles.counterSmValue} accessibilityLabel={valueLabel} accessibilityLiveRegion="polite">
          {value}
        </Text>
        <IconButton icon={Plus} variant="soft" size={44} accessibilityLabel={inc} disabled={disabled || value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    );
  }
  return (
    <View style={[styles.counter, disabled && { opacity: 0.6 }]}>
      <IconButton icon={Minus} variant="soft" size={44} accessibilityLabel={dec} disabled={disabled || value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <Text variant="numberMd" align="center" style={styles.counterValue} accessibilityLabel={valueLabel} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <IconButton icon={Plus} variant="soft" size={44} accessibilityLabel={inc} disabled={disabled || value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

// ─── Chips (выбор из нескольких вариантов, как «Вид животного» и «Событие») ───

export interface ChipOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ChipsProps<T extends string = string> {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label?: string;
  columns?: number;
}

export function Chips<T extends string = string>({ options, value, onChange, label, columns: preferred = 3 }: ChipsProps<T>) {
  // Крупный текст: меньше колонок, чтобы подписи не рвались посреди слова.
  const textScale = useTextScale();
  const columns = textScale > 1.6 ? 1 : textScale > 1.2 ? Math.min(preferred, 2) : preferred;
  const rows: ChipOption<T>[][] = [];
  for (let i = 0; i < options.length; i += columns) rows.push(options.slice(i, i + columns));
  return (
    <View style={styles.chipsWrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.chipRow}>
            {row.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => onChange(option.value)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text variant="smallMedium" color={active ? Colors.primary : Colors.text} align="center" style={styles.chipLabel}>
                    {option.label}
                  </Text>
                  {active ? <Icon icon={Check} size={14} color={Colors.primary} strokeWidth={2} /> : null}
                </Pressable>
              );
            })}
            {Array.from({ length: columns - row.length }, (_, i) => (
              <View key={`pad-${i}`} style={styles.chipPad} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Segmented tabs ─────────────────────────────────────────────────────────

export interface TabOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string = string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedTabs<T extends string = string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  // Три и более вкладки при крупном тексте не помещаются в строку — ставим столбиком.
  const stacked = useTextScale() > 1.25 && options.length > 2;
  return (
    <View style={[styles.tabs, stacked && styles.tabsStacked]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: option.disabled }}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text
              variant="caption"
              color={active ? Colors.primary : option.disabled ? Colors.disabled : Colors.textSecondaryReadable}
              align="center"
              style={{ fontFamily: active ? FontFamily.semibold : FontFamily.regular }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  touch: { minHeight: 44, justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    minHeight: 72,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  radioCardSelected: { borderColor: Colors.primary, borderWidth: 1.5, backgroundColor: Colors.surfaceInfoSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4 },
  track: { width: 52, height: 30, borderRadius: Radius.pill, padding: 3, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surface },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  counterValue: { flex: 1 },
  counterSm: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterSmValue: { minWidth: 32 },
  chipsWrap: { gap: 8, alignSelf: 'stretch' },
  chips: { gap: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipPad: { flex: 1 },
  chip: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipLabel: { flexShrink: 1 },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.surfaceInfo },
  tabs: { flexDirection: 'row', padding: 4, gap: 2, borderRadius: Radius.md, backgroundColor: Colors.surfaceTabs, alignSelf: 'stretch' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 4, paddingVertical: 6 },
  tabsStacked: { flexDirection: 'column', gap: 4 },
  tabActive: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
});
