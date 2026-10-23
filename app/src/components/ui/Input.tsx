import { forwardRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CircleAlert, Eye, EyeOff } from 'lucide-react-native';

import { Colors, FontFamily } from '@/constants/theme';

import { Icon } from './Icon';
import { Text, useFontScale } from './Text';

export interface InputProps
  extends Pick<
    TextInputProps,
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'keyboardType'
    | 'autoCapitalize'
    | 'autoComplete'
    | 'autoCorrect'
    | 'maxLength'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'multiline'
    | 'textContentType'
    | 'inputMode'
  > {
  label?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  /** Поле пароля с кнопкой «показать / скрыть». */
  secure?: boolean;
  /** Иконка справа (например, календарь, капля молока). */
  trailingIcon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  minHeight?: number;
  onBlur?: () => void;
  testID?: string;
}

export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input(
  { label, hint, error, disabled = false, secure = false, trailingIcon, style, multiline, minHeight, onBlur, testID, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const scale = useFontScale();
  const hasError = Boolean(error);
  const borderColor = hasError ? Colors.error : focused ? Colors.primary : Colors.border;
  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text variant="label" color={disabled ? Colors.textSecondary : Colors.text}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused || hasError ? 1.5 : 1,
            backgroundColor: disabled ? Colors.border : Colors.surface,
            minHeight: minHeight ?? 52,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        <TextInput
          {...rest}
          ref={ref}
          testID={testID}
          multiline={multiline}
          editable={!disabled}
          secureTextEntry={secure && hidden}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={Colors.textSecondary}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            styles.input,
            { fontSize: 15 * scale, color: disabled ? Colors.textSecondary : Colors.text },
            multiline ? styles.multiline : null,
          ]}
        />
        {hasError ? <Icon icon={CircleAlert} size={18} color={Colors.error} /> : null}
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Показать пароль' : 'Скрыть пароль'}
            hitSlop={12}
            onPress={() => setHidden((h) => !h)}
            style={styles.trailing}
          >
            <Icon icon={hidden ? Eye : EyeOff} size={20} color={Colors.primary} />
          </Pressable>
        ) : trailingIcon && !hasError ? (
          <View style={styles.trailing}>
            <Icon icon={trailingIcon} size={20} color={Colors.primary} />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={Colors.textErrorReadable} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

// На вебе у inner <input> убираем системную обводку фокуса: фокус показывает рамка поля.
const NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  field: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    padding: 0,
    margin: 0,
    ...NO_OUTLINE,
    minHeight: 24,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  trailing: { alignItems: 'center', justifyContent: 'center' },
});
