import { ArrowUp, Mic } from 'lucide-react-native';
import { useState } from 'react';
import type { ComponentRef, Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import type { TextStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text, useFontScale } from '@/components/ui/Text';
import { Colors, FontFamily, Layout } from '@/constants/theme';

const NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;

export interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onMic: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Подсказка под полем (J2: «Нажмите «Отправить» — запишу надой в журнал.»). */
  hint?: string | null;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
}

/** Поле «Напишите или скажите…» + кнопка микрофона ↔ «Отправить» (J1, J2, J5, J7). */
export function Composer({ value, onChangeText, onSend, onMic, placeholder = 'Напишите или скажите…', disabled = false, hint, inputRef }: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const scale = useFontScale();
  const hasText = value.trim().length > 0;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <View style={[styles.field, focused && { borderColor: Colors.primary, borderWidth: 1.5 }]}>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textSecondary}
            accessibilityLabel="Сообщение помощнику"
            multiline
            editable={!disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={hasText ? onSend : undefined}
            submitBehavior="blurAndSubmit"
            returnKeyType="send"
            style={[styles.input, { fontSize: 16 * scale, lineHeight: 24 * scale }]}
            testID="chat-input"
          />
        </View>
        {hasText ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отправить"
            disabled={disabled}
            onPress={onSend}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }, disabled && { opacity: 0.6 }]}
            testID="chat-send"
          >
            <Icon icon={ArrowUp} size={24} color={Colors.onPrimary} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Начать голосовой ввод"
            accessibilityHint="Запишите голосовое сообщение помощнику"
            onPress={onMic}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
            testID="chat-mic"
          >
            <Icon icon={Mic} size={24} color={Colors.onPrimary} />
          </Pressable>
        )}
      </View>
      {hint ? (
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface VoicePanelProps {
  elapsedMs: number;
  levels: number[];
  busy: boolean;
  onDone: () => void;
  onCancel: () => void;
}

/** J3 · «Идет запись»: таймер, осциллограмма, «Готово — сохранить», «Отменить». */
export function VoicePanel({ elapsedMs, levels, busy, onDone, onCancel }: VoicePanelProps) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, Layout.maxWidth) - Layout.screenPadding * 2;
  // 5 px столбик + 6 px зазор, как в макете; число столбиков зависит от ширины экрана.
  const count = Math.max(16, Math.min(30, Math.floor((inner - 20 + 6) / 11)));
  const bars = Array.from({ length: count }, (_, i) => levels[levels.length - count + i] ?? 0.08);
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.voiceHead}>
        <Text variant="title" style={{ fontSize: 18, lineHeight: 24 }} accessibilityLiveRegion="polite">
          Идет запись
        </Text>
        <Text variant="title" color={Colors.primary} style={{ fontSize: 18, lineHeight: 24 }} accessibilityLabel={`Длительность ${mmss(elapsedMs)}`}>
          {mmss(elapsedMs)}
        </Text>
      </View>
      <View style={styles.wave} accessibilityLabel="Уровень звука записи" importantForAccessibility="no-hide-descendants">
        {bars.map((level, index) => (
          <View key={index} style={[styles.bar, { height: Math.round(8 + level * 50) }]} />
        ))}
      </View>
      <Text variant="bodyLg" color={Colors.textSecondaryReadable}>
        Скажите, сколько молока получили. Нажмите «Готово — сохранить». Если не расслышу количество — уточню.
      </Text>
      <View style={{ gap: 12 }}>
        <Button title="Готово — сохранить" onPress={onDone} loading={busy} loadingTitle="Отправляем…" />
        <Button title="Отменить" variant="secondary" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  field: {
    flex: 1,
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    maxHeight: 120,
    padding: 0,
    margin: 0,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    ...NO_OUTLINE,
  },
  action: {
    width: 80,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  voiceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wave: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.surfaceInfoSoft,
    overflow: 'hidden',
  },
  bar: { width: 5, borderRadius: 3, backgroundColor: Colors.primary },
});
