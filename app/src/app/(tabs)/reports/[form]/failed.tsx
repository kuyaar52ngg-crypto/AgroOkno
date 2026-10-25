import { useLocalSearchParams, useRouter } from 'expo-router';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isFormCode, obligationMeta, periodText, shortName, useObligation } from '@/components/reports';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { daysBetween, daysWord, fmtDate, todayIso } from '@/constants/format';
import { AUTHORITY_LABEL } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { useFarm, useSubmitReport, useSyncStatus } from '@/data';

/** C8 · Не удалось отправить. «Повторить» повторяет отправку. */
export default function ReportFailedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ form: string; message?: string }>();
  const form = isFormCode(params.form) ? params.form : '1-tabun';
  const sync = useSyncStatus();
  const farm = useFarm();
  const submit = useSubmitReport();
  const { obligation, period } = useObligation(form);
  const [message, setMessage] = useState<string | null>(params.message ?? null);
  const name = shortName(form);
  const overdueDays = obligation ? Math.max(daysBetween(obligation.due_on, todayIso()), 0) : 0;

  const retry = async () => {
    setMessage(null);
    try {
      const result = await submit.run({ form, period });
      if (result.ok) {
        router.replace({
          pathname: '/reports/[form]/sent',
          params: { form, receipt: result.receipt.receipt_no, at: result.receipt.submitted_at, recipient: result.receipt.recipient },
        });
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage('Нет ответа от сервиса. Проверьте подключение к интернету и попробуйте еще раз.');
    }
  };

  return (
    <Screen
      title="Не удалось отправить"
      subtitle={`${name} · ошибка связи`}
      back={{ label: `К отчету ${name}`, fallback: { pathname: '/reports/[form]', params: { form } } }}
    >
      <View style={styles.result} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Icon icon={WifiOff} size={32} color={Colors.error} />
        <Text variant="bodyLg" align="center" style={{ fontFamily: 'Onest_600SemiBold' }}>
          Нет ответа от сервиса
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          {message?.replace(/^Нет ответа от сервиса\.\s*/, '') || 'Проверьте подключение к интернету и попробуйте еще раз.'}
        </Text>
      </View>
      {obligation ? (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
              {name}
            </Text>
            <Badge tone={obligation.status === 'overdue' ? 'overdue' : 'draft'} label={obligation.status === 'overdue' ? 'Просрочен' : 'Не отправлен'} />
          </View>
          <Text variant="small">{`${periodText(period)} · ${AUTHORITY_LABEL[obligation.authority]}`}</Text>
          <Text variant="caption" color={obligation.status === 'overdue' ? Colors.textErrorReadable : Colors.textSecondaryReadable}>
            {obligation.status === 'overdue'
              ? `Срок ${fmtDate(obligation.due_on)} · просрочка ${overdueDays} ${daysWord(overdueDays)}`
              : obligationMeta(obligation)}
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {[farm.data?.name, farm.data?.settlement].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}
      <Alert title="Данные и черновик сохранены">
        Отправка не подтверждена, квитанции нет. Сведения хозяйства не потеряны. Отметка о сдаче не установлена.
      </Alert>
      <View style={{ gap: 12 }}>
        <Button title="Повторить" icon={RefreshCw} onPress={retry} loading={submit.pending} loadingTitle="Отправляем…" disabled={!sync.online} />
        {!sync.online ? (
          <Text variant="caption" color={Colors.warningReadable} align="center">
            Нет подключения. Повторить можно, когда появится связь.
          </Text>
        ) : null}
        <Button title="К отчету" variant="secondary" onPress={() => router.navigate({ pathname: '/reports/[form]', params: { form } })} />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          Демонстрационное состояние ошибки связи
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: {
    padding: 24,
    gap: 12,
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  card: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
