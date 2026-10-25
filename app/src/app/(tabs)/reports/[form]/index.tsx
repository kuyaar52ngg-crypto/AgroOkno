import { useLocalSearchParams, useRouter } from 'expo-router';
import Download from 'lucide-react-native/icons/download';
import FileText from 'lucide-react-native/icons/file-text';
import Send from 'lucide-react-native/icons/send';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isFormCode, previewHeaderLines, shortName, useObligation } from '@/components/reports';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/Cards';
import { CheckBox } from '@/components/ui/Controls';
import { Alert, Badge, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateTimeDot, fmtNum } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { getReceiptUrl, getReportDownloadUrl, useFarm, useReportPreview, useSyncStatus } from '@/data';
import type { FormCode, ReportObligation, ReportPreview } from '@/data/contract';
import { openUrl } from '@/hooks/open-url';

const FOOTNOTE: Partial<Record<FormCode, string>> = {
  '10-sh': 'Показатели и квитанция — учебные. Таблица не воспроизводит официальный бланк.',
  '1-ip': 'Демонстрационная структура и показатели. Не официальный бланк.',
  '3-fermer-month': 'Учебное превью и квитанция. Не официальный бланк.',
};

function statusBadge(status: ReportObligation['status']) {
  switch (status) {
    case 'submitted':
      return <Badge tone="success" label="Сдан" />;
    case 'overdue':
      return <Badge tone="overdue" label="Просрочен" />;
    case 'draft':
      return <Badge tone="draft" label="Черновик" />;
    case 'failed':
      return <Badge tone="overdue" label="Не отправлен" />;
    default:
      return <Badge tone="neutral" label="Не начат" />;
  }
}

function PreviewSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <Skeleton height={112} radius={18} />
      <Skeleton height={220} radius={18} />
      <Skeleton height={140} radius={18} />
    </View>
  );
}

/** C1–C5 · Превью формы: 1-ТАБУН, 10-СХ, 1-ИП, 1-ИСО-р, 3-фермер (рег). */
export default function ReportPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ form: string; year?: string }>();
  const form = isFormCode(params.form) ? params.form : null;
  const sync = useSyncStatus();
  const farm = useFarm();
  const { reports, obligation, period } = useObligation(form ?? '1-tabun', params.year ? Number(params.year) : undefined);
  const preview = useReportPreview(form ?? '1-tabun', period);
  const [busy, setBusy] = useState<'receipt' | 'blank' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!form) {
    return (
      <Screen title="Форма не найдена" back={{ label: 'Мои отчеты', fallback: '/reports' }}>
        <Alert tone="warning">Такой формы нет в списке обязательств хозяйства.</Alert>
        <Button title="К отчетам" onPress={() => router.navigate('/reports')} />
      </Screen>
    );
  }

  const loading = reports.loading || preview.loading;
  const data: ReportPreview | undefined = preview.data;
  const o = data?.obligation ?? obligation;
  const respondent = data?.respondent ?? [farm.data?.name, farm.data?.settlement].filter(Boolean).join(' · ');
  const name = shortName(form);
  const submitted = o?.status === 'submitted';
  const receipt = data?.receipt ?? (o?.receipt_no && o.submitted_at ? { receipt_no: o.receipt_no, submitted_at: o.submitted_at } : null);
  const lines = o ? previewHeaderLines(o, respondent) : [];

  const downloadReceipt = async () => {
    if (!receipt) return;
    setBusy('receipt');
    setError(null);
    try {
      await openUrl(await getReceiptUrl(receipt.receipt_no), `${receipt.receipt_no}.txt`);
    } catch {
      setError('Не удалось получить квитанцию. Повторите попытку.');
    } finally {
      setBusy(null);
    }
  };

  const downloadBlank = async () => {
    setBusy('blank');
    setError(null);
    try {
      const url = await getReportDownloadUrl(form, period);
      if (url) await openUrl(url, `${form}-${period.year}.xlsx`);
      else setError('Для этой формы нет официального бланка XLSX.');
    } catch {
      setError('Не удалось скачать бланк. Повторите попытку.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title={`Превью · ${name}`}
      subtitle={o?.status === 'overdue' || o?.status === 'draft' ? (form === '1-iso-r' ? o.description : 'Проверьте данные перед отправкой') : o?.description}
      back={{ label: 'Мои отчеты', fallback: '/reports' }}
      loading={loading}
      skeleton={<PreviewSkeleton />}
      fromCache={preview.fromCache}
    >
      {data && o ? (
        <>
          <View style={styles.card}>
            <View style={styles.head}>
              <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
                {name}
              </Text>
              {statusBadge(o.status)}
            </View>
            <Text variant="small">{lines[0]}</Text>
            <Text variant="caption" color={o.status === 'overdue' ? Colors.textErrorReadable : Colors.textSecondaryReadable}>
              {lines[1]}
            </Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {lines[2]}
            </Text>
          </View>

          {data.sections.map((section) =>
            section.rows.length === 0 ? (
              <View key={section.title} style={styles.card}>
                <Text variant="bodyLg" style={{ fontFamily: 'Onest_600SemiBold' }}>
                  {section.title}
                </Text>
                {section.description?.split('\n').map((line) => (
                  <Text key={line} variant="caption" color={Colors.textSecondaryReadable}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : (
              <DataTable
                key={section.title}
                title={section.title}
                description={section.description}
                rows={section.rows.map((r) => ({
                  label: r.label,
                  value: typeof r.value === 'number' ? `${fmtNum(r.value)}${r.unit ? ` ${r.unit}` : ''}` : `${r.value}${r.unit ? ` ${r.unit}` : ''}`,
                }))}
              />
            ),
          )}

          {data.checks.length === 1 ? (
            <Alert tone={data.checks[0].ok ? 'success' : 'error'}>{data.checks[0].label}</Alert>
          ) : data.checks.length > 1 ? (
            <View style={styles.card}>
              <Text variant="label" style={{ fontSize: 13 }}>
                Проверка данных
              </Text>
              {data.checks.map((check) => (
                <CheckBox key={check.label} checked={check.ok} tone="success" label={check.label} />
              ))}
            </View>
          ) : null}

          {(data.notes ?? []).map((note) => (
            <Alert key={note}>{note}</Alert>
          ))}
          {o.status === 'draft' ? (
            <Alert>Демонстрационная структура таблицы, не точный официальный бланк. Перед отправкой проверьте состав показателей и период.</Alert>
          ) : null}

          {receipt ? (
            <View style={styles.receipt}>
              <Icon icon={FileText} size={22} color={Colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" style={{ fontSize: 13 }}>
                  Учебная квитанция
                </Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {receipt.receipt_no}
                </Text>
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  {fmtDateTimeDot(receipt.submitted_at)}
                </Text>
              </View>
            </View>
          ) : null}

          {error ? <Alert tone="error">{error}</Alert> : null}

          {submitted ? (
            <View style={{ gap: 12 }}>
              {receipt ? <Button title="Скачать квитанцию" icon={Download} onPress={downloadReceipt} loading={busy === 'receipt'} loadingTitle="Готовим файл…" /> : null}
              {o.has_official_blank ? (
                <Button title="Скачать бланк XLSX" icon={Download} variant="secondary" onPress={downloadBlank} loading={busy === 'blank'} loadingTitle="Готовим файл…" />
              ) : null}
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {FOOTNOTE[form] ?? 'Демонстрационное превью. Не официальный бланк.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {o.status !== 'draft' ? (
                <Text variant="caption" color={Colors.textSecondaryReadable}>
                  Демонстрационное превью, не официальный бланк. Источник — единый учет хозяйства. Отправка только после подтверждения.
                </Text>
              ) : null}
              {o.has_official_blank ? (
                <Button title="Скачать бланк XLSX" icon={Download} variant="secondary" onPress={downloadBlank} loading={busy === 'blank'} loadingTitle="Готовим файл…" />
              ) : null}
              <Button
                title="Проверить и отправить"
                icon={Send}
                disabled={!sync.online}
                onPress={() =>
                  router.push({
                    pathname: '/reports/[form]/confirm',
                    params: { form, year: String(period.year) },
                  })
                }
              />
              {!sync.online ? (
                <Text variant="caption" color={Colors.warningReadable} align="center">
                  Отправка недоступна без подключения. Данные сохранены на устройстве.
                </Text>
              ) : o.status === 'draft' ? (
                <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
                  Черновик сохранен · еще не отправлен
                </Text>
              ) : null}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
