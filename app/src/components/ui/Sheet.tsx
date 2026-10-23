import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Radius } from '@/constants/theme';

import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Нижняя шторка для выбора значения (Select, календарь). На вебе — колонка до 440. */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          {title ? (
            <Text variant="subtitle" style={styles.title}>
              {title}
            </Text>
          ) : null}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.scroll}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: Layout.maxWidth,
    maxHeight: '80%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl + 6,
    borderTopRightRadius: Radius.xl + 6,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 12 },
  title: { marginBottom: 8, paddingHorizontal: 8 },
  scroll: { flexGrow: 0 },
});
