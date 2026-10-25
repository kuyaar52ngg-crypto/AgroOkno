import { useRouter } from 'expo-router';
import Calendar from 'lucide-react-native/icons/calendar';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { obligationMeta } from '@/components/reports';
import { Screen } from '@/components/Screen';
import { ReportCard } from '@/components/ui/Cards';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Select';
import { Text } from '@/components/ui/Text';
import { todayIso } from '@/constants/format';
import { Colors } from '@/constants/theme';
import { useReports } from '@/data';
import type { ReportObligation } from '@/data/contract';

function Section({ title, right, hint, items, onOpen }: { title: string; right?: string; hint?: string; items: ReportObligation[]; onOpen: (o: ReportObligation) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHead}>
        <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {right ? (
          <Text variant="caption" color={Colors.textSecondaryReadable}>
            {right}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text variant="caption" color={Colors.textErrorReadable} style={{ marginTop: -8, fontFamily: 'Onest_500Medium' }}>
          {hint}
        </Text>
      ) : null}
      {items.map((o) => (
        <ReportCard key={o.form_code} title={o.title} description={o.description} status={o.status} meta={obligationMeta(o)} onPress={() => onOpen(o)} />
      ))}
    </View>
  );
}

/** Мои отчеты (46:4788). */
export default function ReportsScreen() {
  const router = useRouter();
  const currentYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(String(currentYear));
  const reports = useReports(Number(year));
  const list = reports.data ?? [];
  const federal = list.filter((o) => o.scope === 'federal');
  const regional = list.filter((o) => o.scope === 'regional');
  const overdue = regional.filter((o) => o.status === 'overdue').length;
  const open = (o: ReportObligation) =>
    router.push({ pathname: '/reports/[form]', params: { form: o.form_code, year: String(o.period.year), ...(o.period.month ? { month: String(o.period.month) } : {}) } });

  return (
    <Screen
      title="Мои отчеты"
      subtitle="Все формы хозяйства в одном месте"
      loading={false}
      fromCache={reports.fromCache}
      onRefresh={reports.refetch}
    >
      <Select
        value={year}
        options={[
          { value: String(currentYear), label: `Текущие обязательства · ${currentYear}` },
          { value: String(currentYear - 1), label: `Архив · ${currentYear - 1}` },
        ]}
        onChange={setYear}
        sheetTitle="Период отчетности"
        leadingIcon={Calendar}
      />

      {reports.loading ? (
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={117} radius={16} />
          ))}
        </View>
      ) : null}

      {!reports.loading && list.length === 0 ? <Alert>{`За ${year} год обязательств по отчетности нет.`}</Alert> : null}

      {!reports.loading && federal.length > 0 ? (
        <Section
          title="Федеральные"
          right={`${federal.filter((o) => o.status === 'submitted').length} из ${federal.length} сдано`}
          items={federal}
          onOpen={open}
        />
      ) : null}
      {!reports.loading && regional.length > 0 ? (
        <Section
          title="Республиканские (Сахастат)"
          hint={overdue > 0 ? `${overdue} просрочен · требует внимания` : undefined}
          items={regional}
          onOpen={open}
        />
      ) : null}

      {!reports.loading && list.length > 0 ? (
        <Alert icon={RefreshCw}>Росстат, Сахастат, Меркурий и ЭПК используют единые данные хозяйства.</Alert>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
});
