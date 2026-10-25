import { useRouter } from 'expo-router';
import PawPrint from 'lucide-react-native/icons/paw-print';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Badge, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { plural } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useHorriot } from '@/data';

const DIFF_WORD: [string, string, string] = ['расхождение', 'расхождения', 'расхождений'];
const RECORD_WORD: [string, string, string] = ['запись', 'записи', 'записей'];

/** Блок «Сверка с Хорриот» для вкладки «Скот» книги ЛПХ: кратко и ссылка на экран Хорриота. */
export function HorriotReconcileBlock() {
  const router = useRouter();
  const horriot = useHorriot();
  const state = horriot.data;

  if (horriot.loading) {
    return (
      <View style={styles.card}>
        <Skeleton height={16} width="45%" />
        <Skeleton height={12} width="80%" />
        <Skeleton height={48} radius={10} />
      </View>
    );
  }
  if (!state) return null;

  const connected = state.connection.status === 'connected_demo';
  const mismatches = state.reconciliation.filter((r) => r.diff !== 0);
  const pending = state.pending_count;

  let badge = <Badge tone="neutral" label="Не подключено" />;
  let text = 'Подключите «Хорриот» (учет животных во ФГИС ВетИС), чтобы сверять поголовье книги с записями об учете животных.';
  if (connected && mismatches.length === 0) {
    badge = <Badge tone="success" label="Совпадает" />;
    text = state.reconciliation.length === 0 ? 'Пока нет поголовья для сверки.' : 'Поголовье в книге и записи в Хорриоте совпадают.';
  } else if (connected) {
    badge = <Badge tone="draft" icon={TriangleAlert} label={`${mismatches.length} ${plural(mismatches.length, DIFF_WORD)}`} />;
    const names = mismatches
      .slice(0, 3)
      .map((r) => r.label)
      .join(', ');
    text = `Расходятся: ${names}${mismatches.length > 3 ? ' и др.' : ''}.`;
    if (pending > 0) text += ` Не передано ${pending} ${plural(pending, RECORD_WORD)}.`;
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconBox}>
          <Icon icon={PawPrint} size={22} color={Colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="bodySemibold" accessibilityRole="header">
            Сверка с Хорриот
          </Text>
          {badge}
        </View>
      </View>
      <Text variant="small" color={Colors.textSecondaryReadable} style={{ lineHeight: 21 }}>
        {text}
      </Text>
      <Button
        title={connected ? 'Открыть Хорриот' : 'Подключить Хорриот'}
        variant={connected && mismatches.length === 0 ? 'secondary' : 'primary'}
        compact
        onPress={() => router.push('/horriot')}
      />
      <Text variant="caption" color={Colors.textSecondaryReadable}>
        Учебный режим: реальной связи с ФГИС ВетИС нет.
      </Text>
    </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceInfoSoft, alignItems: 'center', justifyContent: 'center' },
});
