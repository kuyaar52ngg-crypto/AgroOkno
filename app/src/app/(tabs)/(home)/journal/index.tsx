import { useRouter } from 'expo-router';
import BookOpen from 'lucide-react-native/icons/book-open';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import Info from 'lucide-react-native/icons/info';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { describeEntry } from '@/components/journal';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { EventRow } from '@/components/ui/Cards';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { fmtHeads, fmtNum, monthName, todayIso } from '@/constants/format';
import { EVENT_TYPE_LABEL } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useFarm, useHerd, useJournal } from '@/data';
import type { EventType } from '@/data/contract';

const ALL = 'all';

function monthOptions(): { value: string; label: string }[] {
  const today = todayIso();
  const base = Number(today.slice(0, 4)) * 12 + (Number(today.slice(5, 7)) - 1);
  const list: { value: string; label: string }[] = [];
  for (let offset = 1; offset >= -11; offset -= 1) {
    const total = base + offset;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    list.push({ value: `${year}-${month}`, label: `${monthName(month)} ${year}` });
  }
  return list;
}

/** B1 · Журнал учета, B2 · Журнал — пока нет событий. */
export default function JournalScreen() {
  const router = useRouter();
  const farm = useFarm();
  const today = todayIso();
  const currentValue = `${Number(today.slice(0, 4))}-${Number(today.slice(5, 7))}`;
  const [period, setPeriod] = useState(currentValue);
  const [type, setType] = useState<string>(ALL);
  const [year, month] = period.split('-').map(Number);
  const journal = useJournal({ year, month, type: type === ALL ? undefined : (type as EventType) });
  // Итог текущего месяца нужен для подсказки в пустом периоде (B2).
  const current = useJournal({ year: Number(currentValue.split('-')[0]), month: Number(currentValue.split('-')[1]) });
  const herd = useHerd();
  const options = monthOptions();
  const isCurrent = period === currentValue;
  const entries = journal.data?.entries ?? [];
  const empty = !journal.loading && entries.length === 0;
  const monthLabel = monthName(month);
  const currentMonthLabel = monthName(Number(currentValue.split('-')[1])).toLowerCase();

  const addEvent = () => router.navigate({ pathname: '/add', params: { from: 'journal' } });
  const typeOptions = [{ value: ALL, label: 'Все типы' }, ...(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] }))];

  return (
    <Screen
      title="Журнал учета"
      subtitle={`${farm.data?.name ?? 'Хозяйство'} · события хозяйства`}
      back={{ label: 'Мое хозяйство', fallback: '/' }}
      fromCache={journal.fromCache}
      onRefresh={journal.refetch}
    >
      {!empty && journal.data && type === ALL ? (
        <Alert title={`${monthLabel}: надой ${fmtNum(journal.data.milk_l)} л · ${fmtHeads(journal.data.total_heads)}`}>
          Записи ниже уже включены в сводку. Поголовье не прибавляется повторно.
        </Alert>
      ) : null}

      {empty ? (
        <View style={{ gap: 20 }}>
          <Select label="Период" value={period} options={options} onChange={setPeriod} />
          <Select label="Тип события" value={type} options={typeOptions} onChange={setType} />
        </View>
      ) : (
        <View style={styles.filters}>
          <View style={{ flex: 11 }}>
            <Select label={undefined} value={period} options={options} onChange={setPeriod} sheetTitle="Период" />
          </View>
          <View style={{ flex: 9 }}>
            <Select value={type} options={typeOptions} onChange={setType} sheetTitle="Тип события" />
          </View>
        </View>
      )}

      {journal.loading ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={64} radius={16} />
          ))}
        </View>
      ) : null}

      {!journal.loading && entries.length > 0 ? (
        <View style={{ gap: 12 }}>
          {entries.map((entry) => {
            const view = describeEntry(entry, herd.data);
            return (
              <EventRow
                key={entry.id}
                icon={view.icon}
                title={view.title}
                meta={view.meta}
                value={view.value}
                pendingSync={entry.pending_sync}
                onPress={() => router.push({ pathname: '/journal/[id]', params: { id: entry.id } })}
              />
            );
          })}
        </View>
      ) : null}

      {empty ? (
        <>
          <View style={styles.empty}>
            <Icon icon={BookOpen} size={28} color={Colors.textSecondary} />
            <Text variant="bodyLg" align="center" style={{ fontFamily: 'Onest_600SemiBold' }}>
              {type !== ALL ? 'Нет событий выбранного типа' : isCurrent ? 'Пока нет событий' : `В ${monthNameLoc(month)} пока нет событий`}
            </Text>
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              {isCurrent
                ? 'Добавьте первую запись, когда произойдет событие хозяйства.'
                : 'Вы выбрали новый период. Добавьте первую запись, когда произойдет событие хозяйства.'}
            </Text>
          </View>
          <Button title="Добавить событие" icon={CirclePlus} onPress={addEvent} />
          {!isCurrent ? <Button title={`Вернуться к ${monthNameDative(currentValue)}`} variant="secondary" onPress={() => setPeriod(currentValue)} /> : null}
          {current.data && !isCurrent ? (
            <Alert icon={Info}>
              {`Учет за ${currentMonthLabel.replace(/ь$/, 'ь')} сохранен: ${fmtHeads(current.data.total_heads)} и ${fmtNum(current.data.milk_l)} л надоя. Пуст только выбранный период.`}
            </Alert>
          ) : null}
        </>
      ) : (
        !journal.loading && (
          <View style={{ gap: 12 }}>
            <Button title="Добавить событие" icon={CirclePlus} onPress={addEvent} />
            <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
              Демонстрационные записи журнала · итоги не дублируются.
            </Text>
          </View>
        )
      )}
      <View />
    </Screen>
  );
}

const PREPOSITIONAL: Record<number, string> = {
  1: 'январе',
  2: 'феврале',
  3: 'марте',
  4: 'апреле',
  5: 'мае',
  6: 'июне',
  7: 'июле',
  8: 'августе',
  9: 'сентябре',
  10: 'октябре',
  11: 'ноябре',
  12: 'декабре',
};
const DATIVE: Record<number, string> = {
  1: 'январю',
  2: 'февралю',
  3: 'марту',
  4: 'апрелю',
  5: 'маю',
  6: 'июню',
  7: 'июлю',
  8: 'августу',
  9: 'сентябрю',
  10: 'октябрю',
  11: 'ноябрю',
  12: 'декабрю',
};

function monthNameLoc(month: number): string {
  return PREPOSITIONAL[month] ?? '';
}

function monthNameDative(value: string): string {
  return DATIVE[Number(value.split('-')[1])] ?? '';
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  empty: {
    padding: 24,
    gap: 12,
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
