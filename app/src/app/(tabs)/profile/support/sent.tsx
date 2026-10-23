import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Cards';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateOfTime } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';

/** H3 · Обращение принято. */
export default function SupportSentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ number?: string; topic?: string; section?: string; at?: string }>();

  return (
    <Screen
      title="Обращение принято"
      subtitle="Учебное последующее состояние"
      back={{ label: 'Помощь', fallback: '/profile/help' }}
    >
      <View style={styles.result}>
        <View style={styles.circle}>
          <Icon icon={CircleCheck} size={28} color={Colors.success} />
        </View>
        <Text variant="subtitle">{params.number ?? 'AGRO-2026-0142'}</Text>
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          Учебный номер обращения
        </Text>
      </View>
      <DataTable
        title="Сведения об обращении"
        showHeader={false}
        rows={[
          { label: 'Тема', value: params.topic ?? '—' },
          ...(params.section ? [{ label: 'Раздел', value: params.section.replace(/^.*· /, '') }] : []),
          { label: 'Дата', value: fmtDateOfTime(params.at) },
        ]}
      />
      <Alert title="Ответ появится в разделе помощи">Откройте помощь, чтобы посмотреть ответ по обращению.</Alert>
      <View style={{ gap: 12 }}>
        <Button title="К помощи" onPress={() => router.navigate('/profile/help')} />
        <Button title="В профиль" variant="secondary" onPress={() => router.navigate('/profile')} />
      </View>
      <Alert title="Демонстрационный результат">Это макет принятого обращения, не подтверждение реальной отправки.</Alert>
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: {
    padding: 24,
    gap: 8,
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
});
