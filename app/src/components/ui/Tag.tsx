import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

import { Text } from './Text';

export type TagTone = 'info' | 'warning' | 'error' | 'success';

const palette: Record<TagTone, { bg: string; text: string }> = {
  info: { bg: Colors.surfaceInfoSoft, text: Colors.primary },
  warning: { bg: Colors.surfaceWarning, text: Colors.warningReadable },
  error: { bg: Colors.surfaceError, text: Colors.textErrorReadable },
  success: { bg: Colors.surfaceSuccess, text: Colors.successReadable },
};

/** Компактная метка-«пилюля» без значка («ЛПХ», «Ожидает подтверждения», «Черновик»). */
export function Tag({ label, tone = 'info' }: { label: string; tone?: TagTone }) {
  const colors = palette[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }]} accessibilityLabel={label}>
      <Text variant="caption" color={colors.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
});
