import { useLocalSearchParams, useRouter } from 'expo-router';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { StyleSheet, View } from 'react-native';

import { describeEntry } from '@/components/journal';
import { toNewEvent } from '@/components/event-form';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DestinationsCard } from '@/components/ui/Cards';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtHeads } from '@/constants/format';
import { MOVEMENT_LABEL, speciesOfGroup } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { getEventDestinations, useFarm, useHerd, useJournalEntry } from '@/data';

/** H1 · Событие сохранено */
export default function EventSavedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const entry = useJournalEntry(id ?? '');
  const farm = useFarm();
  const herd = useHerd();
  const data = entry.data;
  const view = data ? describeEntry(data, herd.data) : null;
  const title = !data
    ? ''
    : data.type === 'livestock'
      ? `${MOVEMENT_LABEL[data.kind]} · ${speciesOfGroup(data.animal_group).label} · ${fmtHeads(data.heads)}`
      : `${view?.title}${view?.value ? ` · ${view.value}` : ''}`;
  const destinations = data ? getEventDestinations(toNewEvent(data), farm.data ?? null).map((d) => d.label) : [];

  return (
    <Screen
      title="Событие сохранено"
      subtitle={`${farm.data?.name ?? 'Хозяйство'} · результат сохранения`}
      back={{ label: 'Новое событие', fallback: '/add' }}
      loading={entry.loading}
    >
      {data && view ? (
        <>
          <View style={styles.result}>
            <View style={styles.checkCircle}>
              <Icon icon={CircleCheck} size={28} color={Colors.success} />
            </View>
            <View style={styles.summary}>
              <Icon icon={view.icon} size={24} color={Colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontSize: 13 }}>
                  {title}
                </Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {fmtDate(data.occurred_on)}
                </Text>
              </View>
            </View>
          </View>
          <Alert tone="success" title="Запись добавлена в учет.">
            Отчеты не отправлялись.
          </Alert>
          {data.pending_sync ? (
            <Alert tone="warning" title="Сохранено на устройстве">
              Событие отправится на сервер, когда появится связь.
            </Alert>
          ) : null}
          <DestinationsCard variant="plain" items={destinations} note="Отправка отчетов — только после вашей проверки и подтверждения." />
          <View style={{ gap: 12 }}>
            <Button title="Открыть журнал" onPress={() => router.navigate('/journal')} />
            <Button title="Добавить еще событие" variant="secondary" onPress={() => router.navigate('/add')} />
          </View>
        </>
      ) : (
        <>
          <Alert tone="warning">Запись не найдена. Возможно, она была удалена.</Alert>
          <Button title="Открыть журнал" onPress={() => router.navigate('/journal')} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: {
    padding: 16,
    gap: 16,
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
