import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';

import { Colors } from '@/constants/theme';

import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SelectProps<T extends string = string> {
  label?: string;
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  /** Заголовок шторки; по умолчанию — label. */
  sheetTitle?: string;
  /** Иконка слева от значения (например, календарь у выбора периода). */
  leadingIcon?: LucideIcon;
}

export function Select<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выберите',
  hint,
  error,
  disabled = false,
  sheetTitle,
  leadingIcon,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" color={disabled ? Colors.textSecondary : Colors.text}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${selected?.label ?? placeholder}` : (selected?.label ?? placeholder)}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { backgroundColor: disabled ? Colors.border : Colors.surface, borderColor: error ? Colors.error : Colors.border },
        ]}
      >
        {leadingIcon ? <Icon icon={leadingIcon} size={20} color={Colors.primary} /> : null}
        <Text variant="body" color={selected && !disabled ? Colors.text : Colors.textSecondary} style={styles.value} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon icon={ChevronDown} size={20} color={disabled ? Colors.disabled : Colors.primary} />
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
      <Sheet visible={open} title={sheetTitle ?? label} onClose={() => setOpen(false)}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.optionText}>
                <Text variant={active ? 'bodySemibold' : 'body'} color={active ? Colors.primary : Colors.text}>
                  {option.label}
                </Text>
                {option.hint ? (
                  <Text variant="caption" color={Colors.textSecondary}>
                    {option.hint}
                  </Text>
                ) : null}
              </View>
              {active ? <Icon icon={Check} size={20} color={Colors.primary} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  value: { flex: 1 },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionActive: { backgroundColor: Colors.surfaceInfoSoft },
  optionText: { flex: 1, gap: 2 },
});
