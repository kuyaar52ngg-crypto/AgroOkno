import type { LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

import { Colors } from '@/constants/theme';

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

/** Иконки макета — outline 1.5px в стиле Lucide. */
export function Icon({ icon: Glyph, size = 24, color = Colors.text, strokeWidth = 1.5 }: IconProps) {
  return <Glyph size={size} color={color as string} strokeWidth={strokeWidth} />;
}
