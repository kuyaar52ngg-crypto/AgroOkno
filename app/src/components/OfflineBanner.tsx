import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';

import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateTime } from '@/constants/format';
import { Colors } from '@/constants/theme';
import { useSyncStatus } from '@/data';

/** Жёлтая плашка «Вы офлайн. Данные из кеша на …» (G2) с кнопкой «Повторить». */
export function OfflineBanner() {
  const sync = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const cachedAt = fmtDateTime(sync.last_synced_at);
  return (
    <View style={{ gap: 8 }}>
      <Alert tone="warning" title="Вы офлайн">
        {`Данные из кеша${cachedAt ? ` на ${cachedAt}` : ''}. Отправка отчетов недоступна. Новый локальный черновик можно сохранить.`}
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
