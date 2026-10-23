import { useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { daysWord, fmtDateLong } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useUpcomingDeadlines } from '@/data';

/** Блок «Помощник» на главной: ближайший срок, микрофон (сразу запись) и «Открыть помощника». */
export function AssistantBlock() {
  const router = useRouter();
  const deadlines = useUpcomingDeadlines();
  const list = deadlines.data ?? [];
  const next = list.find((d) => d.days_left >= 0) ?? list[0];
  const overdue = next ? next.days_left < 0 : false;
  const late = next ? Math.abs(next.days_left) : 0;

  const title = !next
    ? 'Ближайших сроков нет'
    : overdue
      ? `${next.title} просрочен на ${late} ${daysWord(late)}`
      : `До сдачи ${next.title} осталось ${next.days_left} ${daysWord(next.days_left)}`;
  const sub = next ? `${overdue ? 'Срок истек' : 'Срок:'} ${fmtDateLong(next.due_on)}` : 'Спросите помощника об отчетах или запишите надой.';

  return (
    <View style={{ gap: 16 }}>
      <Text variant="title" accessibilityRole="header">
        Помощник
      </Text>
      <View style={styles.card}>
        {deadlines.loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={16} width="75%" />
            <Skeleton height={12} width="50%" />
          </View>
        ) : (
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="subtitle" color={overdue ? Colors.textErrorReadable : Colors.text} style={{ lineHeight: 22 }}>
                {title}
              </Text>
              <Text variant="small" color={Colors.textSecondaryReadable}>
                {sub}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Записать голосом"
              accessibilityHint="Откроет помощника и сразу начнет запись"
              onPress={() => router.push({ pathname: '/assistant', params: { record: '1' } })}
              hitSlop={2}
              style={styles.mic}
              testID="home-assistant-mic"
            >
              <Icon icon={Mic} size={20} color={Colors.primary} />
            </Pressable>
          </View>
        )}
        <View style={styles.foot}>
          <Text variant="caption" color={Colors.textSecondaryReadable} style={{ flex: 1 }}>
            Напиши «Помоги с 1-ИСО-р» или используй голосовой ввод
          </Text>
          <Button title="Открыть помощника" compact onPress={() => router.push('/assistant')} style={styles.open} testID="home-assistant-open" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 16,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceInfoSoft },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  open: { alignSelf: 'auto', flexShrink: 0, paddingHorizontal: 20 },
});
