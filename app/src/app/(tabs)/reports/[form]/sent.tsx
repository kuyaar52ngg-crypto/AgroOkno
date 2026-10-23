import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleCheck, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isFormCode, periodText, shortName, useObligation } from '@/components/reports';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Cards';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateTime, fmtDateTimeDot } from '@/constants/format';
import { AUTHORITY_LABEL } from '@/constants/labels';
import { Colors, Radius } from '@/constants/theme';
import { getReceiptUrl } from '@/data';
import { openUrl } from '@/hooks/open-url';

/** C7 · Отчет отправлен. */
export default function ReportSentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ form: string; receipt?: string; at?: string; recipient?: string }>();
  const form = isFormCode(params.form) ? params.form : '1-tabun';
  const { obligation, period } = useObligation(form);
  const name = shortName(form);
  const receiptNo = params.receipt ?? obligation?.receipt_no ?? '';
  const at = params.at ?? obligation?.submitted_at ?? null;
  const recipient = params.recipient ?? (obligation ? AUTHORITY_LABEL[obligation.authority] : '—');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (!receiptNo) return;
    setBusy(true);
    setError(null);
    try {
      await openUrl(await getReceiptUrl(receiptNo), `${receiptNo}.txt`);
    } catch {
      setError('Не удалось открыть квитанцию. Повторите попытку.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Отчет отправлен"
      subtitle={`Результат после подтверждения ${name}`}
      back={{ label: 'Мои отчеты', fallback: '/reports' }}
    >
      <View style={styles.result}>
        <View style={styles.circle}>
          <Icon icon={CircleCheck} size={28} color={Colors.success} />
        </View>
        <Text variant="bodyLg" align="center" style={{ fontFamily: 'Onest_600SemiBold' }}>
          {`${name} · отправлен`}
        </Text>
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          Учебное последующее состояние после вашего подтверждения.
        </Text>
      </View>
      <DataTable
        title="Сведения об отправке"
        rows={[
          { label: 'Получатель', value: recipient },
          { label: 'Период', value: periodText(period) },
          { label: 'Время', value: fmtDateTime(at) },
        ]}
      />
      <View style={styles.receipt}>
        <Icon icon={FileText} size={22} color={Colors.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" style={{ fontSize: 13 }}>
            Учебная квитанция
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {receiptNo}
          </Text>
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {fmtDateTimeDot(at)}
          </Text>
        </View>
      </View>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <View style={{ gap: 12 }}>
        <Button title="Открыть квитанцию" icon={FileText} onPress={open} loading={busy} loadingTitle="Готовим файл…" />
        <Button title="К отчетам" variant="secondary" onPress={() => router.navigate('/reports')} />
      </View>
      <Alert>Это демонстрационный результат: реальная сдача в ведомство не выполняется. Статус отчета в списке обновлен.</Alert>
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
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receipt: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});
