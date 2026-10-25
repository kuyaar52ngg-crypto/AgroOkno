import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import CalendarIcon from 'lucide-react-native/icons/calendar';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronsLeft from 'lucide-react-native/icons/chevrons-left';
import ChevronsRight from 'lucide-react-native/icons/chevrons-right';

import { fmtDate, fmtDateLong, monthName, todayIso } from '@/constants/format';
import { Colors } from '@/constants/theme';

import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parse(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { y: y || 2026, m: m || 1, d: d || 1 };
}

interface CalendarProps {
  value: string;
  onSelect: (value: string) => void;
  maxDate?: string;
  minDate?: string;
}

function CalendarGrid({ value, onSelect, maxDate, minDate }: CalendarProps) {
  const initial = parse(value || todayIso());
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  // 0 — понедельник
  const offset = (new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array<null>(offset).fill(null)];
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const shift = (months: number) => {
    const total = view.y * 12 + (view.m - 1) + months;
    setView({ y: Math.floor(total / 12), m: (total % 12) + 1 });
  };
  const today = todayIso();

  return (
    <View style={styles.calendar}>
      <View style={styles.calHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий год" hitSlop={8} onPress={() => shift(-12)} style={styles.nav}>
          <Icon icon={ChevronsLeft} size={20} color={Colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" hitSlop={8} onPress={() => shift(-1)} style={styles.nav}>
          <Icon icon={ChevronLeft} size={20} color={Colors.primary} />
        </Pressable>
        <Text variant="bodySemibold" style={styles.calTitle} align="center">
          {monthName(view.m)} {view.y}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" hitSlop={8} onPress={() => shift(1)} style={styles.nav}>
          <Icon icon={ChevronRight} size={20} color={Colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующий год" hitSlop={8} onPress={() => shift(12)} style={styles.nav}>
          <Icon icon={ChevronsRight} size={20} color={Colors.primary} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} variant="caption" color={Colors.textSecondary} align="center" style={styles.cell}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((week, i) => (
        <View key={i} style={styles.weekRow}>
          {week.map((day, j) => {
            if (day === null) return <View key={j} style={styles.cell} />;
            const dayIso = iso(view.y, view.m, day);
            const disabled = Boolean((maxDate && dayIso > maxDate) || (minDate && dayIso < minDate));
            const selected = dayIso === value;
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={fmtDateLong(dayIso)}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onSelect(dayIso)}
                style={[styles.cell, styles.day, selected && styles.daySelected, dayIso === today && !selected && styles.dayToday]}
              >
                <Text
                  variant={selected ? 'bodySemibold' : 'body'}
                  color={selected ? Colors.onPrimary : disabled ? Colors.disabled : Colors.text}
                  align="center"
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** long — «23 октября 2026», short — «14.05.1990». */
  format?: 'long' | 'short';
  hint?: string;
  error?: string | null;
  maxDate?: string;
  minDate?: string;
  /** Подпись в строке (как «Дата события» в макете — слева подпись, справа значение). */
  inline?: boolean;
}

export function DateField({ label, value, onChange, format = 'long', hint, error, maxDate, minDate, inline = false }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const text = value ? (format === 'long' ? fmtDateLong(value) : fmtDate(value)) : 'Выберите дату';
  return (
    <View style={[styles.wrap, inline && styles.inlineWrap]}>
      {label && !inline ? <Text variant="label">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Дата'}: ${text}`}
        onPress={() => setOpen(true)}
        style={[inline ? styles.inline : styles.field, !inline && { borderColor: error ? Colors.error : Colors.border }]}
      >
        {inline ? (
          <Text variant="small" color={Colors.textSecondaryReadable}>
            {label}
          </Text>
        ) : null}
        <Text variant={inline ? 'smallMedium' : 'body'} color={value ? Colors.text : Colors.textSecondary} style={inline ? undefined : styles.value}>
          {text}
        </Text>
        <Icon icon={CalendarIcon} size={20} color={Colors.primary} />
      </Pressable>
      {error ? (
        <Text variant="caption" color={Colors.textErrorReadable}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          {hint}
        </Text>
      ) : null}
      <Sheet visible={open} title={label ?? 'Дата'} onClose={() => setOpen(false)}>
        <CalendarGrid
          value={value}
          maxDate={maxDate}
          minDate={minDate}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
        <View style={styles.today}>
          <Button
            title="Сегодня"
            variant="secondary"
            compact
            onPress={() => {
              onChange(todayIso());
              setOpen(false);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  inlineWrap: { gap: 0 },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
  },
  inline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  value: { flex: 1 },
  calendar: { paddingBottom: 8, gap: 4 },
  calHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  calTitle: { flex: 1 },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.surfaceInfo },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  day: { borderRadius: 10 },
  daySelected: { backgroundColor: Colors.primary },
  dayToday: { borderWidth: 1, borderColor: Colors.primary },
  today: { paddingTop: 8 },
});
