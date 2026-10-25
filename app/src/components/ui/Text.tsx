import { createContext, useContext } from 'react';
import { PixelRatio, StyleSheet, Text as RNText } from 'react-native';
import type { ColorValue, TextProps as RNTextProps, TextStyle } from 'react-native';

import { Colors, Typography } from '@/constants/theme';

import './webFocus';
import type { TextVariant } from '@/constants/theme';

const FontScaleContext = createContext(1);

export const FontScaleProvider = FontScaleContext.Provider;

export function useFontScale(): number {
  return useContext(FontScaleContext);
}

/** Итоговый масштаб текста: «Размер текста» из настроек × системный масштаб шрифта (для расчёта ширин колонок). */
export function useTextScale(): number {
  return useFontScale() * PixelRatio.getFontScale();
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorValue;
  align?: TextStyle['textAlign'];
}

/**
 * Базовый текст дизайн-системы: пресет типографики + масштаб «Размер текста» из настроек.
 * fontSize/lineHeight из style тоже умножаются на масштаб, поэтому точечные размеры не ломают крупный текст.
 */
export function Text({ variant = 'body', color = Colors.text, align, style, ...rest }: TextProps) {
  const scale = useFontScale();
  const base = Typography[variant];
  // Заголовки шрифтом Unbounded широкие: системный масштаб ограничиваем, чтобы слова не рвались посреди слова.
  const maxMultiplier = rest.maxFontSizeMultiplier ?? (variant === 'h1' || variant === 'h2' || variant === 'h3' ? 1.15 : undefined);
  const flat = StyleSheet.flatten(style) ?? {};
  const scaled: TextStyle =
    scale === 1
      ? {}
      : {
          fontSize: (flat.fontSize ?? base.fontSize ?? 15) * scale,
          lineHeight: (flat.lineHeight ?? base.lineHeight ?? 20) * scale,
        };
  return <RNText {...rest} maxFontSizeMultiplier={maxMultiplier} style={[base, { color }, align ? { textAlign: align } : null, flat, scaled]} />;
}
