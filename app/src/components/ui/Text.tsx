import { createContext, useContext } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import type { ColorValue, TextProps as RNTextProps, TextStyle } from 'react-native';

import { Colors, Typography } from '@/constants/theme';
import type { TextVariant } from '@/constants/theme';

const FontScaleContext = createContext(1);

export const FontScaleProvider = FontScaleContext.Provider;

export function useFontScale(): number {
  return useContext(FontScaleContext);
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorValue;
  align?: TextStyle['textAlign'];
}

/** Базовый текст дизайн-системы: пресет типографики + масштаб «Размер текста» из настроек. */
export function Text({ variant = 'body', color = Colors.text, align, style, ...rest }: TextProps) {
  const scale = useFontScale();
  const base = Typography[variant];
  const scaled: TextStyle =
    scale === 1
      ? {}
      : {
          fontSize: (base.fontSize ?? 15) * scale,
          lineHeight: (base.lineHeight ?? 20) * scale,
        };
  return <RNText {...rest} style={[base, { color }, scaled, align ? { textAlign: align } : null, StyleSheet.flatten(style)]} />;
}
