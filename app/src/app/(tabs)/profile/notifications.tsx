import { useRouter } from 'expo-router';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import FileCheck from 'lucide-react-native/icons/file-check';
import FilePenLine from 'lucide-react-native/icons/file-pen-line';
import Megaphone from 'lucide-react-native/icons/megaphone';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { SegmentedTabs } from '@/components/ui/Controls';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { fmtDateOfTime, fmtDateTimeDot, fmtTime, plural } from '@/constants/format';
import { Colors, Radius } from '@/constants/theme';
import { useFarm, useMarkNotificationsRead, useNotifications } from '@/data';
import type { AppNotification } from '@/data/contract';

const KIND_ICON: Record<AppNotification['kind'], { icon: LucideIcon; color: string }> = {
  overdue: { icon: CircleAlert, color: Colors.error },
  deadline: { icon: FilePenLine, color: Colors.warning },
  sync: { icon: RefreshCw, color: Colors.success },
  submitted: { icon: FileCheck, color: Colors.success },
  admin: { icon: Megaphone, color: Colors.primary },
};

type Filter = 'all' | 'new';

/** F3 · Уведомления. */
export default function NotificationsScreen() {
  const router = useRouter();
  const farm = useFarm();
  const notifications = useNotifications();
  const mark = useMarkNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');
  const all = notifications.data ?? [];
  const unread = all.filter((n) => !n.read).length;
  const list = filter === 'new' ? all.filter((n) => !n.read) : all;

  const open = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await mark.run({ ids: [n.id] });
      } catch {
        // отметка о прочтении не критична для перехода
      }
    }
    if (n.form_code) router.push({ pathname: '/reports/[form]', params: { form: n.form_code } });
  };

  return (
    <Screen
      title="Уведомления"
      subtitle={`Важное для ${farm.data?.name ?? 'хозяйства'} · ${unread} ${plural(unread, ['новое', 'новых', 'новых'])}`}
      back={{ label: 'Профиль', fallback: '/profile' }}
      loading={notifications.loading}
      fromCache={notifications.fromCache}
      onRefresh={notifications.refetch}
    >
      <SegmentedTabs
        options={[
          { value: 'all', label: 'Все' },
          { value: 'new', label: 'Новые' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <View style={{ gap: 12 }}>
        <Button title="Открыть чат-помощника" onPress={() => router.push('/assistant')} />
        <Button title="Настроить напоминания" variant="secondary" onPress={() => router.push('/reminders')} />
      </View>
      <View style={{ gap: 12 }}>
        {list.map((n) => {
          const kind = KIND_ICON[n.kind];
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${n.title}. ${n.body}. ${n.read ? 'Прочитано' : 'Новое'}`}
              onPress={() => open(n)}
              style={styles.card}
            >
              <View style={styles.head}>
                <Icon icon={kind.icon} size={20} color={kind.color} />
                <Text variant="bodySemibold" style={{ flex: 1 }}>
                  {n.title}
                </Text>
                {!n.read ? <View style={styles.dot} /> : null}
              </View>
              <Text variant="caption" color={Colors.textSecondaryReadable}>
                {n.body}
              </Text>
              <Text variant="caption" color={Colors.textSecondary}>
                {`${fmtDateOfTime(n.created_at)} · ${fmtTime(n.created_at)} · ${n.read ? 'Прочитано' : 'Новое'}`}
              </Text>
            </Pressable>
          );
        })}
        {list.length === 0 ? (
          <Alert>{filter === 'new' ? 'Новых уведомлений нет.' : 'Уведомлений пока нет.'}</Alert>
        ) : null}
      </View>
      <View style={{ gap: 12 }}>
        <Button
          title="Отметить все прочитанными"
          variant="secondary"
          disabled={unread === 0}
          loading={mark.pending}
          loadingTitle="Отмечаем…"
          onPress={() => mark.run({})}
        />
        <Text variant="caption" color={Colors.textSecondaryReadable} align="center">
          {`Демонстрационные уведомления · на ${fmtDateTimeDot(all[0]?.created_at).split(' · ')[0]}`}
        </Text>
      </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
});
