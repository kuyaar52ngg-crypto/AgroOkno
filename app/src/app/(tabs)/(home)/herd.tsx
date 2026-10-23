import { useRouter } from 'expo-router';
import { FileText, Minus, Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/Cards';
import { Text } from '@/components/ui/Text';
import { daysBetween, fmtDayMonth, fmtHeads, headsWord, monthName, plural, todayIso } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useFarm, useHorseHerd, useReports } from '@/data';

function MovementRow({ sign, label, value, unit, last }: { sign: '+' | '−'; label: string; value: number; unit: string; last?: boolean }) {
  const positive = sign === '+';
  return (
    <View style={[styles.moveRow, !last && styles.moveBorder]}>
      <View style={[styles.signCircle, positive && { backgroundColor: Colors.surfaceSuccess }]}>
        <Icon icon={positive ? Plus : Minus} size={14} color={positive ? Colors.success : Colors.textSecondary} />
      </View>
      <Text variant="small" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodySemibold" color={positive ? Colors.success : Colors.textSecondaryReadable}>
        {`${sign}${value}`}
      </Text>
      <Text variant="caption" color={Colors.textSecondary} style={{ minWidth: 52 }}>
        {unit}
      </Text>
    </View>
  );
}

/** Учет табуна (46:4871). */
export default function HerdScreen() {
  const router = useRouter();
  const farm = useFarm();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const herd = useHorseHerd({ year, month });
  const reports = useReports(year);
  const obligation = (reports.data ?? []).find((r) => r.form_code === '1-tabun');
  const overdue = obligation?.status === 'overdue';
  const h = herd.data;

  return (
    <Screen
      title="Табунное коневодство"
      subtitle={`${farm.data?.name ?? 'Хозяйство'} · учет табуна`}
      back={{ label: 'Мое хозяйство', fallback: '/' }}
      loading={herd.loading}
      fromCache={herd.fromCache}
    >
      {h ? (
        <>
          <View style={styles.formRow}>
            <Text variant="label" color={Colors.textSecondaryReadable}>
              {`1-ТАБУН · ${obligation ? 'Сахастат' : 'Сахастат'}`}
            </Text>
            {obligation ? (
              <Badge tone={overdue ? 'overdue' : obligation.status === 'submitted' ? 'success' : 'draft'} label={overdue ? 'Просрочен' : obligation.status === 'submitted' ? 'Сдан' : 'Черновик'} />
            ) : null}
          </View>
          <View style={{ gap: 8 }}>
            <View style={styles.stats}>
              <StatCard label="Всего лошадей" value={h.total} unit={headsWord(h.total)} tone="primary" />
              <StatCard label="Кобылы" value={h.mares} unit={headsWord(h.mares)} />
              <StatCard label="Молодняк" value={h.young} unit={headsWord(h.young)} />
            </View>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {`Также в табуне: ${h.stallions} ${plural(h.stallions, ['взрослый жеребец', 'взрослых жеребца', 'взрослых жеребцов'])}`}
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <View style={styles.formRow}>
              <Text variant="title" accessibilityRole="header">
                Движение табуна
              </Text>
              <Text variant="caption" color={Colors.textSecondaryReadable}>{`${monthName(month)} ${year}`}</Text>
            </View>
            <View style={styles.moves}>
              <MovementRow sign="+" label="Родилось" value={h.born} unit={plural(h.born, ['жеребенок', 'жеребенка', 'жеребят'])} />
              <MovementRow sign="−" label="Пало" value={h.died} unit={headsWord(h.died)} />
              <MovementRow sign="−" label="Забито" value={h.slaughtered} unit={headsWord(h.slaughtered)} last={h.sold === 0} />
              {h.sold > 0 ? <MovementRow sign="−" label="Продано" value={h.sold} unit={headsWord(h.sold)} last /> : null}
            </View>
            <Text variant="caption" color={Colors.textSecondaryReadable}>
              {`На 1 ${monthNameGenitiveLower(month)}: ${h.opening} ${headsWord(h.opening)} + ${h.born} − ${h.died} − ${h.slaughtered}${h.sold ? ` − ${h.sold}` : ''} = ${fmtHeads(h.total)}. Все события учтены в отчете.`}
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            <Button
              title="Сформировать отчет для Сахастата"
              icon={FileText}
              onPress={() => router.push({ pathname: '/reports/[form]', params: { form: '1-tabun' } })}
            />
            {overdue && obligation ? (
              <Text variant="caption" color={Colors.textErrorReadable} align="center" style={{ fontFamily: 'Onest_500Medium' }}>
                {`Срок сдачи истек ${fmtDayMonth(obligation.due_on)}${daysBetween(obligation.due_on, today) > 0 ? '' : ''}`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const GENITIVE_LOWER = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function monthNameGenitiveLower(month: number): string {
  return GENITIVE_LOWER[month - 1] ?? '';
}

const styles = StyleSheet.create({
  formRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stats: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  moves: {
    paddingHorizontal: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  moveRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  moveBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  signCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
});
