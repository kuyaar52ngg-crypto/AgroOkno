import { useState } from 'react';
import { Pressable, View } from 'react-native';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';

import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateTime, plural } from '@/constants/format';
import { Colors } from '@/constants/theme';
import { useSyncStatus } from '@/data';

/** Текст офлайн-состояния: с какого момента кеш и сколько записей ждут отправки (G2). */
export function offlineText(lastSyncedAt: string | null, pending: number): string {
  const cachedAt = fmtDateTime(lastSyncedAt);
  const queue =
    pending > 0
      ? ` ${pending} ${plural(pending, ['запись сохранена', 'записи сохранены', 'записей сохранено'])} на телефоне и ${plural(pending, ['отправится', 'отправятся', 'отправятся'])} сама, когда появится связь.`
      : ' Новые записи сохранятся на телефоне и отправятся, когда появится связь.';
  return `Данные из кеша${cachedAt ? ` на ${cachedAt}` : ''}.${queue} Отправка отчетов недоступна.`;
}

/** Жёлтая плашка «Вы офлайн. Данные из кеша на …» (G2) с кнопкой «Повторить». */
export function OfflineBanner() {
  const sync = useSyncStatus();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Alert tone="warning" title="Вы офлайн">
        {offlineText(sync.last_synced_at, sync.pending_changes)}
      </Alert>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Повторить подключение"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await sync.retry();
          } finally {
            setBusy(false);
          }
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
      >
        <Icon icon={RefreshCw} size={16} color={Colors.primary} />
        <Text variant="smallMedium" color={Colors.primary}>
          {busy ? 'Проверяем связь…' : 'Повторить'}
        </Text>
      </Pressable>
    </View>
  );
}
