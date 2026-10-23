// Токены дизайн-системы «АгроОкно» (Figma, стр. «03 · Компоненты»). Только светлая тема.
import type { TextStyle, ViewStyle } from 'react-native';

export const Colors = {
  primary: '#1E3A8A',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textErrorReadable: '#991B1B',
  border: '#E2E8F0',
  surfaceInfo: '#EFF6FF',
  surfaceSuccess: '#F0FDF4',
  surfaceError: '#FEF2F2',
  surfaceWarning: '#FFFBEB',
  disabled: '#CBD5E1',
  // Производные цвета, использованные в макете
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#B8C9F1',
  primaryTrack: '#526BA5',
  successOnDark: '#7DE1A3',
  errorOnDark: '#FFF2F3',
  successReadable: '#166534',
  warningReadable: '#92400E',
  overlay: 'rgba(15, 23, 42, 0.45)',
  skeleton: '#E2E8F0',
  brandLogo: '#015BC0',
  textSecondaryReadable: '#475569',
  surfaceInfoSoft: '#EFF3FF',
  surfaceTabs: '#E8EDF4',
  successSoftBorder: '#BBF7D0',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  pill: 100,
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Shadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
};

export const Layout = {
  /** На вебе экран — центрированная колонка. */
  maxWidth: 440,
  screenPadding: 24,
  minTouch: 44,
  bottomNavHeight: 80,
  headerHeight: 72,
} as const;

export const FontFamily = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  display: 'Unbounded_600SemiBold',
} as const;

export type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'subtitle'
  | 'bodyLg'
  | 'body'
  | 'bodyMedium'
  | 'bodySemibold'
  | 'label'
  | 'small'
  | 'smallMedium'
  | 'caption'
  | 'number'
  | 'numberMd'
  | 'button';

/** Пресеты типографики (Unbounded SemiBold — заголовки, Onest — всё остальное). */
export const Typography: Record<TextVariant, TextStyle> = {
  h1: { fontFamily: FontFamily.display, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: FontFamily.display, fontSize: 23, lineHeight: 28 },
  h3: { fontFamily: FontFamily.display, fontSize: 20, lineHeight: 26 },
  title: { fontFamily: FontFamily.semibold, fontSize: 20, lineHeight: 24 },
  subtitle: { fontFamily: FontFamily.semibold, fontSize: 17, lineHeight: 21 },
  bodyLg: { fontFamily: FontFamily.regular, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: FontFamily.medium, fontSize: 15, lineHeight: 21 },
  bodySemibold: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: FontFamily.semibold, fontSize: 14, lineHeight: 18 },
  small: { fontFamily: FontFamily.regular, fontSize: 14, lineHeight: 20 },
  smallMedium: { fontFamily: FontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: FontFamily.semibold, fontSize: 32, lineHeight: 38 },
  numberMd: { fontFamily: FontFamily.semibold, fontSize: 24, lineHeight: 30 },
  button: { fontFamily: FontFamily.semibold, fontSize: 16, lineHeight: 20 },
};

/** Масштаб шрифтов для настройки «Размер текста: Крупный». */
export const FontScale = { standard: 1, large: 1.15 } as const;

export const IconSize = { sm: 16, md: 20, lg: 24 } as const;
