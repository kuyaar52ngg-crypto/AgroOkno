import { useLocalSearchParams, useRouter } from 'expo-router';
import Trash2 from 'lucide-react-native/icons/trash';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { describeEntry } from '@/components/journal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtHeads } from '@/constants/format';
import { Colors, Layout, Radius, Shadow } from '@/constants/theme';
import { useDeleteEvent, useHerd, useJournalEntry } from '@/data';
import type { EventType, JournalEntry } from '@/data/contract';

function impact(entry: JournalEntry): { what: string; without: string } {
  switch (entry.type) {
    case 'product_output': {
      const view = describeEntry(entry);
      return { what: 'Итоги надоя', without: `этих ${view.value ?? ''}`.trim() };
    }
    case 'livestock':
      return { what: 'Поголовье', without: `этих ${fmtHeads(entry.heads)}` };
    case 'feed':
      return { what: 'Итоги заготовки кормов', without: 'этой записи' };
    case 'crop':
      return { what: 'Итоги растениеводства', without: 'этой записи' };
    case 'product_sale':
      return { what: 'Итоги продаж', without: 'этой записи' };
  }
}

/** H2 · Подтверждение удаления (модалка). Удаление — только через этот экран. */
export default function DeleteEventModal() {
  const router = useRouter();
  const { id, type } = useLocalSearchParams<{ id: string; type: EventType }>();
  const entry = useJournalEntry(id);
  const herd = useHerd();
  const remove = useDeleteEvent();
  const [error, setError] = useState<string | null>(null);
  // После удаления запись исчезает из хранилища — держим снимок, чтобы модалка не мигала.
  const [snapshot, setSnapshot] = useState<JournalEntry | null>(null);
  if (entry.data && entry.data !== snapshot) setSnapshot(entry.data);
  const data = entry.data ?? snapshot;
  const view = data ? describeEntry(data, herd.data) : null;
  const info = data ? impact(data) : null;

  const close = () => router.back();

  const confirm = async () => {
    setError(null);
    try {
      await remove.run({ id, type });
      router.back();
      router.navigate('/journal');
    } catch {
      setError('Не удалось удалить событие. Запись осталась в журнале — повторите попытку.');
    }
  };

  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="Закрыть без удаления" style={StyleSheet.absoluteFill} onPress={close} />
      {/* При крупном шрифте карточка не помещается в экран — даём ей прокрутку. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
        <View style={styles.iconBox}>
          <Icon icon={Trash2} size={24} color={Colors.error} />
        </View>
        <Text variant="h2" accessibilityRole="header">
          Удалить событие?
        </Text>
        {view && data ? (
          <View style={styles.item}>
            <Icon icon={view.icon} size={24} color={Colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ fontSize: 13 }}>
                {`${view.title}${view.value ? ` · ${view.value}` : ''} · ${fmtDate(data.occurred_on)}`}
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Запись журнала учета
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ gap: 12 }}>
          <Text variant="small">
            {info
              ? `Запись будет удалена из учета. ${info.what} и связанные черновики отчетов будут пересчитаны без ${info.without}.`
              : 'Запись будет удалена из учета. Итоги и связанные черновики отчетов будут пересчитаны.'}
          </Text>
          <Text variant="label">Уже отправленные отчеты не изменяются.</Text>
          <Text variant="small" color={Colors.textSecondaryReadable}>
            Удаление нельзя отменить.
          </Text>
        </View>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <View style={{ gap: 12 }}>
          <Button title="Отмена" variant="secondary" onPress={close} compact />
          <Button title="Удалить событие" variant="danger" onPress={confirm} loading={remove.pending} loadingTitle="Удаляем…" compact />
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.overlay },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: Layout.maxWidth - 32,
    padding: 24,
    gap: 16,
    borderRadius: Radius.xl + 6,
    backgroundColor: Colors.surface,
    ...Shadow,
  },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceError, alignItems: 'center', justifyContent: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
