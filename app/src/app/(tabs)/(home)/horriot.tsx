import { useRouter } from 'expo-router';
import { ChevronRight, CircleCheck, ExternalLink, FileInput, FileOutput, PawPrint, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { SegmentedTabs } from '@/components/ui/Controls';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtDateOfTime, fmtHeads, fmtNum, fmtTime, plural, todayIso } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useHorriot, useHorriotConnect, useHorriotRefresh } from '@/data';
import type { HorriotReconciliationRow, HorriotRecord } from '@/data/contract';

type Filter = 'all' | 'registration' | 'disposal';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'registration', label: 'Регистрация' },
  { value: 'disposal', label: 'Выбытие' },
];

const STEPS = [
  '1. Перейдите на защищенную страницу провайдера.',
  '2. Войдите и проверьте запрашиваемый доступ.',
  '3. Подтвердите и вернитесь в АгроОкно.',
];

const PAGE = 20;

const RECORD_WORD: [string, string, string] = ['запись', 'записи', 'записей'];
const DIFF_WORD: [string, string, string] = ['расхождение', 'расхождения', 'расхождений'];

/** +5 / −2 / 0 (знак минус — типографский, как в fmtNum). */
function fmtDiff(diff: number): string {
  if (diff === 0) return '0';
  return diff > 0 ? `+${fmtNum(diff)}` : fmtNum(diff);
}

function reconciliationLabel(row: HorriotReconciliationRow): string {
  const base = `${row.label}: в книге ${row.book_heads}, в Хорриоте ${row.horriot_heads}`;
  return row.diff === 0 ? `${base}. Совпадает` : `${base}. Расхождение ${fmtDiff(row.diff)}`;
}

function recordLabel(record: HorriotRecord): string {
  const kind = record.kind === 'registration' ? 'Регистрация' : 'Выбытие';
  return `${record.number}. ${kind}. ${record.group_label}, ${fmtHeads(record.heads)}. ${record.reason}, ${fmtDate(record.registered_on)}. Учебная запись`;
}

function ReconciliationTable({ rows }: { rows: HorriotReconciliationRow[] }) {
  return (
    <View>
      <View style={styles.tableHead}>
        <Text variant="caption" color={Colors.textSecondaryReadable} style={styles.colLabel}>
          Группа
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} style={styles.colNum} align="right">
          Книга
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} style={styles.colNum} align="right">
          Хорриот
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} style={styles.colNum} align="right">
          Разн.
        </Text>
      </View>
      {rows.map((row, index) => {
        const mismatch = row.diff !== 0;
        return (
          <View
            key={row.animal_group}
            accessible
            accessibilityLabel={reconciliationLabel(row)}
            style={[styles.tableRow, index < rows.length - 1 && styles.tableBorder, mismatch && styles.tableRowMismatch]}
          >
            <Text variant="small" style={styles.colLabel} color={mismatch ? Colors.warningReadable : Colors.text}>
              {row.label}
            </Text>
            <Text variant="label" style={styles.colNum} align="right">
              {fmtNum(row.book_heads)}
            </Text>
            <Text variant="label" style={styles.colNum} align="right">
              {fmtNum(row.horriot_heads)}
            </Text>
            <Text variant="label" style={styles.colNum} align="right" color={mismatch ? Colors.warningReadable : Colors.textSecondaryReadable}>
              {fmtDiff(row.diff)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Учебный «Хорриот»: подключение, сверка с книгой ЛПХ, передача данных, записи. */
export default function HorriotScreen() {
  const router = useRouter();
  const horriot = useHorriot();
  const connect = useHorriotConnect();
  const refresh = useHorriotRefresh();
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = horriot.data;
  const connected = state?.connection.status === 'connected_demo';
  const syncedAt = state?.connection.synced_at ?? null;
  const rows = state?.reconciliation ?? [];
  const mismatches = rows.filter((r) => r.diff !== 0);
  const pending = state?.pending_count ?? 0;
  const records = [...(state?.records ?? [])]
    .filter((r) => filter === 'all' || r.kind === filter)
    .sort((a, b) => b.registered_on.localeCompare(a.registered_on) || b.number.localeCompare(a.number));
  const visible = records.slice(0, shown);

  const runConnect = async () => {
    setError(null);
    setNotice(null);
    try {
      await connect.run();
    } catch {
      setError('Не удалось подключить Хорриот. Повторите попытку позже.');
    }
  };
  const runRefresh = async () => {
    setError(null);
    setNotice(null);
    const count = pending;
    try {
      await refresh.run();
      setNotice(`Передано ${count} ${plural(count, RECORD_WORD)}. Сверка с книгой обновлена.`);
    } catch {
      setError('Не удалось передать данные в Хорриот. Повторите попытку позже.');
    }
  };
  const changeFilter = (value: Filter) => {
    setFilter(value);
    setShown(PAGE);
  };

  return (
    <Screen
      title="ВетИС Хорриот"
      subtitle={connected ? 'Записи · демонстрационное подключение' : 'Учет и идентификация животных'}
      back={{ label: 'Мое хозяйство', fallback: '/' }}
      loading={horriot.loading}
      fromCache={horriot.fromCache}
      onRefresh={horriot.refetch}
    >
      {!horriot.loading && !state ? (
        <>
          <Alert tone="error">Не удалось загрузить данные Хорриота. Проверьте подключение и повторите попытку.</Alert>
          <Button title="Повторить" variant="secondary" onPress={() => horriot.refetch()} />
        </>
      ) : null}

      {state && !connected ? (
        <>
          <View style={styles.card}>
            <View style={styles.topRow}>
              <Icon icon={PawPrint} size={28} color={Colors.primary} />
              <Badge tone="neutral" label="Не подключено" />
            </View>
            <Text variant="label">Учет животных в одном разделе</Text>
            <Text variant="small" color={Colors.textSecondaryReadable} style={{ lineHeight: 21 }}>
              «Хорриот» — компонент ФГИС ВетИС для учета и идентификации животных: регистрация поголовья, рождение, покупка и выбытие. После подключения АгроОкно сверит записи с похозяйственной книгой ЛПХ.
            </Text>
          </View>
          <View style={styles.card}>
            <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
              Как подключить
            </Text>
            {STEPS.map((step) => (
              <Text key={step} variant="small">
                {step}
              </Text>
            ))}
          </View>
          <Alert title="Учебный режим">
            Реальной связи с ФГИС ВетИС нет: записи «Хорриота» создаются в АгроОкно по журналу поголовья только для демонстрации. Не вводите пароль ВетИС и ключи API.
          </Alert>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button title="Подключить Хорриот" icon={ExternalLink} onPress={runConnect} loading={connect.pending} loadingTitle="Подключаем…" />
          <Pressable accessibilityRole="button" onPress={() => router.push('/profile/help')} style={styles.helpRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodySemibold">Помощь с подключением</Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Что подготовить и какие права проверить
              </Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={Colors.primary} />
          </Pressable>
          <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
            Демонстрационный сценарий интеграции. Реальное подключение в макете не выполняется.
          </Text>
        </>
      ) : null}

      {state && connected ? (
        <>
          <View style={styles.card}>
            <Badge tone="success" label="Подключено · демо" />
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {syncedAt ? `Синхронизация: ${fmtDateOfTime(syncedAt)} в ${fmtTime(syncedAt)}` : 'Синхронизация еще не выполнялась'}
            </Text>
          </View>

          <View style={styles.card}>
            <View style={{ gap: 4 }}>
              <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }} accessibilityRole="header">
                Сверка с похозяйственной книгой
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {`Поголовье на ${fmtDate(todayIso())}: книга ЛПХ и записи Хорриота`}
              </Text>
            </View>
            {rows.length === 0 ? (
              <Text variant="small" color={Colors.textSecondaryReadable}>
                Поголовья в книге и записей в Хорриоте пока нет — сверять нечего.
              </Text>
            ) : (
              <ReconciliationTable rows={rows} />
            )}
            {rows.length > 0 && mismatches.length === 0 ? (
              <View style={styles.okRow}>
                <Icon icon={CircleCheck} size={20} color={Colors.success} />
                <Text variant="label" color={Colors.successReadable}>
                  Всё совпадает
                </Text>
              </View>
            ) : null}
            {mismatches.length > 0 ? (
              <Alert tone="warning" title={`${mismatches.length} ${plural(mismatches.length, DIFF_WORD)}`}>
                {pending > 0
                  ? 'В книге есть движения скота, которых еще нет в Хорриоте. Передайте данные — сверка обновится.'
                  : 'Данные книги и Хорриота расходятся. Проверьте журнал учета поголовья.'}
              </Alert>
            ) : null}
            {rows.length > 0 ? (
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                Разница: книга минус Хорриот.
              </Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={{ gap: 4 }}>
              <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }} color={pending > 0 ? Colors.warningReadable : Colors.text}>
                {`Не передано записей: ${pending}`}
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {pending > 0
                  ? 'Движения скота из журнала, которых еще нет в Хорриоте.'
                  : 'Все движения скота из журнала уже есть в Хорриоте.'}
              </Text>
            </View>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {notice ? <Alert tone="success">{notice}</Alert> : null}
            <Button
              title="Передать данные"
              icon={Upload}
              onPress={runRefresh}
              loading={refresh.pending}
              loadingTitle="Передаем…"
              disabled={pending === 0}
            />
          </View>

          <View style={{ gap: 12 }}>
            <Text variant="title" accessibilityRole="header">
              Записи Хорриота
            </Text>
            <SegmentedTabs options={FILTERS} value={filter} onChange={changeFilter} />
            {visible.map((record) => (
              <View key={record.id} accessible accessibilityLabel={recordLabel(record)} style={styles.record}>
                <Icon icon={record.kind === 'registration' ? FileInput : FileOutput} size={24} color={Colors.primary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.recordHead}>
                    <Text variant="bodySemibold" style={{ flexShrink: 1 }}>
                      {record.number}
                    </Text>
                    <Tag label={record.kind === 'registration' ? 'Регистрация' : 'Выбытие'} tone={record.kind === 'registration' ? 'success' : 'warning'} />
                  </View>
                  <Text variant="small">{`${record.group_label} · ${fmtHeads(record.heads)}`}</Text>
                  <Text variant="caption" color={Colors.textSecondaryReadable}>
                    {`${record.reason} · ${fmtDate(record.registered_on)} · учебная запись`}
                  </Text>
                </View>
              </View>
            ))}
            {records.length === 0 ? (
              <Text variant="small" color={Colors.textSecondaryReadable} align="center">
                {state.records.length === 0 ? 'Записей пока нет. Нажмите «Передать данные».' : 'Записей с таким типом нет. Измените фильтр.'}
              </Text>
            ) : null}
            {records.length > visible.length ? (
              <Button
                title={`Показать еще (${records.length - visible.length})`}
                variant="secondary"
                compact
                onPress={() => setShown((n) => n + PAGE)}
              />
            ) : null}
          </View>

          <Alert>Учебные записи Хорриота и время синхронизации. Они иллюстрируют интерфейс, а не реальные операции во ФГИС ВетИС.</Alert>
        </>
      ) : null}
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
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  helpRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
  },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  tableRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  tableBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableRowMismatch: { backgroundColor: Colors.surfaceWarning, borderRadius: Radius.sm },
  colLabel: { flex: 1 },
  colNum: { width: 56 },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  record: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
