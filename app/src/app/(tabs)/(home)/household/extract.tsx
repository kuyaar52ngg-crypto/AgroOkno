import { Download, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { herdRows } from '@/components/herd';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { fmtDate, fmtHeads, fmtNum, plural, todayIso } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useHousehold, useHouseholdExtract } from '@/data';
import { openUrl } from '@/hooks/open-url';

/** D4 · Выписка из книги (предварительный просмотр PDF). */
export default function ExtractScreen() {
  const household = useHousehold();
  const extract = useHouseholdExtract();
  const [error, setError] = useState<string | null>(null);
  const data = household.data;
  const farm = data?.farm;
  const rows = herdRows(data?.livestock);
  const today = fmtDate(todayIso());

  const download = async () => {
    setError(null);
    try {
      const result = await extract.run();
      await openUrl(result.url, `vypiska-${farm?.book_record_no ?? 'knigi'}.pdf`);
    } catch {
      setError('Не удалось сформировать PDF. Повторите попытку.');
    }
  };

  const share = async () => {
    setError(null);
    try {
      const result = await extract.run();
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void> };
        if (nav.share) await nav.share({ title: 'Выписка из похозяйственной книги', url: result.url });
        else await openUrl(result.url);
        return;
      }
      await Share.share({ message: `Выписка из похозяйственной книги · запись № ${farm?.book_record_no ?? ''}`, url: result.url });
    } catch {
      setError('Не удалось поделиться выпиской.');
    }
  };

  const members = data?.members ?? [];

  return (
    <Screen
      title="Выписка из книги"
      subtitle="Предварительный просмотр · PDF"
      back={{ label: 'Мое ЛПХ', fallback: '/household' }}
      loading={household.loading}
    >
      {data && farm ? (
        <>
          <View style={styles.paper}>
            <Text variant="caption" color={Colors.primary} align="center" style={styles.stamp}>
              УЧЕБНЫЙ ДОКУМЕНТ
            </Text>
            <Text variant="bodyLg" align="center" style={{ fontFamily: 'Onest_600SemiBold' }}>
              Выписка из похозяйственной книги
            </Text>
            <Text variant="small" align="center" color={Colors.textSecondaryReadable}>
              {`Запись № ${farm.book_record_no ?? '—'} · ${today}`}
            </Text>
            <View style={styles.rule} />
            <Text variant="label">{farm.name}</Text>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {[farm.region, farm.settlement, farm.address].filter(Boolean).join(', ')}
            </Text>
            {farm.plot_area_m2 !== null ? (
              <View style={styles.pair}>
                <Text variant="small">Участок</Text>
                <Text variant="label">{`${fmtNum(farm.plot_area_m2)} кв.м`}</Text>
              </View>
            ) : null}
            <View style={styles.rule} />
            {farm.cadastral_no ? (
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {`Кадастровый номер: ${farm.cadastral_no}`}
              </Text>
            ) : null}
            <Text variant="label" style={{ fontSize: 13 }}>
              {`Члены хозяйства · ${members.length} ${plural(members.length, ['человек', 'человека', 'человек'])}`}
            </Text>
            {members.map((m) => (
              <Text key={m.id} variant="caption" color={Colors.textSecondaryReadable}>
                {`${m.full_name} — ${m.is_head ? 'глава ЛПХ' : `член ЛПХ`}`}
              </Text>
            ))}
            <Text variant="label" style={{ fontSize: 13 }}>{`Поголовье на ${today}`}</Text>
            <View>
              {rows.map((row) => (
                <View key={row.key} style={[styles.pair, styles.line]}>
                  <Text variant="small">{row.label}</Text>
                  <Text variant="label">{fmtHeads(row.heads)}</Text>
                </View>
              ))}
              <View style={[styles.pair, styles.line]}>
                <Text variant="small">Всего</Text>
                <Text variant="label">{fmtHeads(data.livestock.total)}</Text>
              </View>
            </View>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              Сведения сформированы из демонстрационной записи хозяйства. Документ не имеет юридической силы.
            </Text>
          </View>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <View style={{ gap: 12 }}>
            <Button title="Скачать PDF" icon={Download} onPress={download} loading={extract.pending} loadingTitle="Формируем PDF…" />
            <Button title="Поделиться" icon={Share2} variant="secondary" onPress={share} disabled={extract.pending} />
          </View>
          <Alert>Учебное превью без официальной подписи, печати и QR-кода.</Alert>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  paper: {
    padding: 16,
    gap: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stamp: { fontFamily: 'Onest_600SemiBold', letterSpacing: 0.4 },
  rule: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  line: { minHeight: 38, borderBottomWidth: 1, borderBottomColor: Colors.border },
});
