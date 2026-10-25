import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { TextStyle } from 'react-native';

import { digitsOnly } from '@/constants/format';
import { Colors, FontFamily } from '@/constants/theme';

import { Text } from './Text';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: string | null;
  label?: string;
}

/** 6 ячеек с автопереходом, обработкой Backspace и вставки кода целиком. */
export function OtpInput({ value, onChange, length = 6, error, label }: OtpInputProps) {
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  // Ячейка в фокусе: на вебе системную обводку убрали, фокус показываем рамкой и подложкой.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  const handleChange = (index: number, text: string) => {
    const digits = digitsOnly(text);
    if (digits.length === 0) {
      const next = chars.slice();
      next[index] = '';
      onChange(next.join('').slice(0, length));
      return;
    }
    const next = chars.slice();
    let cursor = index;
    for (const d of digits) {
      if (cursor >= length) break;
      next[cursor] = d;
      cursor += 1;
    }
    onChange(next.join(''));
    refs.current[Math.min(cursor, length - 1)]?.focus();
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={styles.row}>
        {chars.map((char, index) => (
          <TextInput
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={char}
            onChangeText={(text) => handleChange(index, text)}
            onKeyPress={(event) => {
              if (event.nativeEvent.key === 'Backspace' && !chars[index] && index > 0) {
                const next = chars.slice();
                next[index - 1] = '';
                onChange(next.join(''));
                refs.current[index - 1]?.focus();
              }
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete={index === 0 ? 'sms-otp' : 'off'}
            maxLength={length}
            selectTextOnFocus
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={`${label ?? 'Код из сообщения'}, цифра ${index + 1} из ${length}`}
            style={[
              styles.cell,
              { borderColor: error ? Colors.error : char || focusedIndex === index ? Colors.primary : Colors.borderControl },
              focusedIndex === index && styles.cellFocused,
            ]}
          />
        ))}
      </View>
      {error ? (
        <Text variant="caption" color={Colors.textErrorReadable} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontFamily: FontFamily.semibold,
    fontSize: 24,
    color: Colors.text,
    padding: 0,
    ...NO_OUTLINE,
    minWidth: 0,
    width: 0,
  },
  cellFocused: { backgroundColor: Colors.surfaceInfo, borderWidth: 2.5 },
});
