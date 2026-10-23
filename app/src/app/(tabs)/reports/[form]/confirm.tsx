import { useLocalSearchParams, useRouter } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isFormCode, periodText, shortName, useObligation } from '@/components/reports';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Cards';
import { CheckBox } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { daysBetween, daysWord, fmtDate, headsWord, todayIso } from '@/constants/format';
import { AUTHORITY_LABEL } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useFarm, useHorseHerd, useSubmitReport, useSyncStatus } from '@/data';

/** C6 · Подтверждение отправки: отчёт уходит только после чекбокса «Данные проверены». */
export default function ReportConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ form: string; year?: string }>();
  const form = isFormCode(params.form) ? params.form : '1-tabun';
  const sync = useSyncStatus();
  const farm = useFarm();
  const submit = useSubmitReport();
  const { obligation, period, reports } = useObligation(form, params.year ? Number(params.year) : undefined);
  const horse = useHorseHerd({ year: period.year, month: period.month ?? Number(todayIso().slice(5, 7)) });
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = shortName(form);
  const overdueDays = obligation?.status === 'overdue' ? Math.max(daysBetween(obligation.due_on, todayIso()), 0) : 0;

  const confirmText =
    form === '1-tabun' && horse.data
      ? `Подтверждаю состав табуна: ${horse.data.mares} кобыл, ${horse.data.young} молодых лошадей и ${horse.data.stallions} жеребца. Всего ${horse.data.total} ${headsWord(horse.data.total)}.`
      : `Подтверждаю состав и показатели формы ${name} за ${periodText(period).toLowerCase()}.`;

  const send = async () => {
    setError(null);
    try {
      const result = await submit.run({ form, period });
      if (result.ok) {
        router.replace({
          pathname: '/reports/[form]/sent',
          params: { form, receipt: result.receipt.receipt_no, at: result.receipt.submitted_at, recipient: result.receipt.recipient },
        });
      } else {
        router.replace({ pathname: '/reports/[form]/failed', params: { form, message: result.message } });
      }
    } catch {
      router.replace({ pathname: '/reports/[form]/failed', params: { form } });
    }
  };

  return (
    <Screen
      title="Подтверждение отправки"
      subtitle="Последний шаг перед отправкой отчета"
      back={{ label: `К проверке ${name}`, fallback: { pathname: '/reports/[form]', params: { form } } }}
      loading={reports.loading}
    >
      <DataTable
        title="Проверьте получателя"
        rows={[
          { label: 'Получатель', value: obligation ? AUTHORITY_LABEL[obligation.authority] : '—' },
          { label: 'Форма', value: name },
          { label: 'Период', value: periodText(period) },
          { label: 'Хозяйство', value: farm.data?.name ?? '—' },
          { label: 'На дату', value: fmtDate(todayIso()) },
        ]}
      />
      {overdueDays > 0 && obligation ? (
        <Alert tone="error" title="Срок уже прошел">
          {`Срок сдачи — ${fmtDate(obligation.due_on)}. Просрочка ${overdueDays} ${daysWord(overdueDays)}. До отправки отчет остается в статусе «Просрочен».`}
        </Alert>
      ) : null}
      <View style={styles.confirm}>
        <CheckBox checked={checked} onChange={setChecked} label="Данные проверены" />
        <Text variant="caption" color={Colors.textSecondaryReadable}>
          {confirmText}
        </Text>
      </View>
      {!sync.online ? <Alert tone="warning">Отправка недоступна без подключения. Данные и черновик сохранены на устройстве.</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button
          title="Отправить отчет"
          icon={Send}
          disabled={!checked || !sync.online}
          onPress={send}
          loading={submit.pending}
          loadingTitle="Отправляем…"
        />
        <Button title="Вернуться к проверке" variant="secondary" onPress={() => router.back()} />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          Демонстрационный сценарий. Реальная отправка не выполняется.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
