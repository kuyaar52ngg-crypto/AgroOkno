import { useLocalSearchParams, useRouter } from 'expo-router';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash';
import { StyleSheet, View } from 'react-native';

import { toNewEvent } from '@/components/event-form';
import { describeEntry, headsInGroup, productQuantityText } from '@/components/journal';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable, DestinationsCard } from '@/components/ui/Cards';
import type { DataRow } from '@/components/ui/Cards';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtDateLong, fmtHeads, fmtNum, fmtTime, monthName, plural } from '@/constants/format';
import {
  CROP_OPERATION_LABEL,
  FEED_LABEL,
  FEED_OPERATION_LABEL,
  MOVEMENT_LABEL,
  PRODUCT_LABEL,
  groupLabel,
  speciesOfGroup,
} from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { getEventDestinations, useAuth, useFarm, useHerd, useJournal, useJournalEntry } from '@/data';
import type { JournalEntry } from '@/data/contract';

function titleOf(entry: JournalEntry): string {
  switch (entry.type) {
    case 'livestock':
      return MOVEMENT_LABEL[entry.kind];
    case 'product_output':
      return entry.product === 'milk' ? 'Надой' : PRODUCT_LABEL[entry.product];
    case 'product_sale':
      return `Продажа: ${PRODUCT_LABEL[entry.product].toLowerCase()}`;
    case 'feed':
      return `${FEED_OPERATION_LABEL[entry.operation]} · ${FEED_LABEL[entry.feed].toLowerCase()}`;
    case 'crop':
      return entry.operation === 'harvest' ? 'Сбор урожая' : 'Посев';
  }
}

function groupCount(group: string, n: number): string {
  return group === 'cattle_cows' ? `${n} ${plural(n, ['корова', 'коровы', 'коров'])}` : fmtHeads(n);
}

/** B3 · Событие — детали. */
export default function JournalEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryQuery = useJournalEntry(id);
  const farm = useFarm();
  const auth = useAuth();
  const herd = useHerd();
  const entry = entryQuery.data;
  const month = entry ? Number(entry.occurred_on.slice(5, 7)) : 0;
  const year = entry ? Number(entry.occurred_on.slice(0, 4)) : 2026;
  const journal = useJournal({ year, month: month || 1 });

  const back = { label: 'Журнал учета', fallback: '/journal' } as const;

  if (!entryQuery.loading && !entry) {
    return (
      <Screen title="Запись не найдена" back={back}>
        <Alert tone="warning">Запись удалена или недоступна. Вернитесь в журнал и выберите другую.</Alert>
        <Button title="Открыть журнал" onPress={() => router.navigate('/journal')} />
      </Screen>
    );
  }

  const view = entry ? describeEntry(entry, herd.data) : null;
  const rows: DataRow[] = [];
  let heroLabel = 'Запись учтена';
  let heroValue = '';
  let heroNote = '';
  if (entry) {
    rows.push({ label: 'Дата', value: fmtDate(entry.occurred_on) });
    if (entry.type === 'product_output') {
      heroLabel = 'Общий надой за день';
      heroValue = productQuantityText(entry.product, entry.quantity);
      heroNote = `Учтен в ${MONTH_ADJECTIVE_PREPOSITIONAL[month - 1] ?? 'месячном'} итоге ${fmtNum(journal.data?.milk_l ?? 0)} л`;
      const heads = headsInGroup(herd.data, entry.source_group);
      if (entry.source_group) {
        rows.push({
          label: 'Группа животных',
          value: heads !== null ? groupCount(entry.source_group, heads) : groupLabel(entry.source_group),
        });
      }
    } else if (entry.type === 'livestock') {
      heroLabel = 'Количество';
      heroValue = fmtHeads(entry.heads);
      heroNote = `Поголовье изменится только по сохраненным событиям · ${monthName(month)} ${year}`;
      rows.push({ label: 'Вид животного', value: speciesOfGroup(entry.animal_group).label });
      rows.push({ label: 'Группа', value: groupLabel(entry.animal_group) });
      if (entry.live_weight_kg !== null) rows.push({ label: 'Живой вес', value: `${fmtNum(entry.live_weight_kg)} кг` });
      if (entry.amount_rub !== null) rows.push({ label: 'Сумма', value: `${fmtNum(entry.amount_rub)} ₽` });
      if (entry.counterparty) rows.push({ label: 'Контрагент', value: entry.counterparty });
    } else if (entry.type === 'product_sale') {
      heroLabel = 'Продано';
      heroValue = productQuantityText(entry.product, entry.quantity);
      heroNote = `Учтено в журнале за ${monthName(month).toLowerCase()} ${year}`;
      if (entry.buyer) rows.push({ label: 'Покупатель', value: entry.buyer });
      if (entry.amount_rub !== null) rows.push({ label: 'Сумма', value: `${fmtNum(entry.amount_rub)} ₽` });
    } else if (entry.type === 'feed') {
      heroLabel = FEED_OPERATION_LABEL[entry.operation];
      heroValue = `${fmtNum(entry.quantity_t, 1)} т`;
      heroNote = `${FEED_LABEL[entry.feed]} · учтено в журнале за ${monthName(month).toLowerCase()}`;
      rows.push({ label: 'Корм', value: FEED_LABEL[entry.feed] });
      if (entry.storage_place) rows.push({ label: 'Место хранения', value: entry.storage_place });
    } else {
      heroLabel = entry.operation === 'harvest' ? 'Урожай' : 'Площадь посева';
      heroValue = entry.operation === 'harvest' && entry.yield_t !== null ? `${fmtNum(entry.yield_t, 1)} т` : `${fmtNum(entry.area_ha, 2)} га`;
      heroNote = `${entry.crop} · ${CROP_OPERATION_LABEL[entry.operation].toLowerCase()}`;
      rows.push({ label: 'Поле / участок', value: entry.plot_name });
      rows.push({ label: 'Площадь', value: `${fmtNum(entry.area_ha, 2)} га` });
    }
    rows.push({ label: 'Внес', value: auth.profile?.full_name ?? 'Владелец хозяйства' });
    rows.push({ label: 'Время записи', value: fmtTime(entry.created_at) });
  }
  const destinations = entry ? getEventDestinations(toNewEvent(entry), farm.data ?? null).map((d) => d.label) : [];

  return (
    <Screen
      title={entry ? titleOf(entry) : 'Запись'}
      subtitle={entry ? `Запись журнала · ${fmtDateLong(entry.occurred_on)}` : undefined}
      back={back}
      loading={entryQuery.loading}
    >
      {entry && view ? (
        <>
          <View style={styles.hero}>
            <Text variant="caption" color={Colors.onPrimary}>
              {heroLabel}
            </Text>
            <Text variant="h1" color={Colors.onPrimary} style={styles.heroValue}>
              {heroValue}
            </Text>
            <Text variant="caption" color={Colors.onPrimary}>
              {heroNote}
            </Text>
          </View>
          <DataTable title="Данные события" rows={rows} />
          {entry.note ? (
            <View style={styles.note}>
              <Text variant="label" style={{ fontSize: 13 }}>
                Заметка
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {entry.note}
              </Text>
            </View>
          ) : null}
          {entry.pending_sync ? (
            <Alert tone="warning" title="Ожидает синхронизации">
              Запись сохранена на устройстве и отправится на сервер при появлении связи.
            </Alert>
          ) : null}
          <DestinationsCard items={destinations} />
          <View style={{ gap: 12 }}>
            <Button
              title="Редактировать"
              icon={Pencil}
              onPress={() => router.navigate({ pathname: '/add', params: { edit: entry.id, from: 'journal' } })}
            />
            <Button
              title="Удалить"
              icon={Trash2}
              variant="dangerOutline"
              onPress={() => router.push({ pathname: '/delete-event', params: { id: entry.id, type: entry.type } })}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const MONTH_ADJECTIVE_PREPOSITIONAL = [
  'январском',
  'февральском',
  'мартовском',
  'апрельском',
  'майском',
  'июньском',
  'июльском',
  'августовском',
  'сентябрьском',
  'октябрьском',
  'ноябрьском',
  'декабрьском',
];

const styles = StyleSheet.create({
  hero: { padding: 20, gap: 8, borderRadius: Radius.xl, backgroundColor: Colors.primary },
  heroValue: { fontFamily: 'Onest_600SemiBold', fontSize: 40, lineHeight: 48 },
  note: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
