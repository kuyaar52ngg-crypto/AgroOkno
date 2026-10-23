import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { Colors, Radius } from '@/constants/theme';
import { useMyJoinRequest } from '@/data';

/** R8 · Запрос отправлен */
export default function JoinSentScreen() {
  const router = useRouter();
  const request = useMyJoinRequest();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const data = request.data;

  const check = async () => {
    setChecking(true);
    try {
      await request.refetch();
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen
      header="brand"
      back={{ label: 'Ваше хозяйство', fallback: '/choose-farm' }}
      title="Запрос отправлен"
      subtitle="Теперь запрос должен подтвердить владелец или уполномоченный специалист."
      loading={request.loading}
      safeBottom
    >
      {data ? (
        <View style={styles.card}>
          <Tag label={data.status === 'rejected' ? 'Запрос отклонен' : data.status === 'approved' ? 'Запрос одобрен' : 'Ожидает подтверждения'} tone={data.status === 'rejected' ? 'error' : data.status === 'approved' ? 'success' : 'warning'} />
          <View style={{ gap: 2 }}>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Хозяйство
            </Text>
            <Text variant="bodySemibold">{`${data.farm_name}${data.settlement ? ` · ${data.settlement}` : ''}`}</Text>
          </View>
          {data.contact ? (
            <View style={{ gap: 2 }}>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Контакт заявителя
              </Text>
              <Text variant="bodySemibold">{data.contact}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Alert>Учетные данные хозяйства пока недоступны. Они откроются после одобрения запроса.</Alert>
      {checked && data?.status === 'pending' ? <Alert tone="warning">Запрос пока не подтвержден. Загляните сюда позже.</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Проверить статус" onPress={check} loading={checking} loadingTitle="Проверяем…" />
        <Button title="Выбрать другое хозяйство" variant="secondary" onPress={() => router.push('/join-farm')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
